-- minddy — chantier 2 (complément) « Membres & invitations »
-- Adds a `profiles` mirror of auth.users so the server can resolve an email to
-- a minddy account (invitations are IN-APP: the email only finds the account,
-- no email is ever sent). Profiles are read SERVER-SIDE ONLY via the service
-- client — RLS exposes nothing but your own row, so emails never leak to clients.
-- Idempotent — safe to re-run.

-- ── profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles(lower(email));

alter table public.profiles enable row level security;

-- Only your own profile is client-readable/updatable. All cross-user lookups
-- (invite resolution, member/inviter hydration) go through the service client.
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select
  using (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- ── keep profiles in sync with auth.users ────────────────────────────────────
create or replace function public.handle_auth_user_upsert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_auth_user_upsert();

-- Backfill existing accounts (the account you already created).
insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data->>'full_name'
from auth.users
on conflict (id) do nothing;

-- ── Realtime: invitations (the invitee's Home banner updates live) ───────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_invitations'
  ) then
    alter publication supabase_realtime add table public.project_invitations;
  end if;
end $$;
