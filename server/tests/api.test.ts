// The HTTP API end to end (Fastify inject, in-memory PGlite): sign-in, the
// website cookie guard, Updates with photos, the support flow and accounts.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildApp } from '../src/app.ts';
import { hashPassword } from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';
import { tempDir, testDb, type Who } from './helpers.ts';

const PASSWORD = 'test-password-1';
const EMAIL: Record<Who, string> = {
  sam: 'student1@bellspace.test', riley: 'student2@bellspace.test', gina: 'guide1@bellspace.test',
  omar: 'guide2@bellspace.test', uma: 'staff-updates@bellspace.test', sofia: 'staff-support@bellspace.test',
  max: 'staff-admin@bellspace.test',
};

async function setup() {
  const t = await testDb(await hashPassword(PASSWORD));
  const config = { ...loadConfig({}), dataDir: tempDir(), webDir: join(tmpdir(), 'no-web') };
  const app = await buildApp(t.db, config);
  const tokens = {} as Record<Who, string>;
  const signIn = async (who: Who) => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/sign-in', payload: { email: EMAIL[who], password: PASSWORD, client: 'app' } });
    assert.equal(res.statusCode, 200, res.body);
    return (tokens[who] = res.json().token as string);
  };
  /** A JSON call as `who` (bearer token), or signed out. */
  const call = async (who: Who | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) => {
    const headers: Record<string, string> = {};
    if (who) headers.authorization = `Bearer ${tokens[who] ?? await signIn(who)}`;
    const res = await app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
    return { status: res.statusCode, body: res.json() as Record<string, any> };
  };
  return { ...t, app, config, call, signIn };
}

test('sign-in: wrong password, app token, /v1/me, sign-out', async () => {
  const t = await setup();
  const bad = await t.app.inject({ method: 'POST', url: '/v1/auth/sign-in', payload: { email: EMAIL.sam, password: 'nope', client: 'app' } });
  assert.equal(bad.statusCode, 401);
  assert.equal((await t.call(null, 'GET', '/v1/me')).status, 401);
  const me = await t.call('gina', 'GET', '/v1/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.me.display_name, 'Gina');
  assert.deepEqual(me.body.me.guide, { topics: ['navigation', 'new_student'], languages: ['en', 'es'], active: true });
  assert.deepEqual((await t.call('max', 'GET', '/v1/me')).body.me.permissions, ['manage_accounts']);
  await t.call('gina', 'POST', '/v1/auth/sign-out');
  assert.equal((await t.call('gina', 'GET', '/v1/me')).status, 401, 'token no longer works');
});

test('sign-in: too many failures are refused for 15 minutes', async () => {
  const t = await setup();
  for (let i = 0; i < 10; i++) {
    await t.app.inject({ method: 'POST', url: '/v1/auth/sign-in', payload: { email: EMAIL.riley, password: 'wrong', client: 'app' } });
  }
  const res = await t.app.inject({ method: 'POST', url: '/v1/auth/sign-in', payload: { email: EMAIL.riley, password: PASSWORD, client: 'app' } });
  assert.equal(res.statusCode, 429);
});

test('website cookie: httpOnly, and changes need the X-Bell-Client header', async () => {
  const t = await setup();
  const res = await t.app.inject({ method: 'POST', url: '/v1/auth/sign-in', payload: { email: EMAIL.uma, password: PASSWORD, client: 'web' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().token, undefined, 'the website never sees the token');
  const set = String(res.headers['set-cookie']);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  const cookie = set.split(';')[0]!;
  assert.equal((await t.app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } })).statusCode, 200);
  const noHeader = await t.app.inject({ method: 'POST', url: '/v1/updates', headers: { cookie }, payload: { title: 'x' } });
  assert.equal(noHeader.statusCode, 403);
  const withHeader = await t.app.inject({ method: 'POST', url: '/v1/updates', headers: { cookie, 'x-bell-client': 'web' }, payload: { title: 'x' } });
  assert.equal(withHeader.statusCode, 200);
});

