// Access rules, enforced by the migration itself (row-level security and
// checked functions), run against real Postgres (PGlite).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { testDb, type Who } from './helpers.ts';

type Req = { id: string; status: string; guide_id: string | null; staff_id: string | null; sensitive: boolean };

async function setup() {
  const t = await testDb();
  const fails = (who: Who | null, sql: string, params: unknown[], pattern: RegExp) =>
    assert.rejects(t.rows(who, sql, params), pattern, `${who ?? 'signed out'}: ${sql}`);
  const ask = (who: Who, question = 'Where is room 1155?', topic = 'navigation') =>
    t.one<Req>(who, 'select * from submit_request($1, null, $2)', [topic, question]);
  const visible = async (who: Who | null, id: string) =>
    (await t.rows(who, 'select id from support_requests where id = $1', [id])).length === 1;
  // Every check reads the thread both ways: the row rule and thread_messages() must agree.
  const messages = async (who: Who, id: string) => {
    const direct = await t.rows<{ body: string; sender_role: string }>(who, 'select body, sender_role from request_messages where request_id = $1 order by id', [id]);
    const viaFunction = await t.rows<{ body: string; sender_role: string }>(who, 'select body, sender_role from thread_messages($1)', [id]);
    assert.deepEqual(viaFunction, direct, `${who}: thread_messages() and the row rule disagree`);
    return direct;
  };
  const send = (who: Who, id: string, body: string) =>
    t.one<{ sender_role: string }>(who, 'select * from send_message($1, $2)', [id, body]);
  return { ...t, fails, ask, visible, messages, send };
}

test('signed out: only published updates; no accounts, requests or writes', async () => {
  const t = await setup();
  await t.db.owner((tx) => tx.query(`insert into updates (title, status) values ('Draft', 'draft'), ('Live', 'published')`));
  assert.deepEqual((await t.rows(null, 'select title from updates')).map((r) => r.title), ['Live']);
  assert.equal((await t.rows(null, 'select * from accounts')).length, 0);
  await t.fails(null, `insert into updates (title) values ('x')`, [], /row-level security/);
  await t.fails(null, `select * from submit_request('navigation', null, 'hi')`, [], /Only students/);
});

test('updates: only staff with the updates permission create, publish and delete', async () => {
  const t = await setup();
  for (const who of ['sam', 'gina', 'sofia', 'max'] as Who[]) {
    await t.fails(who, `insert into updates (title) values ('x')`, [], /row-level security/);
  }
  const u = await t.one<{ id: string; created_by: string; published_at: string | null }>('uma',
    `insert into updates (title, status) values ('Game night', 'draft') returning *`);
  assert.equal(u.created_by, t.ids.uma);
  assert.equal(u.published_at, null);
  assert.equal((await t.rows('sam', 'select * from updates where id = $1', [u.id])).length, 0, 'draft hidden from students');
  await t.rows('uma', `update updates set status = 'published' where id = $1`, [u.id]);
  assert.equal((await t.rows('sam', 'select * from updates where id = $1', [u.id])).length, 1);
  // Others' updates/deletes silently match nothing under row-level security.
  await t.rows('sofia', 'delete from updates where id = $1', [u.id]);
  assert.equal((await t.rows('uma', 'select * from updates where id = $1', [u.id])).length, 1);
  await t.rows('uma', 'delete from updates where id = $1', [u.id]);
  assert.equal((await t.rows('uma', 'select * from updates where id = $1', [u.id])).length, 0);
});

test('accounts: own row only for students; hashes and sessions never readable', async () => {
  const t = await setup();
  assert.deepEqual((await t.rows('sam', 'select display_name from accounts')).map((r) => r.display_name), ['Sam']);
  assert.equal((await t.rows('sofia', 'select * from accounts')).length, 7, 'support staff see accounts (guide list)');
  assert.equal((await t.rows('uma', 'select * from accounts')).length, 1);
  for (const who of ['sam', 'max'] as Who[]) {
    await t.fails(who, 'select * from account_passwords', [], /permission denied/);
    await t.fails(who, 'select * from sessions', [], /permission denied/);
  }
  await t.fails('sam', `update accounts set kind = 'staff'`, [], /permission denied/);
  await t.fails('sam', `insert into staff_permissions values ($1, 'support')`, [t.ids.sam], /permission denied/);
});

