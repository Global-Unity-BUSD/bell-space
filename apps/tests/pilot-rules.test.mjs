// Access rules for the Chat/Updates pilot, run against real Postgres (PGlite)
// with the same migration the Supabase project uses. Supabase's own pieces
// (auth.users, auth.uid(), storage tables, API roles, default grants) are
// stubbed the way Supabase defines them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20261025000000_pilot.sql', import.meta.url), 'utf8');

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
grant usage on schema public, auth, storage to anon, authenticated;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner uuid);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
create publication supabase_realtime;
-- Supabase grants everything in public to the API roles by default.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const USERS = {
  sam: { id: '00000000-0000-4000-8000-000000000001', first: 'Sam' },
  riley: { id: '00000000-0000-4000-8000-000000000002', first: 'Riley' },
  gina: { id: '00000000-0000-4000-8000-000000000003', first: 'Gina' },
  omar: { id: '00000000-0000-4000-8000-000000000004', first: 'Omar' },
  ed: { id: '00000000-0000-4000-8000-000000000005', first: 'Ed' },
};

async function setup() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(migration);
  for (const [key, u] of Object.entries(USERS)) {
    await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
      [u.id, `${key}@pilot.test`, { first_name: u.first }]);
  }
  await db.exec(`
    update public.profiles set role = 'guide' where id in ('${USERS.gina.id}', '${USERS.omar.id}');
    update public.profiles set role = 'admin' where id = '${USERS.ed.id}';
    insert into public.guide_settings (guide_id, topics, languages) values
      ('${USERS.gina.id}', '{navigation,new_student}', '{en,es}'),
      ('${USERS.omar.id}', '{clubs}', '{en}');`);
  // Run one statement as a signed-in user (or anon when `who` is null).
  const as = async (who, sql, params = []) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who ? USERS[who].id : '']);
    await db.exec(`set role ${who ? 'authenticated' : 'anon'}`);
    try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
  };
  const rows = async (who, sql, params) => (await as(who, sql, params)).rows;
  const fails = async (who, sql, params, pattern) => {
    await assert.rejects(as(who, sql, params), pattern, `${who ?? 'anon'}: ${sql}`);
  };
  return { db, as, rows, fails };
}

const ask = (anonymous, topic = 'navigation', language = null) =>
  ['select * from public.ask_guide($1, $2, $3, $4)', [topic, language, anonymous, 'Where is room 1155?']];

test('signed-out users see only published updates and cannot touch chat', async () => {
  const { rows, fails } = await setup();
  const feed = await rows(null, 'select title, sample from public.updates');
  assert.deepEqual(feed, [{ title: 'Sample event: Home football game', sample: true }]);
  for (const table of ['profiles', 'conversations', 'conversation_owners', 'messages', 'reports', 'guide_settings']) {
    await fails(null, `select * from public.${table}`, [], /permission denied/);
  }
  await fails(null, ...ask(true), /permission denied/);
  await fails(null, "select public.guides_available('navigation')", [], /permission denied/);
  await fails(null, "insert into public.updates (title) values ('x')", [], /permission denied/);
});

test('students cannot raise their role, approve guides or write chat tables directly', async () => {
  const { rows, fails } = await setup();
  assert.deepEqual(await rows('sam', 'select first_name, role from public.profiles'), [{ first_name: 'Sam', role: 'student' }]);
  await fails('sam', "update public.profiles set role = 'admin'", [], /permission denied/);
  await fails('sam', `insert into public.guide_settings (guide_id, topics, available) values ('${USERS.sam.id}', '{navigation}', true)`,
    [], /permission denied/);
  await fails('sam', 'select public.set_available(true)', [], /Only approved guides/);
  await fails('sam', "insert into public.conversations (topic, anonymous, question) values ('navigation', true, 'hi')", [],
    /permission denied/);
  await fails('sam', 'select public.handle_new_user()', [], /permission denied/);
  assert.deepEqual(await rows('sam', 'select * from public.guide_settings'), []);
});

