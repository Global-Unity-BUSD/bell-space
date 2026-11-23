-- Bell Space server: accounts, sessions, Updates and the support chat (CLEAR 2.0).
-- Access is enforced here, not by the server or the clients:
-- * the server runs every request as the `app_user` role, with the signed-in
--   account in the `app.account_id` setting (empty when signed out);
-- * every table has row-level security, and `app_user` gets only the grants
--   listed below;
-- * every change to accounts, sessions and support requests goes through the
--   security-definer functions below, which check who is calling.
-- Plan and flow: docs/backend-plan.md. Tests: server/tests/rules.test.ts.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end $$;

revoke all on schema public from public;
grant usage on schema public to app_user;

-- ---------------------------------------------------------------- types

create type public.account_kind as enum ('student', 'staff');
create type public.staff_permission as enum ('updates', 'support', 'manage_accounts');
create type public.request_topic as enum ('navigation', 'new_student', 'clubs', 'other');
create type public.request_status as enum ('submitted', 'with_guide', 'follow_up', 'with_staff', 'resolved');
create type public.update_status as enum ('draft', 'published');

-- ---------------------------------------------------------------- tables

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  kind public.account_kind not null,
  -- Reserved for the district identity system (BUSD sign-on).
  external_id text unique,
  -- Created by the test seed; never a real person.
  test_account boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- Password hashes (scrypt, computed by the server). Never readable through the API role.
create table public.account_passwords (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  hash text not null,
  updated_at timestamptz not null default now()
);

-- Sign-in sessions. Only a SHA-256 hash of the token is stored.
create table public.sessions (
  token_hash text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  client text not null check (client in ('app', 'web')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index sessions_account on public.sessions (account_id);

create table public.staff_permissions (
  account_id uuid not null references public.accounts (id) on delete cascade,
  permission public.staff_permission not null,
  primary key (account_id, permission)
);

-- Trained student guides. Staff use topics/languages when choosing a guide;
-- nothing is matched automatically.
create table public.guide_profiles (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  topics public.request_topic[] not null default '{}',
  languages text[] not null default '{en}',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.accounts (id)
);
-- all_requests: support staff read every thread. reported_only: support staff
-- read the question of every request, but messages only of reported requests
-- and of requests staff are handling (with_staff, follow_up, or staff_id set).
insert into public.settings (key, value) values ('supervision_mode', 'all_requests');

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.accounts (id),
  student_name text not null,
  topic public.request_topic not null,
  -- null = any language
  language text check (language ~ '^[a-z]{2,3}$'),
  question text not null check (char_length(btrim(question)) between 1 and 1000),
  status public.request_status not null default 'submitted',
  guide_id uuid references public.accounts (id),
  guide_name text,
  assigned_by uuid references public.accounts (id),
  assigned_at timestamptz,
  -- The staff member handling it (kept with staff, following up, or resolving).
  staff_id uuid references public.accounts (id),
  staff_name text,
  -- Kept with staff (counseling, safety, private matters).
  sensitive boolean not null default false,
  resolution_note text check (char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (guide_id is distinct from student_id)
);
create index support_requests_student on public.support_requests (student_id);
create index support_requests_guide on public.support_requests (guide_id);
create index support_requests_open on public.support_requests (created_at) where status <> 'resolved';

create table public.request_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.support_requests (id) on delete cascade,
  sender_id uuid not null references public.accounts (id),
  sender_role text not null check (sender_role in ('student', 'guide', 'staff')),
  sender_name text not null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index request_messages_request on public.request_messages (request_id, id);

-- History of each request (submitted, assigned, declined, viewed, ...), for staff.
create table public.request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.support_requests (id) on delete cascade,
  actor_id uuid references public.accounts (id),
  actor_name text,
  kind text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index request_events_request on public.request_events (request_id, id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests (id) on delete cascade,
  reporter_id uuid not null references public.accounts (id),
  reporter_name text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.accounts (id)
);
create index reports_request on public.reports (request_id);

-- Account and setting changes, for staff who manage accounts.
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.accounts (id),
  action text not null,
  target_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz,
  location text check (char_length(location) <= 120),
  body text not null default '' check (char_length(body) <= 600),
  -- File name in the server's photo folder.
  photo_path text check (photo_path ~ '^[a-z0-9-]{8,80}\.(jpg|png|webp|heic)$'),
  sample boolean not null default false,
  status public.update_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.accounts (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index updates_feed on public.updates (status, published_at desc);

-- ---------------------------------------------------------------- helpers

-- The signed-in account (set by the server per transaction), or null.
create function public.current_account() returns uuid
language sql stable as $$
  select nullif(current_setting('app.account_id', true), '')::uuid
$$;

-- Security definer so policies can consult accounts and permissions without
-- granting the caller access to them. All are stable and read-only.

create function public.my_kind() returns public.account_kind
language sql stable security definer set search_path = public as $$
  select kind from public.accounts where id = public.current_account() and not disabled
$$;

create function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select display_name from public.accounts where id = public.current_account()
$$;

create function public.has_permission(p public.staff_permission) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_permissions s join public.accounts a on a.id = s.account_id
    where s.account_id = public.current_account() and s.permission = p and a.kind = 'staff' and not a.disabled)
$$;

create function public.is_active_guide(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.guide_profiles g join public.accounts x on x.id = g.account_id
    where g.account_id = a and g.active and x.kind = 'student' and not x.disabled)
$$;

create function public.supervise_all() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'all_requests' from public.settings where key = 'supervision_mode'), true)
$$;

