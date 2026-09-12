-- MIN-518: make the provider-bound account preference the sole source for
-- every newly created code worker. Existing agent_runs already contain their
-- frozen model and reasoning, so this migration deliberately leaves them alone.
begin;

alter table public.user_agent_preferences
  add column if not exists default_model_provider text;

alter table public.agent_runs
  add column if not exists worker_model_source text,
  add column if not exists worker_model_provider text;

alter table public.agent_runs
  add constraint agent_runs_worker_model_source_check
  check (
    (worker_model_source is null and worker_model_provider is null)
    or (worker_model_source = 'account' and worker_model_provider is not null)
  )
  not valid;

alter table public.agent_runs
  validate constraint agent_runs_worker_model_source_check;

comment on column public.agent_runs.worker_model_source is
  'NULL marks a legacy frozen run. account marks a run resolved from the provider-bound account preference.';
comment on column public.agent_runs.worker_model_provider is
  'AI provider frozen with the account model for a new worker. NULL only for legacy runs.';

-- Managed runs are inserted through this reservation RPC rather than the
-- ordinary agent_runs insert. Keep its explicit JSON allowlist and column map
-- in sync so the new source marker is both accepted and persisted atomically.
create or replace function public.create_agent_run_with_budget(
  p_user_id uuid,
  p_usage_since timestamptz,
  p_budget_cap numeric,
  p_requested_budget numeric,
  p_values jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_spent numeric;
  v_reserved numeric;
  v_granted numeric;
  v_run public.agent_runs%rowtype;
begin
  if p_user_id is null
     or p_usage_since is null
     or p_budget_cap is null
     or p_budget_cap < 0
     or p_requested_budget is null
     or p_requested_budget <= 0
     or p_values is null
     or jsonb_typeof(p_values) <> 'object'
     or p_values - array[
       'project_id', 'issue_id', 'pull_request_id', 'pr_head_sha',
       'repo_link_id', 'connection_id', 'repo_provider', 'repo_external_id',
       'status', 'triggered_by', 'created_by', 'prompt', 'prompt_mentions',
       'title', 'model', 'model_forced', 'reasoning_level', 'key_mode',
       'worker_model_source', 'worker_model_provider', 'base_branch',
       'branch_name', 'pr_number', 'pr_url', 'pr_state', 'run_id', 'chain_id',
       'budget_usd', 'routine_id', 'intent', 'deployment_url', 'loop_in_vm',
       'agent_engine', 'local_exec', 'local_issue_context_confirmed',
       'local_worktree'
     ] <> '{}'::jsonb
     or nullif(p_values->>'created_by', '')::uuid is distinct from p_user_id
     or p_values->>'key_mode' is distinct from 'platform'
     or p_values->>'worker_model_source' is distinct from 'account'
     or nullif(p_values->>'worker_model_provider', '') is null
     or p_values->>'status' is distinct from 'queued' then
    raise exception 'agent_run_budget_values_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 460));

  select coalesce(sum(cost), 0)
  into v_spent
  from public.ai_usage
  where user_id = p_user_id
    and created_at >= p_usage_since
    and key_mode = 'platform';

  select coalesce(sum(greatest(run.managed_budget_usd - coalesce(usage.spent, 0), 0)), 0)
  into v_reserved
  from public.agent_runs as run
  left join lateral (
    select sum(cost) as spent
    from public.ai_usage
    where run_id = run.run_id
      and key_mode = 'platform'
  ) as usage on true
  where run.created_by = p_user_id
    and run.key_mode = 'platform'
    and run.status in ('queued', 'running')
    and run.managed_budget_usd is not null;

  v_granted := least(
    p_requested_budget,
    greatest(p_budget_cap - v_spent - v_reserved, 0)
  );
  if v_granted <= 0 then
    return jsonb_build_object(
      'run', null,
      'granted_budget_usd', 0,
      'spent_usd', v_spent,
      'reserved_usd', v_reserved
    );
  end if;

  insert into public.agent_runs (
    project_id, issue_id, pull_request_id, pr_head_sha, repo_link_id,
    connection_id, repo_provider, repo_external_id, status, triggered_by,
    created_by, prompt, prompt_mentions, title, model, model_forced,
    reasoning_level, key_mode, worker_model_source, worker_model_provider,
    base_branch, branch_name, pr_number, pr_url, pr_state, run_id, chain_id,
    budget_usd, routine_id, intent, deployment_url, loop_in_vm, agent_engine,
    local_exec, local_issue_context_confirmed, local_worktree,
    managed_budget_usd
  ) values (
    (p_values->>'project_id')::uuid,
    nullif(p_values->>'issue_id', '')::uuid,
    nullif(p_values->>'pull_request_id', '')::uuid,
    p_values->>'pr_head_sha',
    nullif(p_values->>'repo_link_id', '')::uuid,
    nullif(p_values->>'connection_id', '')::uuid,
    p_values->>'repo_provider',
    p_values->>'repo_external_id',
    p_values->>'status',
    p_values->>'triggered_by',
    (p_values->>'created_by')::uuid,
    p_values->>'prompt',
    p_values->'prompt_mentions',
    p_values->>'title',
    p_values->>'model',
    (p_values->>'model_forced')::boolean,
    p_values->>'reasoning_level',
    p_values->>'key_mode',
    p_values->>'worker_model_source',
    p_values->>'worker_model_provider',
    p_values->>'base_branch',
    p_values->>'branch_name',
    nullif(p_values->>'pr_number', '')::integer,
    p_values->>'pr_url',
    p_values->>'pr_state',
    (p_values->>'run_id')::uuid,
    nullif(p_values->>'chain_id', '')::uuid,
    nullif(p_values->>'budget_usd', '')::numeric,
    nullif(p_values->>'routine_id', '')::uuid,
    p_values->>'intent',
    p_values->>'deployment_url',
    (p_values->>'loop_in_vm')::boolean,
    p_values->>'agent_engine',
    (p_values->>'local_exec')::boolean,
    (p_values->>'local_issue_context_confirmed')::boolean,
    (p_values->>'local_worktree')::boolean,
    v_granted
  )
  returning * into v_run;

  return jsonb_build_object(
    'run', to_jsonb(v_run),
    'granted_budget_usd', v_granted,
    'spent_usd', v_spent,
    'reserved_usd', v_reserved
  );
end;
$function$;

revoke all on function public.create_agent_run_with_budget(
  uuid, timestamptz, numeric, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.create_agent_run_with_budget(
  uuid, timestamptz, numeric, numeric, jsonb
) to service_role;

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
