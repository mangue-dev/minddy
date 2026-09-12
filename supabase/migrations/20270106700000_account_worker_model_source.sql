-- MIN-518: make the provider-bound account preference the sole source for
-- every newly created code worker. Existing agent_runs already contain their
-- frozen model and reasoning, so this migration deliberately leaves them alone.
begin;

alter table public.user_agent_preferences
  add column if not exists default_model_provider text;

alter table public.agent_runs
  add column if not exists worker_model_source text;

alter table public.agent_runs
  add constraint agent_runs_worker_model_source_check
  check (worker_model_source is null or worker_model_source = 'account')
  not valid;

alter table public.agent_runs
  validate constraint agent_runs_worker_model_source_check;

comment on column public.agent_runs.worker_model_source is
  'NULL marks a legacy frozen run. account marks a run resolved from the provider-bound account preference.';

-- Bind existing explicit choices to the provider that was active when this
-- invariant was introduced. Missing choices stay missing and must be selected
-- deliberately in Account settings before another worker can start.
update public.user_agent_preferences as preferences
set default_model_provider = coalesce(
  (
    select keys.provider
    from public.user_ai_keys as keys
    where keys.user_id = preferences.user_id
      and 'agent' = any(keys.enabled_surfaces)
    order by keys.updated_at desc, keys.created_at desc
    limit 1
  ),
  'openrouter'
)
where preferences.default_model is not null
  and preferences.default_model_provider is null;

comment on column public.user_agent_preferences.default_model_provider is
  'Provider namespace in which default_model was deliberately selected. New workers fail closed when it differs from the active agent provider.';

-- Per-trigger worker choices are obsolete. Removing them prevents stale data
-- from being reintroduced as a second resolution path later.
alter table public.user_agent_preferences
  drop column if exists pr_review_model;

alter table public.agent_routines
  drop column if exists model,
  drop column if exists reasoning_level;

update public.user_ai_keys
set feature_models = feature_models - 'agent_model' - 'automation_agent_model' - 'pr_review_model',
    updated_at = now()
where feature_models ?| array['agent_model', 'automation_agent_model', 'pr_review_model'];

delete from public.app_config
where key in ('automation_agent_model', 'pr_review_model')
   or key like 'byok_default_model_%'
   or key ~ '^byok_default_.+_(agent_model|automation_agent_model|pr_review_model)$';

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'automation_models'
where coalesce(raw_user_meta_data, '{}'::jsonb) ? 'automation_models';

-- Replacing a key must not write the worker preference. A provider change will
-- intentionally make the old provider-bound choice unavailable until the user
-- visits Account settings and selects a compatible model.
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
end;
$$;

-- Even service-side preference writes discard retired worker keys. The active
-- worker model remains user_agent_preferences.default_model only.
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
    feature_models = (
      coalesce(p_feature_models, feature_models)
      - 'agent_model'
      - 'automation_agent_model'
      - 'pr_review_model'
    ),
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

commit;
