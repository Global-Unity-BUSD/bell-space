import type { FastifyInstance } from 'fastify';

import { LIMITS, type Guide, type Report, type RequestEvent, type RequestMessage, type SupportRequest } from '../../../shared/api.ts';
import { need, needPermission } from '../auth.ts';
import type { Db } from '../db.ts';
import { HttpError } from '../errors.ts';

// The support chat (CLEAR 2.0 flow). Every change goes through a checked
// database function; these routes only translate HTTP to those calls.

const idParam = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] };
const text = (max: number) => ({ type: 'string', minLength: 1, maxLength: max });
const optionalText = (max: number) => ({ type: ['string', 'null'], maxLength: max });

export function registerSupport(app: FastifyInstance, db: Db) {
  // Everything the signed-in account can see: its own requests, requests
  // assigned to it, and (support staff) the whole queue with reports and guides.
  app.get('/v1/support', async (req) => {
    const me = need(req);
    const staff = me.permissions.includes('support');
    return db.as(me.id, async (tx) => {
      const requests = await tx.query<SupportRequest>(
        `select * from support_requests order by status = 'resolved', updated_at desc limit 300`);
      const [{ supervision_mode } = { supervision_mode: 'all_requests' }] = await tx.query<{ supervision_mode: string }>(
        `select value as supervision_mode from settings where key = 'supervision_mode'`);
      if (!staff) return { requests, supervision_mode };
      const reports = await tx.query<Report>(
        `select id, request_id, reporter_name, reason, created_at, resolved_at from reports
         where resolved_at is null or resolved_at > now() - interval '7 days' order by created_at desc`);
      const guides = await tx.query<Guide>(
        `select a.id, a.display_name, g.topics::text[] as topics, g.languages,
           (select count(*)::int from support_requests r where r.guide_id = a.id and r.status in ('with_guide', 'follow_up')) as open_requests
         from guide_profiles g join accounts a on a.id = g.account_id
         where g.active and not a.disabled order by a.display_name`);
      return { requests, reports, guides, supervision_mode };
    });
  });

  app.post('/v1/support/requests', {
    schema: {
      body: {
        type: 'object', required: ['topic', 'question'], additionalProperties: false,
        properties: {
          topic: { enum: ['navigation', 'new_student', 'clubs', 'other'] },
          language: { type: ['string', 'null'], pattern: '^[a-z]{2,3}$' },
          question: text(LIMITS.question),
        },
      },
    },
  }, async (req) => {
    const me = need(req);
    const b = req.body as { topic: string; language?: string | null; question: string };
    const [request] = await db.as(me.id, (tx) =>
      tx.query<SupportRequest>('select * from submit_request($1, $2, $3)', [b.topic, b.language ?? null, b.question]));
    return { request };
  });

  // One request; its messages after `after` (all when 0) if the caller may read them.
  app.get('/v1/support/requests/:id', {
    schema: { params: idParam, querystring: { type: 'object', properties: { after: { type: 'integer', minimum: 0 } } } },
  }, async (req) => {
    const me = need(req);
    const { id } = req.params as { id: string };
    const after = (req.query as { after?: number }).after ?? 0;
    return db.as(me.id, async (tx) => {
      const [request] = await tx.query<SupportRequest>('select * from support_requests where id = $1', [id]);
      if (!request) throw new HttpError(404, 'That request does not exist.');
      const [{ readable } = { readable: false }] = await tx.query<{ readable: boolean }>(
        'select can_read_thread($1) as readable', [id]);
      const messages = readable
        ? await tx.query<RequestMessage>('select * from thread_messages($1, $2)', [id, after])
        : [];
      if (!me.permissions.includes('support')) return { request, messages, thread_hidden: !readable };
      if (readable) await tx.query('select record_staff_view($1)', [id]);
      const events = await tx.query<RequestEvent>(
        'select id, kind, actor_name, detail, created_at from request_events where request_id = $1 order by id', [id]);
      const reports = await tx.query<Report>(
        'select id, request_id, reporter_name, reason, created_at, resolved_at from reports where request_id = $1 order by created_at', [id]);
      return { request, messages, thread_hidden: !readable, events, reports };
    });
  });

  app.post('/v1/support/requests/:id/messages', {
    schema: { params: idParam, body: { type: 'object', required: ['body'], additionalProperties: false, properties: { body: text(LIMITS.message) } } },
  }, async (req) => {
    const me = need(req);
    const { id } = req.params as { id: string };
    const [message] = await db.as(me.id, (tx) =>
      tx.query<RequestMessage>('select * from send_message($1, $2)', [id, (req.body as { body: string }).body]));
    return { message };
  });

  // State changes. Each maps to one checked function: (id, optional argument).
  const action = (path: string, fn: string, arg?: { name: string; schema: object; required?: boolean }) => {
    const body = arg
      ? { type: 'object', additionalProperties: false, properties: { [arg.name]: arg.schema }, ...(arg.required ? { required: [arg.name] } : {}) }
      : { type: 'object', additionalProperties: false, properties: {} };
    app.post(`/v1/support/requests/:id/${path}`, { schema: { params: idParam, body } }, async (req) => {
      const me = need(req);
      const { id } = req.params as { id: string };
      const value = arg ? ((req.body ?? {}) as Record<string, unknown>)[arg.name] ?? null : undefined;
      const [request] = await db.as(me.id, (tx) => tx.query<SupportRequest>(
        arg ? `select * from ${fn}($1, $2)` : `select * from ${fn}($1)`, arg ? [id, value] : [id]));
      return { request };
    });
  };
  action('assign', 'assign_guide', { name: 'guide_id', schema: { type: 'string', format: 'uuid' }, required: true });
  action('keep', 'keep_with_staff');
  action('decline', 'decline_request', { name: 'reason', schema: optionalText(LIMITS.reason) });
  action('done', 'mark_guide_done', { name: 'note', schema: optionalText(LIMITS.reason) });
  action('resolve', 'resolve_request', { name: 'note', schema: optionalText(LIMITS.note) });
  action('withdraw', 'withdraw_request');

  app.post('/v1/support/requests/:id/report', {
    schema: { params: idParam, body: { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: text(LIMITS.reason) } } },
  }, async (req) => {
    const me = need(req);
    const { id } = req.params as { id: string };
    const [{ report_id } = { report_id: null }] = await db.as(me.id, (tx) =>
      tx.query<{ report_id: string }>('select report_request($1, $2) as report_id', [id, (req.body as { reason: string }).reason]));
    return { report_id };
  });

  app.post('/v1/support/reports/:id/resolve', { schema: { params: idParam } }, async (req) => {
    const me = needPermission(req, 'support');
    const { id } = req.params as { id: string };
    await db.as(me.id, (tx) => tx.query('select resolve_report($1)', [id]));
    return { ok: true };
  });
}