test('questions queue to available matching guides; one guide accepts', async () => {
  const { rows, fails } = await setup();
  const count = async (topic, lang = null) => (await rows('sam', 'select public.guides_available($1, $2) n', [topic, lang]))[0].n;
  assert.equal(await count('navigation'), 0, 'nobody is available yet');
  await rows('gina', 'select public.set_available(true)');
  await rows('omar', 'select public.set_available(true)');
  assert.equal(await count('navigation'), 1);
  assert.equal(await count('navigation', 'es'), 1);
  assert.equal(await count('navigation', 'hy'), 0, 'no Armenian-speaking guide');
  assert.equal(await count('clubs'), 1);

  const [anon] = await rows('sam', ...ask(true));
  assert.equal(anon.status, 'pending');
  assert.equal(anon.student_name, null, 'anonymous: no name stored for the guide');
  assert.ok(!('student_id' in anon), 'conversations never carry the asking account');
  const [named] = await rows('riley', ...ask(false));
  assert.equal(named.student_name, 'Riley', 'named mode shows a first name only');

  // Queue: only the matching, available guide.
  assert.deepEqual((await rows('gina', 'select id from public.conversations order by created_at')).map((r) => r.id),
    [anon.id, named.id]);
  assert.deepEqual(await rows('omar', 'select id from public.conversations'), [], 'clubs guide does not see navigation');
  assert.deepEqual(await rows('riley', 'select id from public.conversations'), [{ id: named.id }], 'students see only their own');
  assert.deepEqual(await rows('gina', 'select * from public.conversation_owners'), [], 'guides never see who asked');
  assert.deepEqual(await rows('gina', 'select * from public.profiles where id <> $1', [USERS.gina.id]), []);

  await rows('gina', 'select public.set_available(false)');
  assert.deepEqual(await rows('gina', 'select id from public.conversations'), [], 'unavailable guides have no queue');
  await fails('gina', 'select public.accept_conversation($1)', [anon.id], /already taken or is not in your queue/);
  await rows('gina', 'select public.set_available(true)');

  await fails('omar', 'select public.accept_conversation($1)', [anon.id], /not in your queue/);
  const [active] = await rows('gina', 'select * from public.accept_conversation($1)', [anon.id]);
  assert.equal(active.status, 'active');
  assert.equal(active.guide_name, 'Gina');
  await fails('gina', 'select public.accept_conversation($1)', [anon.id], /already taken/);
  assert.deepEqual((await rows('sam', 'select status, guide_name from public.conversations'))[0],
    { status: 'active', guide_name: 'Gina' });
});

test('only the two participants exchange and read messages; reviewers see reported chats', async () => {
  const { rows, fails } = await setup();
  await rows('gina', 'select public.set_available(true)');
  const [c] = await rows('sam', ...ask(true));
  await fails('sam', 'select public.send_message($1, $2)', [c.id, 'hello?'], /not active/);
  await rows('gina', 'select public.accept_conversation($1)', [c.id]);
  await rows('sam', 'select public.send_message($1, $2)', [c.id, 'Which door?']);
  await rows('gina', 'select public.send_message($1, $2)', [c.id, 'The one facing the Quad.']);
  await fails('riley', 'select public.send_message($1, $2)', [c.id, 'hi'], /Not your conversation/);
  await fails('omar', 'select public.send_message($1, $2)', [c.id, 'hi'], /Not your conversation/);
  await fails('sam', "insert into public.messages (conversation_id, from_student, body) values ($1, false, 'fake guide')",
    [c.id], /permission denied/);

  const thread = await rows('sam', 'select from_student, body from public.messages order by id');
  assert.deepEqual(thread, [{ from_student: true, body: 'Which door?' }, { from_student: false, body: 'The one facing the Quad.' }]);
  assert.deepEqual(await rows('gina', 'select body from public.messages order by id'), thread.map(({ body }) => ({ body })));
  const columns = Object.keys((await rows('gina', 'select * from public.messages limit 1'))[0]);
  assert.ok(!columns.some((k) => /sender|student_id|account/.test(k)), 'messages carry no account id');
  for (const outsider of ['riley', 'omar', 'ed']) {
    assert.deepEqual(await rows(outsider, 'select * from public.messages'), [], `${outsider} reads no messages`);
    assert.deepEqual(await rows(outsider, 'select * from public.conversations'), [], `${outsider} sees no conversation`);
  }

  await fails('riley', 'select public.report_conversation($1, $2)', [c.id, 'x'], /Not your conversation/);
  await rows('gina', 'select public.report_conversation($1, $2)', [c.id, 'Testing the report button']);
  assert.deepEqual(await rows('sam', 'select * from public.reports'), [], 'reports are for reviewers');
  const [report] = await rows('ed', 'select reason, reporter_id from public.reports');
  assert.equal(report.reporter_id, USERS.gina.id);
  assert.equal((await rows('ed', 'select * from public.messages')).length, 2, 'reviewer reads the reported chat');
  assert.deepEqual(await rows('ed', 'select student_id from public.conversation_owners'), [{ student_id: USERS.sam.id }],
    'anonymous to the guide, but linked to the account for reporting');
  await fails('ed', 'select public.send_message($1, $2)', [c.id, 'hi'], /Not your conversation/);

  const [closed] = await rows('gina', 'select * from public.end_conversation($1)', [c.id]);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.closed_by, 'guide');
  await fails('sam', 'select public.send_message($1, $2)', [c.id, 'one more'], /not active/);
  await fails('riley', 'select public.end_conversation($1)', [c.id], /Not your conversation/);
});