test('updates: editors write, everyone reads published, photos follow the update', async () => {
  const t = await setup();
  assert.equal((await t.call('sofia', 'POST', '/v1/updates', { title: 'No' })).status, 403);
  assert.equal((await t.call('sam', 'POST', '/v1/updates', { title: 'No' })).status, 403);
  assert.equal((await t.call('uma', 'POST', '/v1/updates', { title: '' })).status, 400);

  // A PNG upload (multipart), checked by its bytes.
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
  const boundary = 'bellboundary';
  const multipart = (name: string, bytes: Buffer) => Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const upload = async (who: Who, bytes: Buffer) => t.app.inject({
    method: 'POST', url: '/v1/updates/photos', payload: multipart('a.png', bytes),
    headers: { authorization: `Bearer ${await t.signIn(who)}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
  });
  assert.equal((await upload('uma', Buffer.from('not an image at all'))).statusCode, 400);
  assert.equal((await upload('sam', png)).statusCode, 403);
  const up = await upload('uma', png);
  assert.equal(up.statusCode, 200, up.body);
  const photo = up.json().photo_path as string;
  assert.match(photo, /\.png$/);

  const created = await t.call('uma', 'POST', '/v1/updates',
    { title: 'Football game', starts_at: '2026-11-06T20:15:00.000Z', location: 'Stadium', body: 'Go Bulldogs', photo_path: photo });
  assert.equal(created.status, 200);
  const id = created.body.update.id as string;
  assert.equal(created.body.update.status, 'draft');
  assert.equal(created.body.update.photo_url, `/v1/updates/photos/${photo}`);

  // Drafts and their photos are hidden from everyone but editors.
  assert.equal((await t.call(null, 'GET', '/v1/updates')).body.updates.length, 0);
  assert.equal((await t.app.inject({ method: 'GET', url: `/v1/updates/photos/${photo}` })).statusCode, 404);
  assert.equal((await t.call('uma', 'PATCH', `/v1/updates/${id}`, { status: 'published' })).status, 200);
  const feed = await t.call(null, 'GET', '/v1/updates');
  assert.deepEqual(feed.body.updates.map((u: { title: string }) => u.title), ['Football game']);
  const img = await t.app.inject({ method: 'GET', url: `/v1/updates/photos/${photo}` });
  assert.equal(img.statusCode, 200);
  assert.equal(img.headers['content-type'], 'image/png');
  assert.equal(img.rawPayload.length, png.length);

  assert.equal((await t.call('uma', 'DELETE', `/v1/updates/${id}`)).status, 200);
  assert.equal((await t.app.inject({ method: 'GET', url: `/v1/updates/photos/${photo}`,
    headers: { authorization: `Bearer ${await t.signIn('uma')}` } })).statusCode, 404, 'the unused photo file is removed');
  assert.equal((await t.call('uma', 'PATCH', `/v1/updates/${id}`, { title: 'gone' })).status, 404);
});

test('support flow over HTTP: submit → assign → chat → decline → reassign → done → follow-up → resolve', async () => {
  const t = await setup();
  const asked = await t.call('sam', 'POST', '/v1/support/requests', { topic: 'navigation', question: 'Where is the library?' });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  const id = asked.body.request.id as string;

  const queue = await t.call('sofia', 'GET', '/v1/support');
  assert.equal(queue.body.requests.length, 1);
  assert.deepEqual(queue.body.guides.map((g: { display_name: string }) => g.display_name), ['Gina', 'Omar']);
  assert.equal((await t.call('gina', 'GET', '/v1/support')).body.requests.length, 0);
  assert.equal((await t.call('gina', 'GET', '/v1/support')).body.guides, undefined, 'guide list is staff-only');

  const early = await t.call('sam', 'POST', `/v1/support/requests/${id}/messages`, { body: 'hello?' });
  assert.equal(early.status, 409);
  assert.match(early.body.error, /only while the request is open/);

  const gina = queue.body.guides[0].id as string;
  const omar = queue.body.guides[1].id as string;
  assert.equal((await t.call('gina', 'POST', `/v1/support/requests/${id}/assign`, { guide_id: gina })).status, 403);
  assert.equal((await t.call('sofia', 'POST', `/v1/support/requests/${id}/assign`, { guide_id: gina })).body.request.status, 'with_guide');
  await t.call('gina', 'POST', `/v1/support/requests/${id}/messages`, { body: 'Hi Sam!' });
  assert.equal((await t.call('riley', 'GET', `/v1/support/requests/${id}`)).status, 404);

  const declined = await t.call('gina', 'POST', `/v1/support/requests/${id}/decline`, { reason: 'Busy with class' });
  assert.equal(declined.body.request.status, 'submitted');
  await t.call('sofia', 'POST', `/v1/support/requests/${id}/assign`, { guide_id: omar });
  const m1 = await t.call('omar', 'POST', `/v1/support/requests/${id}/messages`, { body: 'The library is next to the Career Center.' });
  assert.equal(m1.body.message.sender_role, 'guide');
  assert.equal((await t.call('omar', 'POST', `/v1/support/requests/${id}/done`, { note: 'Answered' })).body.request.status, 'follow_up');
  await t.call('sofia', 'POST', `/v1/support/requests/${id}/messages`, { body: 'Sam, did you find it?' });

  // The student sees the whole thread, and only new messages with ?after=.
  const thread = await t.call('sam', 'GET', `/v1/support/requests/${id}`);
  assert.deepEqual(thread.body.messages.map((m: { sender_role: string; sender_name: string }) => `${m.sender_role}:${m.sender_name}`),
    ['guide:Gina', 'guide:Omar', 'staff:Sofia (Support)']);
  assert.equal(thread.body.events, undefined, 'history is staff-only');
  const lastId = thread.body.messages.at(-1).id as number;
  assert.equal(typeof lastId, 'number');
  assert.equal((await t.call('sam', 'GET', `/v1/support/requests/${id}?after=${lastId}`)).body.messages.length, 0);

  assert.equal((await t.call('sofia', 'POST', `/v1/support/requests/${id}/resolve`, { note: 'Found it' })).body.request.status, 'resolved');
  const staffView = await t.call('sofia', 'GET', `/v1/support/requests/${id}`);
  assert.deepEqual(staffView.body.events.map((e: { kind: string }) => e.kind),
    ['submitted', 'assigned', 'declined', 'assigned', 'guide_done', 'resolved']);
});

test('support: reports, sensitive requests and the supervision setting', async () => {
  const t = await setup();
  const s = await t.call('sam', 'POST', '/v1/support/requests', { topic: 'other', question: 'I need to talk to someone' });
  const id = s.body.request.id as string;
  assert.equal((await t.call('sofia', 'POST', `/v1/support/requests/${id}/keep`, {})).body.request.status, 'with_staff');
  assert.equal((await t.call('sofia', 'POST', `/v1/support/requests/${id}/messages`, { body: 'I am here.' })).status, 200);

  const r = await t.call('riley', 'POST', '/v1/support/requests', { topic: 'clubs', question: 'Robotics club?' });
  const rid = r.body.request.id as string;
  const guides = (await t.call('sofia', 'GET', '/v1/support')).body.guides;
  await t.call('sofia', 'POST', `/v1/support/requests/${rid}/assign`, { guide_id: guides[1].id });
  await t.call('omar', 'POST', `/v1/support/requests/${rid}/messages`, { body: 'Room 2101 on Thursdays' });

  assert.equal((await t.call('sofia', 'PUT', '/v1/admin/settings/supervision', { mode: 'reported_only' })).status, 403);
  assert.equal((await t.call('max', 'PUT', '/v1/admin/settings/supervision', { mode: 'reported_only' })).status, 200);
  const hidden = await t.call('sofia', 'GET', `/v1/support/requests/${rid}`);
  assert.equal(hidden.body.thread_hidden, true);
  assert.equal(hidden.body.messages.length, 0);
  assert.equal((await t.call('sam', 'GET', '/v1/support')).body.supervision_mode, 'reported_only');

  assert.equal((await t.call('riley', 'POST', `/v1/support/requests/${rid}/report`, { reason: 'Felt uncomfortable' })).status, 200);
  const shown = await t.call('sofia', 'GET', `/v1/support/requests/${rid}`);
  assert.equal(shown.body.thread_hidden, false);
  assert.equal(shown.body.messages.length, 1);
  assert.equal(shown.body.reports.length, 1);
  const reportId = shown.body.reports[0].id as string;
  assert.equal((await t.call('omar', 'POST', `/v1/support/reports/${reportId}/resolve`)).status, 403);
  assert.equal((await t.call('sofia', 'POST', `/v1/support/reports/${reportId}/resolve`)).status, 200);
  assert.ok((await t.call('sofia', 'GET', '/v1/support')).body.reports[0].resolved_at);
});

test('accounts: managers create, change roles, reset passwords and disable', async () => {
  const t = await setup();
  const payload = { email: 'Teacher@BellSpace.test', display_name: 'Ms. Test', kind: 'staff', password: 'long-enough-pw', permissions: ['support'] };
  assert.equal((await t.call('sofia', 'POST', '/v1/admin/accounts', payload)).status, 403);
  assert.equal((await t.call('max', 'POST', '/v1/admin/accounts', { ...payload, password: 'short' })).status, 400);
  const made = await t.call('max', 'POST', '/v1/admin/accounts', payload);
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal((await t.call('max', 'POST', '/v1/admin/accounts', payload)).status, 409, 'email already used');

  const signIn = await t.app.inject({ method: 'POST', url: '/v1/auth/sign-in',
    payload: { email: 'teacher@bellspace.test', password: 'long-enough-pw', client: 'app' } });
  assert.equal(signIn.statusCode, 200);
  assert.deepEqual(signIn.json().me.permissions, ['support']);

  const list = await t.call('max', 'GET', '/v1/admin/accounts');
  const riley = list.body.accounts.find((a: { email: string }) => a.email === EMAIL.riley);
  assert.equal(riley.guide, null);
  assert.equal((await t.call('max', 'PATCH', `/v1/admin/accounts/${riley.id}`,
    { guide: { topics: ['clubs'], languages: ['en'], active: true } })).status, 200);
  assert.equal((await t.call('riley', 'GET', '/v1/me')).body.me.guide.topics[0], 'clubs');
  assert.equal((await t.call('max', 'PATCH', `/v1/admin/accounts/${riley.id}`, { disabled: true })).status, 200);
  assert.equal((await t.call('riley', 'GET', '/v1/me')).status, 401, 'disabled account is signed out');

  const audit = await t.call('max', 'GET', '/v1/admin/audit');
  assert.deepEqual(audit.body.audit.map((a: { action: string }) => a.action).slice(0, 2), ['disable_account', 'set_guide_profile']);
});

test('CORS: only listed origins, bearer tokens only (never credentials)', async () => {
  const t = await testDb();
  const config = { ...loadConfig({ CORS_ORIGINS: 'http://localhost:8081' }), dataDir: tempDir(), webDir: join(tmpdir(), 'no-web') };
  const app = await buildApp(t.db, config);
  const pre = await app.inject({ method: 'OPTIONS', url: '/v1/support', headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'GET' } });
  assert.equal(pre.statusCode, 204);
  assert.equal(pre.headers['access-control-allow-origin'], 'http://localhost:8081');
  assert.equal(pre.headers['access-control-allow-credentials'], undefined);
  const other = await app.inject({ method: 'GET', url: '/v1/updates', headers: { origin: 'https://evil.example' } });
  assert.equal(other.headers['access-control-allow-origin'], undefined);
});

test('website files: a rebuild is served without a restart; a missing file is a 404, not the page', async () => {
  const t = await testDb();
  const webDir = tempDir('bell-web-');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><div id="root"></div>');
  const app = await buildApp(t.db, { ...loadConfig({}), dataDir: tempDir(), webDir });
  // Built after the server started, with a new hashed name.
  mkdirSync(join(webDir, 'assets'));
  writeFileSync(join(webDir, 'assets', 'index-new.js'), 'console.log(1)');
  const js = await app.inject({ method: 'GET', url: '/assets/index-new.js' });
  assert.equal(js.statusCode, 200);
  assert.match(String(js.headers['content-type']), /javascript/);
  const missing = await app.inject({ method: 'GET', url: '/assets/index-old.js' });
  assert.equal(missing.statusCode, 404);
  const page = await app.inject({ method: 'GET', url: '/accounts' });
  assert.equal(page.statusCode, 200);
  assert.match(String(page.headers['content-type']), /html/);
});
