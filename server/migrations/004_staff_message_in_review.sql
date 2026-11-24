-- Staff can message a student while the request is still in To review.
-- The first staff message takes the request: it moves to with_staff, handled
-- by that staff member, and is NOT marked sensitive (unlike keep_with_staff).
-- Staff can still assign a guide afterwards; the guide then sees the whole
-- thread. Sensitive requests (keep_with_staff) are never given to a guide.

create or replace function public.send_message(p_id uuid, p_body text) returns public.request_messages
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_account();
  r public.support_requests;
  role text;
  rec public.request_messages;
begin
  select * into r from public.support_requests where id = p_id;
  -- Staff writing during review take the request first (see above).
  if r.id is not null and r.status = 'submitted' and public.has_permission('support') and me <> r.student_id then
    update public.support_requests set status = 'with_staff', staff_id = me, staff_name = public.my_name(), updated_at = now()
    where id = p_id and status = 'submitted'
    returning * into r;
    if r.id is null then raise exception 'This request is not waiting for review.' using errcode = 'P0001'; end if;
    perform public.log_event(p_id, 'taken_by_staff');
  end if;
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

-- A guide can be assigned while the request waits for review, or after staff
-- took it by messaging (with_staff, not sensitive).
create or replace function public.assign_guide(p_id uuid, p_guide uuid) returns public.support_requests
language plpgsql security definer set search_path = public as $$
declare rec public.support_requests;
begin
  if not public.has_permission('support') then raise exception 'Only support staff can assign guides.' using errcode = '42501'; end if;
  if not public.is_active_guide(p_guide) then raise exception 'That account is not an active guide.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.support_requests where id = p_id and student_id = p_guide) then
    raise exception 'A guide cannot be assigned their own request.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.support_requests where id = p_id and status = 'with_staff' and sensitive) then
    raise exception 'Sensitive requests stay with staff.' using errcode = 'P0001';
  end if;
  update public.support_requests set status = 'with_guide', guide_id = p_guide,
    guide_name = (select display_name from public.accounts where id = p_guide),
    assigned_by = public.current_account(), assigned_at = now(), updated_at = now()
  where id = p_id and (status = 'submitted' or (status = 'with_staff' and not sensitive))
  returning * into rec;
  if rec.id is null then raise exception 'This request is not waiting for review.' using errcode = 'P0001'; end if;
  perform public.log_event(p_id, 'assigned', rec.guide_name);
  return rec;
end $$;
