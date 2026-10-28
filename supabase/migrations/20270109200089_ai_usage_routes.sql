-- MIN-826: choose a provider per usage, and per Numo conversation.
--
-- Until now one credential served the whole "text" capability, and each
-- usage could only opt out of it back to the managed quota. A usage now names
-- its own provider: a row routes it to one of the account's credentials, no
-- row means Minddy Cloud. Deleting the credential deletes its routes, so the
-- usage falls back to Minddy Cloud on its own.
--
-- Add-only: the previous release keeps reading `user_ai_capability_assignments`
-- and `user_ai_keys.enabled_surfaces`, which stay in place until no deployed
-- code reads them.

create table public.user_ai_surface_routes (
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null,
  ai_key_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, surface),
  constraint user_ai_surface_routes_surface_check
    check (surface in ('assistant', 'automations', 'voice', 'feedback')),
  constraint user_ai_surface_routes_key_fkey
    foreign key (ai_key_id, user_id)
    references public.user_ai_keys(id, user_id)
    on delete cascade
);

comment on table public.user_ai_surface_routes is
  'Provider of each AI usage (MIN-826): a row routes the usage to one of the account credentials; no row means Minddy Cloud.';

alter table public.user_ai_surface_routes enable row level security;
alter table public.user_ai_surface_routes owner to postgres;
grant all on table public.user_ai_surface_routes to service_role;

create policy user_ai_surface_routes_select
  on public.user_ai_surface_routes
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on table public.user_ai_surface_routes to authenticated;

create index user_ai_surface_routes_key_idx
  on public.user_ai_surface_routes (ai_key_id);

create trigger user_ai_surface_routes_set_updated_at
  before update on public.user_ai_surface_routes
  for each row execute function public.set_updated_at();

-- Keep every account's current behavior: a usage enabled on the credential
-- that serves text keeps that credential.
insert into public.user_ai_surface_routes (user_id, surface, ai_key_id)
select keys.user_id, surfaces.surface, keys.id
from public.user_ai_keys as keys
join public.user_ai_capability_assignments as assignments
  on assignments.ai_key_id = keys.id
  and assignments.user_id = keys.user_id
  and assignments.capability = 'text'
cross join lateral unnest(keys.enabled_surfaces) as surfaces(surface)
where surfaces.surface in ('assistant', 'automations', 'voice', 'feedback')
on conflict (user_id, surface) do nothing;

-- A conversation remembers the provider it was set to; null follows the
-- account's Numo provider.
alter table public.conversations
  add column if not exists provider text;

alter table public.conversations
  add constraint conversations_provider_check
  check (provider is null or provider ~ '^[a-z0-9_-]{1,64}$');

comment on column public.conversations.provider is
  'Provider chosen for this conversation (MIN-826): "minddy" or a credential provider; null follows the account Numo provider.';
