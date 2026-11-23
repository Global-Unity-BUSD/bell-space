-- Bell Space two-phone pilot: guide Chat and Updates.
-- Paste into the Supabase SQL editor (or `supabase db push`). Idempotent only on
-- a fresh project. Access is enforced here, in Postgres, not by the app:
-- * every table has row-level security, and the app roles get only the grants
--   listed below (Supabase's default "all privileges" grants are revoked);
-- * all chat changes go through the security-definer functions at the end,
--   which check who is calling.

-- ---------------------------------------------------------------- types

create type public.app_role as enum ('student', 'guide', 'admin');
create type public.chat_topic as enum ('navigation', 'new_student', 'clubs', 'other');
create type public.chat_status as enum ('pending', 'active', 'closed');
create type public.update_status as enum ('draft', 'published');

-- ---------------------------------------------------------------- tables

-- One row per account. Roles are set by staff (seed script or SQL editor),
-- never by the app.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 40),
  role public.app_role not null default 'student',
  created_at timestamptz not null default now()
);

-- Approved guides: the topics and languages they may take, and whether they
-- are available right now (the only thing a guide changes, via set_available).
create table public.guide_settings (
  guide_id uuid primary key references public.profiles (id) on delete cascade,
  topics public.chat_topic[] not null default '{}',
  languages text[] not null default '{en}',
  available boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  topic public.chat_topic not null,
  -- null = any language
  language text check (language ~ '^[a-z]{2,3}$'),
  anonymous boolean not null,
  -- First name shown to the guide; null when the student asked anonymously.
  student_name text,
  question text not null check (char_length(btrim(question)) between 1 and 1000),
  status public.chat_status not null default 'pending',
  guide_id uuid references public.profiles (id),
  guide_name text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  closed_by text check (closed_by in ('student', 'guide', 'reviewer'))
);
create index conversations_pending on public.conversations (created_at) where status = 'pending';
create index conversations_guide on public.conversations (guide_id);

-- Which account asked. Kept apart from `conversations` so a guide can never
-- read it, whether or not the question is anonymous. Reviewers can, for
-- reported conversations.
create table public.conversation_owners (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  student_id uuid not null references public.profiles (id)
);
create index conversation_owners_student on public.conversation_owners (student_id);

