-- Reading a thread checks access once, not once per message.
-- The row rule on request_messages ("messages: parties or supervising staff")
-- calls can_read_thread(request_id) for every row, so a long thread repeats the
-- same check hundreds of times. This function applies the same rule once and
-- then returns the messages. The row rule stays as the safety net for any
-- direct select.

create function public.thread_messages(p_id uuid, p_after bigint default 0, p_limit int default 500)
returns setof public.request_messages
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_read_thread(p_id) then
    return;
  end if;
  return query
    select * from public.request_messages m
    where m.request_id = p_id and m.id > p_after
    order by m.id
    limit least(greatest(p_limit, 0), 500);
end $$;

revoke execute on function public.thread_messages(uuid, bigint, int) from public;
grant execute on function public.thread_messages(uuid, bigint, int) to app_user;