test('a student can have at most two open questions', async () => {
  const { rows, fails } = await setup();
  const [a] = await rows('sam', ...ask(true));
  await rows('sam', ...ask(false, 'clubs'));
  await fails('sam', ...ask(true, 'other'), /two open questions/);
  await rows('sam', 'select public.end_conversation($1)', [a.id]);
  await rows('sam', ...ask(true, 'other'));
});

test('only admins draft, publish and unpublish updates', async () => {
  const { rows, as, fails } = await setup();
  await fails('sam', "insert into public.updates (title) values ('Fake')", [], /row-level security/);
  const [draft] = await rows('ed', "insert into public.updates (title, body, location) values ('Club fair', 'Booths', 'Quad') returning *");
  assert.equal(draft.status, 'draft');
  assert.equal(draft.created_by, USERS.ed.id);
  assert.equal(draft.published_at, null);
  assert.equal((await rows(null, 'select * from public.updates where id = $1', [draft.id])).length, 0, 'drafts are hidden');
  assert.equal((await rows('sam', 'select * from public.updates where id = $1', [draft.id])).length, 0);

  const [pub] = await rows('ed', "update public.updates set status = 'published' where id = $1 returning *", [draft.id]);
  assert.ok(pub.published_at, 'publishing stamps the time');
  assert.equal((await rows(null, 'select title from public.updates where id = $1', [draft.id]))[0].title, 'Club fair');
  // Students' writes match no rows (RLS), so nothing changes.
  assert.equal((await as('sam', "update public.updates set title = 'Hacked' where id = $1", [draft.id])).affectedRows, 0);
  assert.equal((await as('sam', 'delete from public.updates where id = $1', [draft.id])).affectedRows, 0);
  const [unpub] = await rows('ed', "update public.updates set status = 'draft' where id = $1 returning *", [draft.id]);
  assert.equal(unpub.published_at, null);
  assert.equal((await rows(null, 'select * from public.updates where id = $1', [draft.id])).length, 0, 'unpublished');
});

test('update photos: admins upload; others read only photos of published updates', async () => {
  const { rows, fails } = await setup();
  const put = (who, name) => rows(who, "insert into storage.objects (bucket_id, name) values ('update-photos', $1) returning name", [name]);
  await fails('sam', "insert into storage.objects (bucket_id, name) values ('update-photos', 'x.jpg')", [], /row-level security/);
  await fails(null, "insert into storage.objects (bucket_id, name) values ('update-photos', 'x.jpg')", [], /row-level security/);
  await put('ed', 'a.jpg');
  const [u] = await rows('ed', "insert into public.updates (title, photo_path) values ('With photo', 'a.jpg') returning id");
  assert.deepEqual(await rows(null, 'select name from storage.objects'), [], 'draft photo is private');
  await rows('ed', "update public.updates set status = 'published' where id = $1", [u.id]);
  assert.deepEqual(await rows(null, 'select name from storage.objects'), [{ name: 'a.jpg' }]);
  assert.deepEqual(await rows('sam', 'select name from storage.objects'), [{ name: 'a.jpg' }]);
});

test('realtime publishes the chat and updates tables (delivery follows the same policies)', async () => {
  const { db } = await setup();
  const { rows } = await db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1");
  assert.deepEqual(rows.map((r) => r.tablename), ['conversations', 'messages', 'updates']);
});