-- The student who asked, or the guide it is assigned to.
create function public.is_party(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.support_requests x
    where x.id = r and public.current_account() in (x.student_id, x.guide_id))
$$;

-- Support staff may read a thread's messages (see supervision_mode).
create function public.staff_reads_thread(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission('support') and (
    public.supervise_all()
    or exists (select 1 from public.reports p where p.request_id = r)
    or exists (select 1 from public.support_requests x where x.id = r
      and (x.status in ('with_staff', 'follow_up') or x.staff_id = public.current_account())))
$$;

create function public.can_see_request(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_party(r) or public.has_permission('support')
$$;

create function public.can_read_thread(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_party(r) or public.staff_reads_thread(r)
$$;

-- ---------------------------------------------------------------- triggers

create function public.touch_update() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := now();
  elsif new.status = 'draft' then
    new.published_at := null;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_account(), new.created_by);
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger updates_touch before insert or update on public.updates
  for each row execute function public.touch_update();

-- Real-time hints: ids only. The server checks who may see the row before
-- forwarding, and clients fetch the content through the API.
create function public.notify_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'support_requests' then
    perform pg_notify('bell', json_build_object('t', 'request', 'id', new.id)::text);
  elsif tg_table_name = 'request_messages' then
    perform pg_notify('bell', json_build_object('t', 'message', 'request', new.request_id, 'id', new.id)::text);
  elsif tg_table_name = 'reports' then
    perform pg_notify('bell', json_build_object('t', 'request', 'id', new.request_id)::text);
  else
    perform pg_notify('bell', json_build_object('t', 'updates')::text);
  end if;
  return null;
end $$;
create trigger support_requests_notify after insert or update on public.support_requests
  for each row execute function public.notify_change();
create trigger request_messages_notify after insert on public.request_messages
  for each row execute function public.notify_change();
create trigger reports_notify after insert or update on public.reports
  for each row execute function public.notify_change();
create trigger updates_notify after insert or update or delete on public.updates
  for each statement execute function public.notify_change();

-- ---------------------------------------------------------------- privileges

alter table public.accounts enable row level security;
alter table public.account_passwords enable row level security;
alter table public.sessions enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.guide_profiles enable row level security;
alter table public.settings enable row level security;
alter table public.support_requests enable row level security;
alter table public.request_messages enable row level security;
alter table public.request_events enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;
alter table public.updates enable row level security;

-- Accounts: your own; staff who support or manage accounts see all.
grant select on public.accounts to app_user;
create policy "accounts: own or staff" on public.accounts for select to app_user
  using (id = public.current_account() or public.has_permission('support') or public.has_permission('manage_accounts'));

grant select on public.staff_permissions to app_user;
create policy "permissions: own or managers" on public.staff_permissions for select to app_user
  using (account_id = public.current_account() or public.has_permission('manage_accounts'));

grant select on public.guide_profiles to app_user;
create policy "guide profiles: own or staff" on public.guide_profiles for select to app_user
  using (account_id = public.current_account() or public.has_permission('support') or public.has_permission('manage_accounts'));

grant select on public.settings to app_user;
create policy "settings: everyone" on public.settings for select to app_user using (true);

-- Support requests: the student, the assigned guide, and support staff. No direct writes.
grant select on public.support_requests to app_user;
create policy "requests: parties or support" on public.support_requests for select to app_user
  using (public.can_see_request(id));

grant select on public.request_messages to app_user;
create policy "messages: parties or supervising staff" on public.request_messages for select to app_user
  using (public.can_read_thread(request_id));

grant select on public.request_events to app_user;
create policy "events: support" on public.request_events for select to app_user
  using (public.has_permission('support'));

grant select on public.reports to app_user;
create policy "reports: support" on public.reports for select to app_user
  using (public.has_permission('support'));

grant select on public.audit_log to app_user;
create policy "audit: managers" on public.audit_log for select to app_user
  using (public.has_permission('manage_accounts'));

-- Updates: anyone reads published ones; staff with `updates` do the rest.
grant select, insert, update, delete on public.updates to app_user;
create policy "updates: published or editors" on public.updates for select to app_user
  using (status = 'published' or public.has_permission('updates'));
create policy "updates: editors insert" on public.updates for insert to app_user
  with check (public.has_permission('updates'));
create policy "updates: editors update" on public.updates for update to app_user
  using (public.has_permission('updates')) with check (public.has_permission('updates'));
create policy "updates: editors delete" on public.updates for delete to app_user
  using (public.has_permission('updates'));

-- ---------------------------------------------------------------- sign-in functions
-- Called by the server before anyone is signed in.

create function public.auth_lookup(p_email text)
returns table (account_id uuid, hash text, disabled boolean)
language sql stable security definer set search_path = public as $$
  select a.id, p.hash, a.disabled from public.accounts a
  join public.account_passwords p on p.account_id = a.id
  where a.email = lower(btrim(p_email))
$$;

create function public.session_create(p_account uuid, p_token_hash text, p_client text, p_days integer)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare expires timestamptz := now() + make_interval(days => least(greatest(p_days, 1), 90));
begin
  if not exists (select 1 from public.accounts where id = p_account and not disabled) then
    raise exception 'Account not available' using errcode = '42501';
  end if;
  insert into public.sessions (token_hash, account_id, client, expires_at)
  values (p_token_hash, p_account, p_client, expires);
  return expires;
end $$;

-- The account behind a session token, if it is still valid.
create function public.session_resolve(p_token_hash text)
returns table (id uuid, email text, display_name text, kind public.account_kind)
language plpgsql security definer set search_path = public as $$
begin
  update public.sessions set last_seen_at = now()
  where token_hash = p_token_hash and last_seen_at < now() - interval '5 minutes';
  return query select a.id, a.email, a.display_name, a.kind
    from public.sessions s join public.accounts a on a.id = s.account_id
    where s.token_hash = p_token_hash and s.expires_at > now() and not a.disabled;
end $$;

create function public.session_delete(p_token_hash text) returns void
language sql security definer set search_path = public as $$
  delete from public.sessions where token_hash = p_token_hash
$$;

-- ---------------------------------------------------------------- support functions

create function public.log_event(r uuid, k text, d text default null) returns void
language sql security definer set search_path = public as $$
  insert into public.request_events (request_id, actor_id, actor_name, kind, detail)
  values (r, public.current_account(), public.my_name(), k, d)
$$;

create function public.submit_request(p_topic public.request_topic, p_language text, p_question text)
returns public.support_requests
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_account();
  rec public.support_requests;
begin
  if public.my_kind() is distinct from 'student' then
    raise exception 'Only students can ask for help.' using errcode = '42501';
  end if;
  if (select count(*) from public.support_requests where student_id = me and status <> 'resolved') >= 2 then
    raise exception 'You already have two open requests. Wait for one to be resolved first.' using errcode = 'P0001';
  end if;
  insert into public.support_requests (student_id, student_name, topic, language, question)
  values (me, public.my_name(), p_topic, nullif(p_language, ''), btrim(p_question))
  returning * into rec;
  perform public.log_event(rec.id, 'submitted');
  return rec;
end $$;

-- A student may take back a request no one has picked up yet.
create function public.withdraw_request(p_id uuid) returns public.support_requests
language plpgsql security definer set search_path = public as $$
declare rec public.support_requests;
begin
  update public.support_requests set status = 'resolved', resolved_at = now(), updated_at = now(),
    resolution_note = 'Withdrawn by the student.'
  where id = p_id and student_id = public.current_account() and status = 'submitted'
  returning * into rec;
  if rec.id is null then raise exception 'Only a request still waiting for review can be withdrawn.' using errcode = 'P0001'; end if;
  perform public.log_event(p_id, 'withdrawn');
  return rec;
end $$;

-- Staff choose the guide. No automatic matching.
create function public.assign_guide(p_id uuid, p_guide uuid) returns public.support_requests
language plpgsql security definer set search_path = public as $$
declare rec public.support_requests;
begin
  if not public.has_permission('support') then raise exception 'Only support staff can assign guides.' using errcode = '42501'; end if;
  if not public.is_active_guide(p_guide) then raise exception 'That account is not an active guide.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.support_requests where id = p_id and student_id = p_guide) then
    raise exception 'A guide cannot be assigned their own request.' using errcode = 'P0001';
  end if;
  update public.support_requests set status = 'with_guide', guide_id = p_guide,
    guide_name = (select display_name from public.accounts where id = p_guide),
    assigned_by = public.current_account(), assigned_at = now(), updated_at = now()
  where id = p_id and status = 'submitted'
  returning * into rec;
  if rec.id is null then raise exception 'This request is not waiting for review.' using errcode = 'P0001'; end if;
  perform public.log_event(p_id, 'assigned', rec.guide_name);
  return rec;
end $$;

-- Sensitive concerns stay with qualified staff.
create function public.keep_with_staff(p_id uuid) returns public.support_requests
language plpgsql security definer set search_path = public as $$
declare rec public.support_requests;
begin
  if not public.has_permission('support') then raise exception 'Only support staff can take requests.' using errcode = '42501'; end if;
  update public.support_requests set status = 'with_staff', sensitive = true,
    staff_id = public.current_account(), staff_name = public.my_name(), updated_at = now()
  where id = p_id and status = 'submitted'
  returning * into rec;
  if rec.id is null then raise exception 'This request is not waiting for review.' using errcode = 'P0001'; end if;
  perform public.log_event(p_id, 'kept_by_staff');
  return rec;
end $$;

create function public.decline_request(p_id uuid, p_reason text) returns public.support_requests
language plpgsql security definer set search_path = public as $$
declare rec public.support_requests;
begin
  update public.support_requests set status = 'submitted', guide_id = null, guide_name = null,
    assigned_by = null, assigned_at = null, updated_at = now()
  where id = p_id and guide_id = public.current_account() and status = 'with_guide'
  returning * into rec;
  if rec.id is null then raise exception 'Only the assigned guide can decline this request.' using errcode = 'P0001'; end if;
  perform public.log_event(p_id, 'declined', nullif(left(btrim(coalesce(p_reason, '')), 500), ''));
  return rec;
end $$;

create function public.mark_guide_done(p_id uuid, p_note text) returns public.support_requests
language plpgsql security definer set search_path = public as $$
declare rec public.support_requests;
begin
  update public.support_requests set status = 'follow_up', updated_at = now()
  where id = p_id and guide_id = public.current_account() and status = 'with_guide'
  returning * into rec;
  if rec.id is null then raise exception 'Only the assigned guide can mark this request done.' using errcode = 'P0001'; end if;
  perform public.log_event(p_id, 'guide_done', nullif(left(btrim(coalesce(p_note, '')), 500), ''));
  return rec;
end $$;

create function public.resolve_request(p_id uuid, p_note text) returns public.support_requests
language plpgsql security definer set search_path = public as $$
declare rec public.support_requests;
begin
  if not public.has_permission('support') then raise exception 'Only support staff can resolve requests.' using errcode = '42501'; end if;
  update public.support_requests set status = 'resolved', resolved_at = now(), updated_at = now(),
    resolution_note = nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
    staff_id = coalesce(staff_id, public.current_account()), staff_name = coalesce(staff_name, public.my_name())
  where id = p_id and status <> 'resolved'
  returning * into rec;
  if rec.id is null then raise exception 'This request is already resolved.' using errcode = 'P0001'; end if;
  perform public.log_event(p_id, 'resolved', rec.resolution_note);
  return rec;
end $$;

-- Messages exist only inside an assigned, open request.
create function public.send_message(p_id uuid, p_body text) returns public.request_messages
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_account();
  r public.support_requests;
  role text;
  rec public.request_messages;
begin
  select * into r from public.support_requests where id = p_id;
  if r.id is null or not public.can_read_thread(p_id) then
    raise exception 'Not your request.' using errcode = '42501';
  end if;
  if r.status in ('submitted', 'resolved') then
    raise exception 'Messages can be sent only while the request is open with a guide or staff.' using errcode = 'P0001';
  end if;
  if me = r.student_id then role := 'student';
  elsif me = r.guide_id and r.status in ('with_guide', 'follow_up') then role := 'guide';
  elsif public.staff_reads_thread(p_id) then
    role := 'staff';
    if r.staff_id is null then
      update public.support_requests set staff_id = me, staff_name = public.my_name(), updated_at = now() where id = p_id;
    end if;
  else
    raise exception 'You cannot send messages in this request.' using errcode = '42501';
  end if;
  insert into public.request_messages (request_id, sender_id, sender_role, sender_name, body)
  values (p_id, me, role, public.my_name(), btrim(p_body)) returning * into rec;
  return rec;
end $$;

create function public.report_request(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.is_party(p_id) then raise exception 'Not your request.' using errcode = '42501'; end if;
  insert into public.reports (request_id, reporter_id, reporter_name, reason)
  values (p_id, public.current_account(), public.my_name(), btrim(p_reason)) returning id into rid;
  perform public.log_event(p_id, 'reported');
  return rid;
end $$;

create function public.resolve_report(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if not public.has_permission('support') then raise exception 'Only support staff can resolve reports.' using errcode = '42501'; end if;
  update public.reports set resolved_at = now(), resolved_by = public.current_account()
  where id = p_id and resolved_at is null returning request_id into r;
  if r is not null then perform public.log_event(r, 'report_resolved'); end if;
end $$;

-- Staff reading a thread they are not handling is recorded (at most every 10 minutes).
create function public.record_staff_view(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.is_party(p_id) or not public.staff_reads_thread(p_id)
    or exists (select 1 from public.support_requests where id = p_id and staff_id = public.current_account()) then
    return;
  end if;
  if not exists (select 1 from public.request_events where request_id = p_id and kind = 'viewed'
      and actor_id = public.current_account() and created_at > now() - interval '10 minutes') then
    perform public.log_event(p_id, 'viewed');
  end if;
end $$;

-- ---------------------------------------------------------------- account management

create function public.audit(a text, t uuid, d jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, target_id, detail) values (public.current_account(), a, t, d)
$$;

create function public.require_manager() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('manage_accounts') then
    raise exception 'Only staff who manage accounts can do this.' using errcode = '42501';
  end if;
end $$;

create function public.set_supervision_mode(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_manager();
  if p_mode not in ('all_requests', 'reported_only') then raise exception 'Unknown supervision mode.' using errcode = 'P0001'; end if;
  update public.settings set value = p_mode, updated_at = now(), updated_by = public.current_account()
  where key = 'supervision_mode';
  perform public.audit('set_supervision_mode', null, jsonb_build_object('mode', p_mode));
end $$;

create function public.create_account(p_email text, p_name text, p_kind public.account_kind) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform public.require_manager();
  insert into public.accounts (email, display_name, kind) values (lower(btrim(p_email)), btrim(p_name), p_kind)
  returning accounts.id into new_id;
  perform public.audit('create_account', new_id, jsonb_build_object('email', lower(btrim(p_email)), 'kind', p_kind));
  return new_id;
end $$;

-- The server hashes the password; the hash never comes back out.
create function public.set_account_password(p_account uuid, p_hash text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_manager();
  insert into public.account_passwords (account_id, hash) values (p_account, p_hash)
  on conflict (account_id) do update set hash = excluded.hash, updated_at = now();
  delete from public.sessions where account_id = p_account;
  perform public.audit('set_password', p_account);
end $$;

create function public.set_account_disabled(p_account uuid, p_disabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_manager();
  if p_account = public.current_account() then raise exception 'You cannot disable your own account.' using errcode = 'P0001'; end if;
  update public.accounts set disabled = p_disabled where id = p_account;
  if p_disabled then delete from public.sessions where account_id = p_account; end if;
  perform public.audit(case when p_disabled then 'disable_account' else 'enable_account' end, p_account);
end $$;

create function public.set_staff_permissions(p_account uuid, p_permissions public.staff_permission[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_manager();
  if (select kind from public.accounts where id = p_account) is distinct from 'staff' then
    raise exception 'Permissions are for staff accounts.' using errcode = 'P0001';
  end if;
  if p_account = public.current_account() and not ('manage_accounts' = any (p_permissions)) then
    raise exception 'You cannot remove your own account management permission.' using errcode = 'P0001';
  end if;
  delete from public.staff_permissions where account_id = p_account;
  insert into public.staff_permissions (account_id, permission)
  select p_account, p from unnest(p_permissions) as p group by p;
  perform public.audit('set_permissions', p_account, jsonb_build_object('permissions', p_permissions));
end $$;

create function public.set_guide_profile(p_account uuid, p_topics public.request_topic[], p_languages text[], p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_manager();
  if (select kind from public.accounts where id = p_account) is distinct from 'student' then
    raise exception 'Guides are student accounts.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_languages) l where l !~ '^[a-z]{2,3}$') then
    raise exception 'Languages must be codes like en or es.' using errcode = 'P0001';
  end if;
  insert into public.guide_profiles (account_id, topics, languages, active)
  values (p_account, p_topics, p_languages, p_active)
  on conflict (account_id) do update set topics = excluded.topics, languages = excluded.languages,
    active = excluded.active, updated_at = now();
  perform public.audit('set_guide_profile', p_account,
    jsonb_build_object('topics', p_topics, 'languages', p_languages, 'active', p_active));
end $$;

-- ---------------------------------------------------------------- function privileges
-- Postgres lets PUBLIC execute every new function; revoke and grant back only these.

revoke execute on all functions in schema public from public;
grant execute on function
  public.current_account(), public.my_kind(), public.my_name(), public.has_permission(public.staff_permission),
  public.is_active_guide(uuid), public.supervise_all(), public.is_party(uuid), public.staff_reads_thread(uuid),
  public.can_see_request(uuid), public.can_read_thread(uuid),
  public.auth_lookup(text), public.session_create(uuid, text, text, integer), public.session_resolve(text),
  public.session_delete(text),
  public.submit_request(public.request_topic, text, text), public.withdraw_request(uuid),
  public.assign_guide(uuid, uuid), public.keep_with_staff(uuid), public.decline_request(uuid, text),
  public.mark_guide_done(uuid, text), public.resolve_request(uuid, text), public.send_message(uuid, text),
  public.report_request(uuid, text), public.resolve_report(uuid), public.record_staff_view(uuid),
  public.set_supervision_mode(text), public.create_account(text, text, public.account_kind),
  public.set_account_password(uuid, text), public.set_account_disabled(uuid, boolean),
  public.set_staff_permissions(uuid, public.staff_permission[]),
  public.set_guide_profile(uuid, public.request_topic[], text[], boolean)
to app_user;
