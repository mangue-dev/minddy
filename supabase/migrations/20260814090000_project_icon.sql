-- minddy — project icon (MIN-62).
--
-- A project can carry a real icon imported from its live site's favicon; the
-- image file lives in the public `project-icons` bucket and its URL is saved on
-- `projects.icon_url`. Without one, the UI falls back to the generated orb.
-- Writes go through the service client only (owner-gated in the API route), so
-- the bucket needs no authenticated write policies. Idempotent.

alter table public.projects add column if not exists icon_url text;

insert into storage.buckets (id, name, public)
values ('project-icons', 'project-icons', true)
on conflict (id) do nothing;

-- Public read; no write policies — service-role only.
drop policy if exists "project icons public read" on storage.objects;
create policy "project icons public read" on storage.objects for select
  using (bucket_id = 'project-icons');