-- Messages carry the side (student or guide), not an account id, so an
-- anonymous student is not identifiable from their messages. The account is
-- known from conversation_owners / conversations.guide_id.
create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  from_student boolean not null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_conversation on public.messages (conversation_id, id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_conversation on public.reports (conversation_id);

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz,
  location text check (char_length(location) <= 120),
  body text not null default '' check (char_length(body) <= 600),
  -- Path in the update-photos bucket.
  photo_path text,
  -- Sample content for the pilot, labelled as such in the app.
  sample boolean not null default false,
  status public.update_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index updates_feed on public.updates (status, published_at desc);

-- ---------------------------------------------------------------- helpers
-- Security definer so policies can consult profiles/guide settings without
-- granting the caller access to them. All are stable and read-only.

create function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create function public.owns_conversation(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_owners o where o.conversation_id = c and o.student_id = auth.uid())
$$;

create function public.is_participant(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.owns_conversation(c)
    or exists (select 1 from public.conversations x where x.id = c and x.guide_id = auth.uid())
$$;

-- Reviewers (admins) see a conversation only once someone has reported it.
create function public.can_review(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and exists (select 1 from public.reports r where r.conversation_id = c)
$$;

-- An approved guide who is available and covers this topic and language.
create function public.guide_matches(t public.chat_topic, lang text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p join public.guide_settings g on g.guide_id = p.id
    where p.id = auth.uid() and p.role = 'guide' and g.available
      and t = any (g.topics) and (lang is null or lang = any (g.languages)))
$$;

-- ---------------------------------------------------------------- triggers

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Every new account starts as a student; staff promote guides and admins.
  insert into public.profiles (id, first_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 40));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

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
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger updates_touch before insert or update on public.updates
  for each row execute function public.touch_update();

-- ---------------------------------------------------------------- privileges

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.guide_settings enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_owners enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.updates enable row level security;

-- Profiles: your own; admins see all (to identify reported accounts).
grant select on public.profiles to authenticated;
create policy "profiles: own or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

grant select on public.guide_settings to authenticated;
create policy "guide settings: own or admin" on public.guide_settings for select to authenticated
  using (guide_id = auth.uid() or public.is_admin());

-- Conversations: participants; a matching available guide while it is
-- pending (the queue); reviewers once reported. No direct writes.
grant select on public.conversations to authenticated;
create policy "conversations: participants" on public.conversations for select to authenticated
  using (public.is_participant(id));
create policy "conversations: matching guide queue" on public.conversations for select to authenticated
  using (status = 'pending' and public.guide_matches(topic, language) and not public.owns_conversation(id));
create policy "conversations: reviewers of reported" on public.conversations for select to authenticated
  using (public.can_review(id));

grant select on public.conversation_owners to authenticated;
create policy "owners: the student or reviewers" on public.conversation_owners for select to authenticated
  using (student_id = auth.uid() or public.can_review(conversation_id));

grant select on public.messages to authenticated;
create policy "messages: participants or reviewers" on public.messages for select to authenticated
  using (public.is_participant(conversation_id) or public.can_review(conversation_id));

grant select on public.reports to authenticated;
create policy "reports: admins" on public.reports for select to authenticated using (public.is_admin());

-- Updates: anyone (signed in or not) reads published ones; admins do the rest.
grant select on public.updates to anon, authenticated;
grant insert, update, delete on public.updates to authenticated;
create policy "updates: published or admin" on public.updates for select to anon, authenticated
  using (status = 'published' or public.is_admin());
create policy "updates: admins insert" on public.updates for insert to authenticated
  with check (public.is_admin());
create policy "updates: admins update" on public.updates for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "updates: admins delete" on public.updates for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------- chat functions

-- Number of other available guides for a topic/language (no identities).
create function public.guides_available(p_topic public.chat_topic, p_language text default null) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles p join public.guide_settings g on g.guide_id = p.id
  where p.role = 'guide' and g.available and p.id <> auth.uid()
    and p_topic = any (g.topics) and (p_language is null or p_language = any (g.languages))
$$;

create function public.ask_guide(p_topic public.chat_topic, p_language text, p_anonymous boolean, p_question text)
returns public.conversations
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  rec public.conversations;
begin
  if me is null then raise exception 'Sign in to ask a question' using errcode = '42501'; end if;
  if (select count(*) from public.conversation_owners o join public.conversations c on c.id = o.conversation_id
      where o.student_id = me and c.status <> 'closed') >= 2 then
    raise exception 'You already have two open questions. End one first.' using errcode = 'P0001';
  end if;
  insert into public.conversations (topic, language, anonymous, student_name, question)
  values (p_topic, nullif(p_language, ''), p_anonymous,
    case when p_anonymous then null else (select nullif(first_name, '') from public.profiles where id = me) end,
    btrim(p_question))
  returning * into rec;
  insert into public.conversation_owners (conversation_id, student_id) values (rec.id, me);
  return rec;
end $$;

-- One guide accepts; a second accept, or a guide outside the topic/language,
-- gets an error.
create function public.accept_conversation(p_id uuid) returns public.conversations
language plpgsql security definer set search_path = public as $$
declare rec public.conversations;
begin
  update public.conversations c set status = 'active', guide_id = auth.uid(), accepted_at = now(),
    guide_name = (select nullif(first_name, '') from public.profiles where id = auth.uid())
  where c.id = p_id and c.status = 'pending' and public.guide_matches(c.topic, c.language)
    and not public.owns_conversation(c.id)
  returning * into rec;
  if rec.id is null then
    raise exception 'This question was already taken or is not in your queue.' using errcode = 'P0001';
  end if;
  return rec;
end $$;

create function public.send_message(p_id uuid, p_body text) returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  c public.conversations;
  rec public.messages;
begin
  select * into c from public.conversations where id = p_id;
  if c.id is null or not public.is_participant(p_id) then
    raise exception 'Not your conversation' using errcode = '42501';
  end if;
  if c.status <> 'active' then raise exception 'This conversation is not active.' using errcode = 'P0001'; end if;
  insert into public.messages (conversation_id, from_student, body)
  values (p_id, public.owns_conversation(p_id), btrim(p_body)) returning * into rec;
  return rec;
end $$;

create function public.end_conversation(p_id uuid) returns public.conversations
language plpgsql security definer set search_path = public as $$
declare
  who text;
  rec public.conversations;
begin
  who := case when public.owns_conversation(p_id) then 'student'
    when exists (select 1 from public.conversations where id = p_id and guide_id = auth.uid()) then 'guide'
    when public.can_review(p_id) then 'reviewer' end;
  if who is null then raise exception 'Not your conversation' using errcode = '42501'; end if;
  update public.conversations set status = 'closed', closed_at = now(), closed_by = who
  where id = p_id and status <> 'closed' returning * into rec;
  if rec.id is null then select * into rec from public.conversations where id = p_id; end if;
  return rec;
end $$;

create function public.report_conversation(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.is_participant(p_id) then raise exception 'Not your conversation' using errcode = '42501'; end if;
  insert into public.reports (conversation_id, reporter_id, reason) values (p_id, auth.uid(), btrim(p_reason))
  returning id into rid;
  return rid;
end $$;

create function public.set_available(p_available boolean) returns public.guide_settings
language plpgsql security definer set search_path = public as $$
declare rec public.guide_settings;
begin
  if public.my_role() is distinct from 'guide' then raise exception 'Only approved guides' using errcode = '42501'; end if;
  update public.guide_settings set available = p_available, updated_at = now()
  where guide_id = auth.uid() returning * into rec;
  if rec.guide_id is null then raise exception 'Guide settings missing; ask an admin' using errcode = 'P0001'; end if;
  return rec;
end $$;

create function public.resolve_report(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only reviewers' using errcode = '42501'; end if;
  update public.reports set resolved_at = now() where id = p_id and resolved_at is null;
end $$;

-- ---------------------------------------------------------------- photos

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('update-photos', 'update-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/heic', 'image/webp']);

-- Private bucket: a photo is readable once its update is published (or by
-- admins); only admins write.
create policy "update photos: read published or admin" on storage.objects for select to anon, authenticated
  using (bucket_id = 'update-photos' and (public.is_admin()
    or exists (select 1 from public.updates u where u.photo_path = storage.objects.name and u.status = 'published')));
create policy "update photos: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'update-photos' and public.is_admin());
create policy "update photos: admins change" on storage.objects for update to authenticated
  using (bucket_id = 'update-photos' and public.is_admin()) with check (bucket_id = 'update-photos' and public.is_admin());
create policy "update photos: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'update-photos' and public.is_admin());

-- ---------------------------------------------------------------- realtime
-- Realtime delivers a change only to subscribers whose policies allow the row.

alter publication supabase_realtime add table public.conversations, public.messages, public.updates;

-- ---------------------------------------------------------------- function privileges
-- Postgres lets PUBLIC execute every new function and Supabase also grants
-- them to anon/authenticated, so revoke everything and grant back only these.

revoke execute on all functions in schema public from public, anon, authenticated;
-- Helpers used inside policies.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_role(), public.owns_conversation(uuid), public.is_participant(uuid),
  public.can_review(uuid), public.guide_matches(public.chat_topic, text) to authenticated;
-- The app's chat actions (signed-in users only; each checks the caller).
grant execute on function public.guides_available(public.chat_topic, text),
  public.ask_guide(public.chat_topic, text, boolean, text), public.accept_conversation(uuid),
  public.send_message(uuid, text), public.end_conversation(uuid), public.report_conversation(uuid, text),
  public.set_available(boolean), public.resolve_report(uuid) to authenticated;

-- ---------------------------------------------------------------- sample content

insert into public.updates (title, location, body, sample, status, created_by)
values ('Sample event: Home football game', null,
  'This is a sample update for the Bell Space pilot. The school will post real game details, including the date and opponent.',
  true, 'published', null);
