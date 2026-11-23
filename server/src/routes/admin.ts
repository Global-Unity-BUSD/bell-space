import type { FastifyInstance } from 'fastify';

import { LIMITS, type AccountRow, type AuditEntry } from '../../../shared/api.ts';
import { checkPassword, hashPassword, needPermission } from '../auth.ts';
import type { Db, Tx } from '../db.ts';
import { HttpError } from '../errors.ts';

// Account management and settings, for staff with `manage_accounts`.

const guideSchema = {
  type: ['object', 'null'], additionalProperties: false, required: ['topics', 'languages', 'active'],
  properties: {
    topics: { type: 'array', maxItems: 4, items: { enum: ['navigation', 'new_student', 'clubs', 'other'] } },
    languages: { type: 'array', maxItems: 10, items: { type: 'string', pattern: '^[a-z]{2,3}$' } },
    active: { type: 'boolean' },
  },
};
const permissionsSchema = { type: 'array', maxItems: 3, items: { enum: ['updates', 'support', 'manage_accounts'] } };

type Guide = { topics: string[]; languages: string[]; active: boolean } | null;

async function applyRoles(tx: Tx, id: string, permissions?: string[], guide?: Guide) {
  if (permissions) await tx.query('select set_staff_permissions($1, $2::text[]::staff_permission[])', [id, permissions]);
  if (guide) {
    await tx.query('select set_guide_profile($1, $2::text[]::request_topic[], $3::text[], $4)', [id, guide.topics, guide.languages, guide.active]);
  }
}

export function registerAdmin(app: FastifyInstance, db: Db) {
  app.get('/v1/admin/accounts', async (req) => {
    const me = needPermission(req, 'manage_accounts');
    const accounts = await db.as(me.id, (tx) => tx.query<AccountRow>(
      `select a.id, a.email, a.display_name, a.kind, a.disabled, a.test_account, a.created_at,
         coalesce((select array_agg(p.permission::text order by p.permission) from staff_permissions p where p.account_id = a.id), '{}') as permissions,
         (select json_build_object('topics', g.topics::text[], 'languages', g.languages, 'active', g.active)
            from guide_profiles g where g.account_id = a.id) as guide
       from accounts a order by a.kind desc, lower(a.display_name)`));
    return { accounts };
  });

  app.post('/v1/admin/accounts', {
    schema: {
      body: {
        type: 'object', required: ['email', 'display_name', 'kind', 'password'], additionalProperties: false,
        properties: {
          email: { type: 'string', maxLength: 200 },
          display_name: { type: 'string', minLength: 1, maxLength: LIMITS.name },
          kind: { enum: ['student', 'staff'] },
          password: { type: 'string' },
          permissions: permissionsSchema,
          guide: guideSchema,
        },
      },
    },
  }, async (req) => {
    const me = needPermission(req, 'manage_accounts');
    const b = req.body as { email: string; display_name: string; kind: string; password: string; permissions?: string[]; guide?: Guide };
    const hash = await hashPassword(checkPassword(b.password));
    const id = await db.as(me.id, async (tx) => {
      const rows = await tx.query<{ id: string }>('select create_account($1, $2, $3) as id', [b.email, b.display_name, b.kind]);
      const newId = rows[0]!.id;
      await tx.query('select set_account_password($1, $2)', [newId, hash]);
      await applyRoles(tx, newId, b.permissions, b.guide);
      return newId;
    });
    return { id };
  });

  app.patch('/v1/admin/accounts/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object', additionalProperties: false,
        properties: { password: { type: 'string' }, disabled: { type: 'boolean' }, permissions: permissionsSchema, guide: guideSchema },
      },
    },
  }, async (req) => {
    const me = needPermission(req, 'manage_accounts');
    const { id } = req.params as { id: string };
    const b = req.body as { password?: string; disabled?: boolean; permissions?: string[]; guide?: Guide };
    const hash = b.password !== undefined ? await hashPassword(checkPassword(b.password)) : null;
    await db.as(me.id, async (tx) => {
      const [exists] = await tx.query('select 1 from accounts where id = $1', [id]);
      if (!exists) throw new HttpError(404, 'That account does not exist.');
      if (hash) await tx.query('select set_account_password($1, $2)', [id, hash]);
      if (b.disabled !== undefined) await tx.query('select set_account_disabled($1, $2)', [id, b.disabled]);
      await applyRoles(tx, id, b.permissions, b.guide);
    });
    return { ok: true };
  });

  app.get('/v1/admin/audit', async (req) => {
    const me = needPermission(req, 'manage_accounts');
    const audit = await db.as(me.id, (tx) => tx.query<AuditEntry>(
      `select l.id, l.action, l.detail, l.created_at, a.display_name as actor_name, t.display_name as target_name
       from audit_log l left join accounts a on a.id = l.actor_id left join accounts t on t.id = l.target_id
       order by l.id desc limit 200`));
    return { audit };
  });

  app.get('/v1/admin/settings', async (req) => {
    const me = needPermission(req, 'manage_accounts');
    const [row] = await db.as(me.id, (tx) =>
      tx.query<{ value: string }>(`select value from settings where key = 'supervision_mode'`));
    return { supervision_mode: row?.value ?? 'all_requests' };
  });

  app.put('/v1/admin/settings/supervision', {
    schema: { body: { type: 'object', required: ['mode'], additionalProperties: false, properties: { mode: { enum: ['all_requests', 'reported_only'] } } } },
  }, async (req) => {
    const me = needPermission(req, 'manage_accounts');
    await db.as(me.id, (tx) => tx.query('select set_supervision_mode($1)', [(req.body as { mode: string }).mode]));
    return { ok: true };
  });
}
