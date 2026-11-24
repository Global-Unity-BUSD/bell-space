-- Unread indicators for support staff: what each staff member has already seen.
-- A request is "unread" for a staff member when a student or guide did something
-- after that staff member last opened it: a new question, a message, a guide
-- declining or marking it done, or a report. Staff actions never make it unread.
-- Resolved requests are never unread. Saved per account (every computer agrees).
--
-- "Seen" is the newest message and history entry ids at the time of opening, not
-- a time: ids always increase, so an action in the same instant cannot be missed.

create table public.request_reads (
  account_id uuid not null references public.accounts (id) on delete cascade,
  request_id uuid not null references public.support_requests (id) on delete cascade,
  seen_message_id bigint not null default 0,
  seen_event_id bigint not null default 0,
  seen_at timestamptz not null default now(),
  primary key (account_id, request_id)
);
-- Read and written only through the functions below.
alter table public.request_reads enable row level security;

-- Opening a request (GET /v1/support/requests/:id) marks it read for that staff member.
create function public.mark_request_read(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('support') then return; end if;
  insert into public.request_reads (account_id, request_id, seen_message_id, seen_event_id)
  values (public.current_account(), p_id,
    coalesce((select max(id) from public.request_messages where request_id = p_id), 0),
    coalesce((select max(id) from public.request_events where request_id = p_id), 0))
  on conflict (account_id, request_id) do update set
    seen_message_id = excluded.seen_message_id, seen_event_id = excluded.seen_event_id, seen_at = now();
end $$;

-- The open requests with something new for the signed-in staff member.
-- Messages count only where that staff member may read the thread (supervision setting).
create function public.unread_requests() returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from public.support_requests r
  left join public.request_reads seen on seen.request_id = r.id and seen.account_id = public.current_account()
  where public.has_permission('support') and r.status <> 'resolved'
    and (seen.request_id is null
      or exists (select 1 from public.request_messages m
        where m.request_id = r.id and m.id > seen.seen_message_id and m.sender_role in ('student', 'guide')
          and public.staff_reads_thread(r.id))
      or exists (select 1 from public.request_events e
        where e.request_id = r.id and e.id > seen.seen_event_id and e.kind in ('declined', 'guide_done', 'reported')))
$$;

revoke execute on function public.mark_request_read(uuid), public.unread_requests() from public;
grant execute on function public.mark_request_read(uuid), public.unread_requests() to app_user;
