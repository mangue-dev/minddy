-- A page thread can be resolved again (MIN-1002). The state lives on the
-- thread's root: who settled it and when. A resolved thread leaves the page
-- and stays readable, and reopenable, in the page activity.
--
-- Both columns are nullable and unread by the previous release, which keeps
-- showing every thread as open.
alter table public.page_comments
  add column resolved_at timestamptz,
  add column resolved_by uuid references auth.users (id) on delete set null,
  add constraint page_comments_resolution_on_root
    check (resolved_at is null or parent_id is null),
  add constraint page_comments_resolver_with_date
    check (resolved_by is null or resolved_at is not null);

-- Resolving is written by the server after its own access check; client
-- roles stay limited to body edits by `guard_comment_client_update`.
--
-- Resolving or reopening a thread does not edit its first comment: the
-- comment's `updated_at`, which the interface reads as "edited", stays.
-- `guard_comment_encryption` runs first and advances `encryption_revision`
-- for any change, so the revision is left out of the comparison too: an
-- edit always changes another column.
create or replace function public.set_comment_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('minddy.encryption_maintenance', true) = 'on'
    or (to_jsonb(new) - array['encryption_checked_at','encryption_revision','updated_at','resolved_at','resolved_by'])
      = (to_jsonb(old) - array['encryption_checked_at','encryption_revision','updated_at','resolved_at','resolved_by']) then
    new.updated_at := old.updated_at;
  else new.updated_at := clock_timestamp(); end if;
  return new;
end;
$$;
revoke all on function public.set_comment_updated_at() from public, anon, authenticated;
