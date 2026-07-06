-- minddy — use the Supabase auth "display name" for profiles.full_name.
--
-- The display name may live under different metadata keys depending on the
-- provider (email signup writes `full_name`; some providers/OAuth write
-- `name`; the dashboard writes `display_name`). Capture the best available so
-- the app shows a real name everywhere instead of the raw email. Idempotent.

-- ── keep profiles' display name in sync with auth.users ──────────────────────
create or replace function public.handle_auth_user_upsert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  display text := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), '')
  );
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, display)
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

-- ── backfill display names for existing accounts that don't have one ─────────
update public.profiles p
set full_name = coalesce(
      nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), '')
    ),
    updated_at = now()
from auth.users u
where u.id = p.id
  and (p.full_name is null or trim(p.full_name) = '')
  and coalesce(
      nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), '')
    ) is not null;
