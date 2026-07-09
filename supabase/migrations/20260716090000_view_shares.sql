-- minddy — MIN-26 « Liens publics : Vue partageable en lecture seule »
-- One share per view, opt-in: 'private' = no row. Levels: 'password' | 'public'.
-- The token is the public URL capability (/share/<token>); the password is
-- stored as scrypt hash + salt. RLS is enabled with NO policies on purpose:
-- token/password_hash must never transit the anon client — every access goes
-- through the service client with manual checks (lib/server/view-shares.ts).
-- Idempotent — safe to re-run.

create table if not exists public.view_shares (
  id            uuid primary key default gen_random_uuid(),
  view_id       uuid not null unique references public.views(id) on delete cascade,
  level         text not null check (level in ('password', 'public')),
  token         text not null unique,
  password_salt text,
  password_hash text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint view_shares_password_consistent
    check ((level = 'password') = (password_hash is not null and password_salt is not null))
);

alter table public.view_shares enable row level security;
-- Deny-all: no policies. Service-role only.

drop trigger if exists view_shares_set_updated_at on public.view_shares;
create trigger view_shares_set_updated_at
  before update on public.view_shares
  for each row execute function public.set_updated_at();

-- Not added to the supabase_realtime publication: the public page is a
-- one-shot server render, and the owner dialog refetches on open.
