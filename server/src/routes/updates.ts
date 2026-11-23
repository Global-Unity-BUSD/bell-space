import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';

import type { Update } from '../../../shared/api.ts';
import { needPermission } from '../auth.ts';
import type { Config } from '../config.ts';
import type { Db, Tx } from '../db.ts';
import { HttpError } from '../errors.ts';

// Matches the check on updates.photo_path in the migration.
const PHOTO_NAME = /^[a-z0-9-]{8,80}\.(jpg|png|webp|heic)$/;
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The image type from the file's first bytes (not from what the browser claims). */
function sniffImage(b: Buffer): keyof typeof MIME | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('latin1', 4, 8) === 'ftyp' && /^(heic|heix|mif1|msf1)$/.test(b.toString('latin1', 8, 12))) return 'heic';
  return null;
}

const FIELDS = ['title', 'starts_at', 'location', 'body', 'photo_path', 'status'] as const;
const updateBody = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 120 },
    starts_at: { type: ['string', 'null'], format: 'date-time' },
    location: { type: ['string', 'null'], maxLength: 120 },
    body: { type: 'string', maxLength: 600 },
    photo_path: { type: ['string', 'null'], pattern: PHOTO_NAME.source },
    status: { enum: ['draft', 'published'] },
  },
};

const withUrl = (u: Omit<Update, 'photo_url'>): Update =>
  ({ ...u, photo_url: u.photo_path ? `/v1/updates/photos/${u.photo_path}` : null });

export function registerUpdates(app: FastifyInstance, db: Db, config: Config) {
  const photoDir = join(config.dataDir, 'photos');

  /** Delete a photo file no update uses any more. */
  const dropIfUnused = async (tx: Tx, path: string | null | undefined) => {
    if (!path) return;
    const [{ used } = { used: true }] = await tx.query<{ used: boolean }>(
      'select exists (select 1 from updates where photo_path = $1) as used', [path]);
    if (!used) await unlink(join(photoDir, path)).catch(() => {});
  };

  // Published updates for everyone; editors also get drafts.
  app.get('/v1/updates', async (req) => {
    const list = await db.as(req.me?.id ?? null, (tx) => tx.query<Omit<Update, 'photo_url'>>(
      `select id, title, starts_at, location, body, photo_path, sample, status, published_at, updated_at
       from updates order by status = 'published', published_at desc nulls first, updated_at desc limit 100`));
    return { updates: list.map(withUrl) };
  });

  app.post('/v1/updates', { schema: { body: { ...updateBody, required: ['title'] } } }, async (req) => {
    const me = needPermission(req, 'updates');
    const body = req.body as Record<string, unknown>;
    const keys = FIELDS.filter((k) => k in body);
    const row = await db.as(me.id, async (tx) => (await tx.query<Omit<Update, 'photo_url'>>(
      `insert into updates (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      keys.map((k) => body[k])))[0]!);
    return { update: withUrl(row) };
  });

  app.patch('/v1/updates/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, body: updateBody },
  }, async (req) => {
    const me = needPermission(req, 'updates');
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const keys = FIELDS.filter((k) => k in body);
    if (!keys.length) throw new HttpError(400, 'Nothing to change.');
    const row = await db.as(me.id, async (tx) => {
      const [old] = await tx.query<{ photo_path: string | null }>('select photo_path from updates where id = $1', [id]);
      if (!old) throw new HttpError(404, 'That update does not exist.');
      const [next] = await tx.query<Omit<Update, 'photo_url'>>(
        `update updates set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1 returning *`,
        [id, ...keys.map((k) => body[k])]);
      if (old.photo_path !== next!.photo_path) await dropIfUnused(tx, old.photo_path);
      return next!;
    });
    return { update: withUrl(row) };
  });

  app.delete('/v1/updates/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (req) => {
    const me = needPermission(req, 'updates');
    const { id } = req.params as { id: string };
    await db.as(me.id, async (tx) => {
      const [gone] = await tx.query<{ photo_path: string | null }>('delete from updates where id = $1 returning photo_path', [id]);
      if (!gone) throw new HttpError(404, 'That update does not exist.');
      await dropIfUnused(tx, gone.photo_path);
    });
    return { ok: true };
  });

  // Upload a photo for an update (multipart field "photo"). Returns its name for photo_path.
  app.post('/v1/updates/photos', async (req) => {
    needPermission(req, 'updates');
    const file = await req.file({ limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });
    if (!file) throw new HttpError(400, 'Choose a photo first.');
    const bytes = await file.toBuffer();
    const ext = sniffImage(bytes);
    if (!ext) throw new HttpError(400, 'Use a JPEG, PNG, WebP or HEIC photo.');
    const name = `${randomUUID()}.${ext}`;
    await mkdir(photoDir, { recursive: true });
    await writeFile(join(photoDir, name), bytes, { flag: 'wx' });
    return { photo_path: name, photo_url: `/v1/updates/photos/${name}` };
  });

  // A photo is visible when a visible update uses it (drafts: editors only), or to editors.
  app.get('/v1/updates/photos/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!PHOTO_NAME.test(name)) throw new HttpError(404, 'Not found.');
    const [{ ok, published } = { ok: false, published: false }] = await db.as(req.me?.id ?? null, (tx) =>
      tx.query<{ ok: boolean; published: boolean }>(
        `select exists (select 1 from updates where photo_path = $1) or has_permission('updates') as ok,
                exists (select 1 from updates where photo_path = $1 and status = 'published') as published`, [name]));
    if (!ok) throw new HttpError(404, 'Not found.');
    const path = join(photoDir, name);
    const info = await stat(path).catch(() => null);
    if (!info) throw new HttpError(404, 'Not found.');
    reply.header('content-type', MIME[name.split('.').pop()!]!);
    reply.header('content-length', info.size);
    reply.header('cache-control', published ? 'public, max-age=3600' : 'private, no-store');
    return reply.send(createReadStream(path));
  });
}
