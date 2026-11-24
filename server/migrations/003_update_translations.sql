-- Updates in more languages: staff may write a Spanish, Armenian and Russian
-- version of an update's title, location and text. Each part is optional; the
-- app shows the student's language and falls back to the English part.
--   translations = {"es": {"title": "...", "location": "...", "body": "..."}, "hy": {...}, "ru": {...}}
-- Translations live on the update row, so they follow its row rules (drafts: editors only).

create function public.valid_update_translations(t jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(t) = 'object'
    and not exists (
      select 1 from jsonb_each(t) as lang(code, version)
      where lang.code not in ('es', 'hy', 'ru')
        or jsonb_typeof(lang.version) <> 'object'
        or exists (select 1 from jsonb_object_keys(lang.version) as k where k not in ('title', 'location', 'body'))
        or char_length(coalesce(lang.version ->> 'title', '')) > 120
        or char_length(coalesce(lang.version ->> 'location', '')) > 120
        or char_length(coalesce(lang.version ->> 'body', '')) > 600)
$$;

alter table public.updates
  add column translations jsonb not null default '{}'
  check (public.valid_update_translations(translations));

-- The check runs as the editor saving the row, so app_user needs it.
revoke execute on function public.valid_update_translations(jsonb) from public;
grant execute on function public.valid_update_translations(jsonb) to app_user;
