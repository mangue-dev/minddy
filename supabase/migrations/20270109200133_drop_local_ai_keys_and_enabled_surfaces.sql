-- MIN-998: schema half of MIN-996.
--
-- MIN-996 retired the local BYOK providers (Ollama, local OpenAI-compatible)
-- and the `agent` AI surface in code. Since 0.40.0 no deployed code passes
-- `p_enabled_surfaces`, selects `enabled_surfaces` or writes a local
-- provider, so their rows and the column can go. A usage's provider lives in
-- `user_ai_usage_routes` (MIN-826).

begin;

-- Deleting a credential cascades to its capability assignments and usage
-- routes, so the affected usages fall back to Minddy Cloud.
delete from public.user_ai_keys where provider in ('local_openai', 'ollama');

-- PL/pgSQL bodies are not tracked as column dependencies: every function that
-- reads or writes `enabled_surfaces` is replaced or dropped before the column.
-- `replace_user_ai_key` and the provider-addressed preferences overload have
-- had no caller since several credentials per account (MIN-573).
drop function if exists public.replace_user_ai_key(
  uuid, text, text, text, text, timestamptz);
drop function if exists public.update_user_ai_key_preferences(
  uuid, text, text[], jsonb);
drop function if exists public.update_user_ai_key_preferences(
  uuid, uuid, text[], jsonb);
drop function if exists public.update_user_ai_key_preferences_protected(
  uuid, uuid, bigint, text, integer, text[]);

create function public.update_user_ai_key_preferences(
  p_user_id uuid,
  p_key_id uuid,
  p_feature_models jsonb
)
returns setof public.user_ai_keys
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_feature_models is null then
    raise exception 'No BYOK preference supplied' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  return query
  update public.user_ai_keys
  set
    feature_models = p_feature_models
      - 'agent_model'
      - 'automation_agent_model'
      - 'pr_review_model',
    updated_at = now()
  where id = p_key_id and user_id = p_user_id
  returning *;
end;
$$;

revoke all on function public.update_user_ai_key_preferences(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_user_ai_key_preferences(uuid, uuid, jsonb)
  to service_role;

create function public.update_user_ai_key_preferences_protected(
  p_user_id uuid,
  p_key_id uuid,
  p_revision bigint,
  p_encrypted_content text,
  p_encryption_version integer
)
returns setof public.user_ai_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.user_ai_keys%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into saved from public.user_ai_keys
  where id = p_key_id and user_id = p_user_id
  for update;
  if not found then return; end if;
  if saved.content_revision <> p_revision then
    raise exception 'BYOK revision conflict' using errcode = '40001';
  end if;
  return query
  update public.user_ai_keys
  set
    key_encrypted = null,
    base_url = null,
    feature_models = null,
    encrypted_content = p_encrypted_content,
    encryption_version = p_encryption_version,
    updated_at = now()
  where id = p_key_id
  returning *;
end;
$$;

revoke all on function public.update_user_ai_key_preferences_protected(
  uuid, uuid, bigint, text, integer)
  from public, anon, authenticated;
grant execute on function public.update_user_ai_key_preferences_protected(
  uuid, uuid, bigint, text, integer) to service_role;

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
    user_id, provider, key_encrypted, key_prefix, base_url, validated_at,
    feature_models
  ) values (
    p_user_id, p_provider, p_key_encrypted, p_key_prefix, p_base_url,
    p_validated_at, '{}'::jsonb
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

create or replace function public.upsert_user_ai_key_protected(
  p_user_id uuid,
  p_provider text,
  p_id uuid,
  p_revision bigint,
  p_encrypted_content text,
  p_encryption_version integer,
  p_key_prefix text,
  p_validated_at timestamptz
)
returns setof public.user_ai_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.user_ai_keys%rowtype;
  supported text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into saved from public.user_ai_keys
  where user_id = p_user_id and provider = p_provider
  for update;
  if found then
    if saved.id <> p_id or saved.content_revision <> p_revision then
      raise exception 'BYOK revision conflict' using errcode = '40001';
    end if;
    return query
    update public.user_ai_keys
    set
      key_encrypted = null,
      base_url = null,
      feature_models = null,
      encrypted_content = p_encrypted_content,
      encryption_version = p_encryption_version,
      key_prefix = p_key_prefix,
      validated_at = p_validated_at,
      updated_at = now()
    where id = p_id
    returning *;
    return;
  end if;
  if p_revision <> 0 then
    raise exception 'BYOK revision conflict' using errcode = '40001';
  end if;
  insert into public.user_ai_keys (
    id, user_id, provider, key_encrypted, key_prefix, base_url, validated_at,
    feature_models, encrypted_content, encryption_version
  ) values (
    p_id, p_user_id, p_provider, null, p_key_prefix, null, p_validated_at,
    null, p_encrypted_content, p_encryption_version
  )
  returning * into saved;
  supported := case p_provider
    when 'openrouter' then array['text', 'transcription', 'embedding']::text[]
    when 'openai' then array['text', 'transcription', 'embedding']::text[]
    when 'google' then array['text', 'embedding']::text[]
    else array['text']::text[]
  end;
  insert into public.user_ai_capability_assignments (user_id, capability, ai_key_id)
  select p_user_id, capability, saved.id from unnest(supported) as capability
  on conflict (user_id, capability) do nothing;
  return next saved;
end;
$$;

alter table public.user_ai_keys
  drop constraint if exists user_ai_keys_local_surfaces_check,
  drop constraint if exists user_ai_keys_enabled_surfaces_check,
  drop column enabled_surfaces;

notify pgrst, 'reload schema';

commit;
