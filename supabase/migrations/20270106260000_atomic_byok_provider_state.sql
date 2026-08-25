-- MIN-451: keep the single-provider and local-only invariants inside the
-- transaction that changes a user's BYOK configuration.

-- Existing local rows predate the local-only surface invariant and inherited
-- the all-surfaces default. Make them safe before validating the constraint.
update public.user_ai_keys
set enabled_surfaces = array['agent']::text[]
where provider in ('local_openai', 'ollama')
  and enabled_surfaces is distinct from array['agent']::text[];

alter table public.user_ai_keys
  add constraint user_ai_keys_local_surfaces_check
  check (
    provider not in ('local_openai', 'ollama')
    or enabled_surfaces <@ array['agent']::text[]
  ) not valid;

alter table public.user_ai_keys
  validate constraint user_ai_keys_local_surfaces_check;

-- A previous race could leave several provider rows for one user. Preserve the
-- most recently updated row before replacing the provider-scoped index.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc, created_at desc, id desc
    ) as position
  from public.user_ai_keys
)
delete from public.user_ai_keys as key
using ranked
where key.id = ranked.id
  and ranked.position > 1;

drop index if exists public.idx_user_ai_keys_user_provider;
create unique index idx_user_ai_keys_user
  on public.user_ai_keys using btree (user_id);

create or replace function public.replace_user_ai_key(
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
  current_key public.user_ai_keys%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select *
  into current_key
  from public.user_ai_keys
  where user_id = p_user_id
  for update;

  if found and current_key.provider = p_provider then
    return query
    update public.user_ai_keys
    set
      key_encrypted = p_key_encrypted,
      key_prefix = p_key_prefix,
      base_url = p_base_url,
      validated_at = p_validated_at,
      updated_at = now()
    where user_id = p_user_id
    returning *;
    return;
  end if;

  delete from public.user_ai_keys where user_id = p_user_id;

  return query
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
  returning *;

  if current_key.id is not null then
    update public.user_agent_preferences
    set default_model = null, updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.update_user_ai_key_preferences(
  p_user_id uuid,
  p_expected_provider text,
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

  select provider
  into current_provider
  from public.user_ai_keys
  where user_id = p_user_id
  for update;

  if not found or current_provider <> p_expected_provider then
    return;
  end if;

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
    feature_models = coalesce(p_feature_models, feature_models),
    updated_at = now()
  where user_id = p_user_id
    and provider = p_expected_provider
  returning *;
end;
$$;

revoke all on function public.replace_user_ai_key(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_user_ai_key(uuid, text, text, text, text, timestamptz)
  to service_role;

revoke all on function public.update_user_ai_key_preferences(uuid, text, text[], jsonb)
  from public, anon, authenticated;
grant execute on function public.update_user_ai_key_preferences(uuid, text, text[], jsonb)
  to service_role;
