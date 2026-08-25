-- MIN-449 — user avatars can use either a generated Lorelei seed or an
-- uploaded image. Only the service role writes this bucket; images are public
-- because user avatars already appear on public boards and shared views.

alter table public.user_avatars
  add column if not exists image_path text;

alter table public.user_avatars
  drop constraint if exists user_avatars_image_path_ck;

alter table public.user_avatars
  add constraint user_avatars_image_path_ck
  check (
    image_path is null
    or image_path = 'users/' || user_id::text || '.webp'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  true,
  10485760,
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
