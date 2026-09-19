-- MIN-573: allow several BYOK credentials per account and route each model
-- capability through one explicitly assigned credential.

drop index if exists public.idx_user_ai_keys_user;
create unique index if not exists idx_user_ai_keys_user_provider
  on public.user_ai_keys using btree (user_id, provider);

-- The composite key lets the assignment foreign key prove that a credential
-- belongs to the same account as the assignment itself.
create unique index if not exists idx_user_ai_keys_id_user
  on public.user_ai_keys using btree (id, user_id);

create table public.user_ai_capability_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  ai_key_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, capability),
  constraint user_ai_capability_assignments_capability_check
    check (capability in ('text', 'transcription', 'embedding')),
  constraint user_ai_capability_assignments_key_fkey
    foreign key (ai_key_id, user_id)
    references public.user_ai_keys(id, user_id)
    on delete cascade
);

alter table public.user_ai_capability_assignments enable row level security;
alter table public.user_ai_capability_assignments owner to postgres;
grant all on table public.user_ai_capability_assignments to service_role;

create policy user_ai_capability_assignments_select
  on public.user_ai_capability_assignments
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on table public.user_ai_capability_assignments to authenticated;

create trigger user_ai_capability_assignments_set_updated_at
  before update on public.user_ai_capability_assignments
  for each row execute function public.set_updated_at();

-- Preserve the former single-provider behavior for every existing account.
insert into public.user_ai_capability_assignments (user_id, capability, ai_key_id)
select keys.user_id, capabilities.capability, keys.id
from public.user_ai_keys as keys
cross join lateral unnest(
  case keys.provider
    when 'openrouter' then array['text', 'transcription', 'embedding']::text[]
    when 'openai' then array['text', 'transcription', 'embedding']::text[]
    when 'google' then array['text', 'embedding']::text[]
    else array['text']::text[]
  end
) as capabilities(capability)
on conflict (user_id, capability) do nothing;

create or replace function public.upsert_user_ai_key(
  p_user_id uuid,
  p_provider text,
  p_key_encrypted text,
  p_key_prefix text,
  p_base_url text,
  p_validated_at timestamptz
)
returns setof public.user_ai_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_key public.user_ai_keys%rowtype;
  supported_capabilities text[];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into saved_key
  from public.user_ai_keys
  where user_id = p_user_id and provider = p_provider
  for update;

  if found then
    return query
    update public.user_ai_keys
    set
      key_encrypted = p_key_encrypted,
      key_prefix = p_key_prefix,
      base_url = p_base_url,
      validated_at = p_validated_at,
      updated_at = now()
    where id = saved_key.id
    returning *;
    return;
  end if;

  insert into public.user_ai_keys (
    user_id,
    provider,
    key_encrypted,
    key_prefix,
    base_url,
    validated_at,
    enabled_surfaces,
    feature_models
  ) values (
    p_user_id,
    p_provider,
    p_key_encrypted,
    p_key_prefix,
    p_base_url,
    p_validated_at,
    case
      when p_provider in ('local_openai', 'ollama') then array['agent']::text[]
      else array['agent', 'assistant', 'automations', 'voice', 'feedback']::text[]
    end,
    '{}'::jsonb
  )
  returning * into saved_key;

  supported_capabilities := case p_provider
    when 'openrouter' then array['text', 'transcription', 'embedding']::text[]
    when 'openai' then array['text', 'transcription', 'embedding']::text[]
    when 'google' then array['text', 'embedding']::text[]
    else array['text']::text[]
  end;

  -- A first credential works immediately. Later credentials claim only model
  -- families that are still on managed Minddy until the user reassigns them.
  insert into public.user_ai_capability_assignments (user_id, capability, ai_key_id)
  select p_user_id, supported.capability, saved_key.id
  from unnest(supported_capabilities) as supported(capability)
  on conflict (user_id, capability) do nothing;

  return next saved_key;
end;
$$;

create or replace function public.delete_user_ai_key(
  p_user_id uuid,
  p_key_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  delete from public.user_ai_keys
  where id = p_key_id and user_id = p_user_id;
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

create or replace function public.set_user_ai_capability_assignment(
  p_user_id uuid,
  p_capability text,
  p_key_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_provider text;
  provider_capabilities text[];
begin
  if p_capability is null or p_capability not in ('text', 'transcription', 'embedding') then
    raise exception 'Unsupported model capability' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if p_key_id is null then
    delete from public.user_ai_capability_assignments
    where user_id = p_user_id and capability = p_capability;
  else
    select provider into target_provider
    from public.user_ai_keys
    where id = p_key_id and user_id = p_user_id
    for update;

    if not found then
      raise exception 'BYOK credential not found' using errcode = 'P0002';
    end if;

    provider_capabilities := case target_provider
      when 'openrouter' then array['text', 'transcription', 'embedding']::text[]
      when 'openai' then array['text', 'transcription', 'embedding']::text[]
      when 'google' then array['text', 'embedding']::text[]
      else array['text']::text[]
    end;
    if not (p_capability = any(provider_capabilities)) then
      raise exception 'Provider does not support model capability' using errcode = '23514';
    end if;

    insert into public.user_ai_capability_assignments (user_id, capability, ai_key_id)
    values (p_user_id, p_capability, p_key_id)
    on conflict (user_id, capability) do update
    set ai_key_id = excluded.ai_key_id, updated_at = now();
  end if;

  if p_capability = 'text' then
    update public.user_agent_preferences
    set default_model = null, default_model_provider = null, updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.update_user_ai_key_preferences(
  p_user_id uuid,
  p_key_id uuid,
  p_enabled_surfaces text[] default null,
  p_feature_models jsonb default null
)
returns setof public.user_ai_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_provider text;
begin
  if p_enabled_surfaces is null and p_feature_models is null then
    raise exception 'No BYOK preference supplied' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select provider into current_provider
  from public.user_ai_keys
  where id = p_key_id and user_id = p_user_id
  for update;

  if not found then return; end if;

  if current_provider in ('local_openai', 'ollama')
     and p_enabled_surfaces is not null
     and not (p_enabled_surfaces <@ array['agent']::text[]) then
    raise exception 'Local BYOK providers are restricted to the agent surface'
      using errcode = '23514';
  end if;

  return query
  update public.user_ai_keys
  set
    enabled_surfaces = coalesce(p_enabled_surfaces, enabled_surfaces),
    feature_models = (
      coalesce(p_feature_models, feature_models)
      - 'agent_model'
      - 'automation_agent_model'
      - 'pr_review_model'
    ),
    updated_at = now()
  where id = p_key_id and user_id = p_user_id
  returning *;
end;
$$;

revoke all on function public.upsert_user_ai_key(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.upsert_user_ai_key(uuid, text, text, text, text, timestamptz)
  to service_role;

revoke all on function public.delete_user_ai_key(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_user_ai_key(uuid, uuid)
  to service_role;

revoke all on function public.set_user_ai_capability_assignment(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.set_user_ai_capability_assignment(uuid, text, uuid)
  to service_role;

revoke all on function public.update_user_ai_key_preferences(uuid, uuid, text[], jsonb)
  from public, anon, authenticated;
grant execute on function public.update_user_ai_key_preferences(uuid, uuid, text[], jsonb)
  to service_role;