test('students submit (guides too), at most two open; staff cannot ask', async () => {
  const t = await setup();
  await t.ask('sam', 'one');
  await t.ask('sam', 'two');
  await t.fails('sam', `select * from submit_request('clubs', null, 'three')`, [], /two open requests/);
  const g = await t.ask('gina', 'A guide asking for help');
  assert.equal(g.status, 'submitted');
  await t.fails('sofia', `select * from submit_request('clubs', null, 'staff?')`, [], /Only students/);
  await t.fails('sam', `insert into support_requests (student_id, student_name, topic, question) values ($1, 'Sam', 'clubs', 'x')`,
    [t.ids.sam], /permission denied/);
});

test('who sees a request: the student, support staff, and the guide only once assigned', async () => {
  const t = await setup();
  const r = await t.ask('sam');
  assert.equal(await t.visible('sam', r.id), true);
  assert.equal(await t.visible('sofia', r.id), true);
  for (const who of ['riley', 'gina', 'omar', 'uma', 'max', null] as (Who | null)[]) {
    assert.equal(await t.visible(who, r.id), false, `${who} must not see it`);
  }
  // Only support staff assign; nothing is matched automatically.
  await t.fails('gina', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina], /Only support staff/);
  await t.fails('max', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina], /Only support staff/);
  await t.fails('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.riley], /not an active guide/);
  const a = await t.one<Req>('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina]);
  assert.equal(a.status, 'with_guide');
  assert.equal(await t.visible('gina', r.id), true);
  assert.equal(await t.visible('omar', r.id), false);
  await t.fails('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.omar], /not waiting for review/);
});

test('a guide is never assigned their own request', async () => {
  const t = await setup();
  const r = await t.ask('gina');
  await t.fails('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina], /their own request/);
});

test('messages only inside an assigned, open request, from its people', async () => {
  const t = await setup();
  const r = await t.ask('sam');
  await t.fails('sam', 'select * from send_message($1, $2)', [r.id, 'hello?'], /only while the request is open/);
  await t.rows('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina]);
  assert.equal((await t.send('sam', r.id, 'Hi Gina')).sender_role, 'student');
  assert.equal((await t.send('gina', r.id, 'Hi Sam, 1155 is by the Quad')).sender_role, 'guide');
  assert.equal((await t.send('sofia', r.id, 'Staff here, all good')).sender_role, 'staff');
  for (const who of ['riley', 'omar', 'uma', 'max'] as Who[]) {
    await t.fails(who, 'select * from send_message($1, $2)', [r.id, 'x'], /Not your request/);
    assert.equal((await t.messages(who, r.id)).length, 0);
  }
  await t.fails('sam', `insert into request_messages (request_id, sender_id, sender_role, sender_name, body)
    values ($1, $2, 'staff', 'Fake', 'x')`, [r.id, t.ids.sam], /permission denied/);
  assert.deepEqual((await t.messages('sam', r.id)).map((m) => m.sender_role), ['student', 'guide', 'staff']);
});

test('decline returns the request to staff and removes the guide', async () => {
  const t = await setup();
  const r = await t.ask('sam');
  await t.rows('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina]);
  await t.send('sam', r.id, 'Hi');
  await t.fails('omar', 'select * from decline_request($1, null)', [r.id], /Only the assigned guide/);
  const d = await t.one<Req>('gina', 'select * from decline_request($1, $2)', [r.id, 'Not my topic']);
  assert.equal(d.status, 'submitted');
  assert.equal(d.guide_id, null);
  assert.equal(await t.visible('gina', r.id), false);
  assert.equal((await t.messages('gina', r.id)).length, 0);
  const events = await t.rows<{ kind: string; detail: string | null }>('sofia',
    'select kind, detail from request_events where request_id = $1 order by id', [r.id]);
  assert.deepEqual(events.map((e) => e.kind), ['submitted', 'assigned', 'declined']);
  assert.equal(events[2]!.detail, 'Not my topic');
  // Staff can now assign someone else.
  assert.equal((await t.one<Req>('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.omar])).status, 'with_guide');
});

test('guide done → staff follow-up in the same thread → resolved, then closed to messages', async () => {
  const t = await setup();
  const r = await t.ask('sam');
  await t.rows('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina]);
  const done = await t.one<Req>('gina', 'select * from mark_guide_done($1, $2)', [r.id, 'Showed the way']);
  assert.equal(done.status, 'follow_up');
  const s = await t.send('sofia', r.id, 'Did that help, Sam?');
  assert.equal(s.sender_role, 'staff');
  assert.equal((await t.one<Req>('sofia', 'select * from support_requests where id = $1', [r.id])).staff_id, t.ids.sofia);
  await t.send('sam', r.id, 'Yes, thanks');
  await t.fails('gina', 'select * from resolve_request($1, null)', [r.id], /Only support staff/);
  assert.equal((await t.one<Req>('sofia', 'select * from resolve_request($1, $2)', [r.id, 'Found the room'])).status, 'resolved');
  await t.fails('sam', 'select * from send_message($1, $2)', [r.id, 'one more'], /only while the request is open/);
  // Resolved requests no longer count toward the limit.
  await t.ask('sam', 'a'); await t.ask('sam', 'b');
});

test('staff can message during review: the request moves to With staff (not sensitive), a guide can still be assigned', async () => {
  const t = await setup();
  const r = await t.ask('sam', 'Where is my class?');
  // Only support staff can write before review; students, guides and Updates-only staff cannot.
  for (const who of ['sam', 'gina', 'uma'] as Who[]) {
    await t.fails(who, 'select * from send_message($1, $2)', [r.id, 'x'], /only while the request is open|Not your request/);
  }
  assert.equal((await t.one<Req>('sofia', 'select * from support_requests where id = $1', [r.id])).status, 'submitted');

  assert.equal((await t.send('sofia', r.id, 'Which room is on your schedule?')).sender_role, 'staff');
  const taken = await t.one<Req>('sofia', 'select * from support_requests where id = $1', [r.id]);
  assert.equal(taken.status, 'with_staff');
  assert.equal(taken.sensitive, false);
  assert.equal(taken.staff_id, t.ids.sofia);
  await t.send('sam', r.id, 'Room 1155');
  await t.fails('sofia', 'select * from keep_with_staff($1)', [r.id], /not waiting for review/);

  // Staff then hand it to a guide, who sees the whole thread.
  assert.equal((await t.one<Req>('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina])).status, 'with_guide');
  assert.deepEqual((await t.messages('gina', r.id)).map((m) => m.body), ['Which room is on your schedule?', 'Room 1155']);
  assert.equal((await t.send('gina', r.id, '1155 is by the Quad')).sender_role, 'guide');
  const events = await t.rows<{ kind: string }>('sofia', 'select kind from request_events where request_id = $1 and kind <> $2 order by id', [r.id, 'viewed']);
  assert.deepEqual(events.map((e) => e.kind), ['submitted', 'taken_by_staff', 'assigned']);

  // Also with supervision set to reported requests only: the staff member who took it can read it.
  await t.rows('max', `select set_supervision_mode('reported_only')`);
  const r2 = await t.ask('riley');
  await t.send('sofia', r2.id, 'Hi Riley, a quick question first');
  assert.equal((await t.messages('sofia', r2.id)).length, 1);
});

test('sensitive requests stay with staff: no guide ever sees them', async () => {
  const t = await setup();
  const r = await t.ask('sam', 'Something private');
  const k = await t.one<Req>('sofia', 'select * from keep_with_staff($1)', [r.id]);
  assert.equal(k.status, 'with_staff');
  assert.equal(k.sensitive, true);
  await t.fails('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina], /Sensitive requests stay with staff/);
  await t.send('sofia', r.id, 'I am here to help');
  await t.send('sam', r.id, 'Thanks');
  for (const who of ['gina', 'omar'] as Who[]) assert.equal(await t.visible(who, r.id), false);
});

test('students may withdraw only while waiting for review', async () => {
  const t = await setup();
  const r = await t.ask('sam');
  await t.fails('riley', 'select * from withdraw_request($1)', [r.id], /can be withdrawn/);
  assert.equal((await t.one<Req>('sam', 'select * from withdraw_request($1)', [r.id])).status, 'resolved');
  const r2 = await t.ask('sam');
  await t.rows('sofia', 'select * from assign_guide($1, $2)', [r2.id, t.ids.gina]);
  await t.fails('sam', 'select * from withdraw_request($1)', [r2.id], /can be withdrawn/);
});

test('supervision: reported_only hides unreported guide threads from staff until reported', async () => {
  const t = await setup();
  await t.fails('sofia', `select set_supervision_mode('reported_only')`, [], /manage accounts/);
  await t.rows('max', `select set_supervision_mode('reported_only')`);
  const r = await t.ask('sam');
  await t.rows('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina]);
  await t.send('gina', r.id, 'Hi Sam');
  assert.equal(await t.visible('sofia', r.id), true, 'staff still see the question to assign it');
  assert.equal((await t.messages('sofia', r.id)).length, 0);
  await t.fails('sofia', 'select * from send_message($1, $2)', [r.id, 'x'], /Not your request/);
  await t.fails('riley', 'select * from report_request($1, $2)', [r.id, 'x'], /Not your request/);
  await t.rows('sam', 'select * from report_request($1, $2)', [r.id, 'Rude message']);
  assert.equal((await t.messages('sofia', r.id)).length, 1);
  assert.equal((await t.rows('sofia', 'select * from reports where request_id = $1', [r.id])).length, 1);
  assert.equal((await t.rows('sam', 'select * from reports')).length, 0);
  // Follow-up is staff work, so staff read it in either mode.
  const r2 = await t.ask('riley');
  await t.rows('sofia', 'select * from assign_guide($1, $2)', [r2.id, t.ids.omar]);
  await t.send('omar', r2.id, 'Clubs fair is Friday');
  assert.equal((await t.messages('sofia', r2.id)).length, 0);
  await t.rows('omar', 'select * from mark_guide_done($1, null)', [r2.id]);
  assert.equal((await t.messages('sofia', r2.id)).length, 1);
  const audit = await t.rows<{ action: string }>('max', 'select action from audit_log');
  assert.deepEqual(audit.map((a) => a.action), ['set_supervision_mode']);
});

test('staff views of a thread are recorded, at most once per 10 minutes', async () => {
  const t = await setup();
  const r = await t.ask('sam');
  await t.rows('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina]);
  await t.rows('sofia', 'select record_staff_view($1)', [r.id]);
  await t.rows('sofia', 'select record_staff_view($1)', [r.id]);
  await t.rows('gina', 'select record_staff_view($1)', [r.id]);
  const views = await t.rows<{ actor_id: string }>('sofia', `select actor_id from request_events where kind = 'viewed'`);
  assert.deepEqual(views.map((v) => v.actor_id), [t.ids.sofia]);
  assert.equal((await t.rows('sam', 'select * from request_events')).length, 0, 'history is staff-only');
});

test('account management: managers only; no self-lockout; disabling ends sessions', async () => {
  const t = await setup();
  await t.fails('sofia', `select create_account('new@bellspace.test', 'New', 'student')`, [], /manage accounts/);
  const { id } = await t.one<{ id: string }>('max', `select create_account('new@bellspace.test', 'New', 'student') as id`);
  await t.rows('max', 'select set_account_password($1, $2)', [id, 'scrypt$hash']);
  await t.rows('max', `select set_guide_profile($1, '{clubs}', '{en}', true)`, [id]);
  await t.fails('max', `select set_guide_profile($1, '{clubs}', '{en}', true)`, [t.ids.sofia], /Guides are student accounts/);
  await t.fails('max', `select set_staff_permissions($1, '{support}')`, [t.ids.sam], /for staff accounts/);
  await t.fails('max', `select set_staff_permissions($1, '{support}')`, [t.ids.max], /your own account management/);
  await t.rows('max', `select set_staff_permissions($1, '{support,manage_accounts}')`, [t.ids.max]);
  assert.equal((await t.rows('max', 'select * from support_requests')).length, 0);
  await t.fails('max', 'select set_account_disabled($1, true)', [t.ids.max], /your own account/);
  await t.db.owner((tx) => tx.query(`insert into sessions (token_hash, account_id, client, expires_at)
    values ('h1', $1, 'app', now() + interval '1 day')`, [t.ids.sam]));
  assert.equal((await t.rows(null, `select * from session_resolve('h1')`)).length, 1);
  await t.rows('max', 'select set_account_disabled($1, true)', [t.ids.sam]);
  assert.equal((await t.rows(null, `select * from session_resolve('h1')`)).length, 0);
  await t.fails('sam', `select * from submit_request('clubs', null, 'x')`, [], /Only students/);
  const audit = await t.rows<{ action: string }>('max', 'select action from audit_log order by id');
  assert.deepEqual(audit.map((a) => a.action),
    ['create_account', 'set_password', 'set_guide_profile', 'set_permissions', 'disable_account']);
});

test('thread_messages: messages after an id, at most 500, nothing when signed out', async () => {
  const t = await setup();
  const r = await t.ask('sam');
  await t.rows('sofia', 'select * from assign_guide($1, $2)', [r.id, t.ids.gina]);
  for (const body of ['one', 'two', 'three']) await t.send('gina', r.id, body);
  const all = await t.rows<{ id: string; body: string }>('sam', 'select id, body from thread_messages($1)', [r.id]);
  assert.deepEqual(all.map((m) => m.body), ['one', 'two', 'three']);
  const after = await t.rows<{ body: string }>('sam', 'select body from thread_messages($1, $2)', [r.id, all[0]!.id]);
  assert.deepEqual(after.map((m) => m.body), ['two', 'three']);
  assert.equal((await t.rows('sam', 'select * from thread_messages($1, 0, 100000)', [r.id])).length, 3);
  assert.equal((await t.rows(null, 'select * from thread_messages($1)', [r.id])).length, 0);
});
