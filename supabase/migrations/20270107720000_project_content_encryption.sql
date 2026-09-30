-- MIN-591: private project identity and free-form configuration.
BEGIN;
ALTER TABLE public.projects
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN automations DROP NOT NULL,
  ALTER COLUMN smart_assign_rules DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz;
CREATE INDEX projects_content_migration_queue
  ON public.projects(encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.project_content_encryption_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_content_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_content_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.project_content_encryption_scope TO service_role;

CREATE FUNCTION public.guard_project_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean:=NEW.encryption_version>0 AND
  NEW.encrypted_content IS NOT NULL AND NEW.name IS NULL AND
  NEW.automations IS NULL AND NEW.smart_assign_rules IS NULL;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-content-activation',591));
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    IF NEW.id IS DISTINCT FROM OLD.id OR
        NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'project_content_scope_immutable'
        USING ERRCODE='23514';
    END IF;
    IF NEW.encryption_version<OLD.encryption_version OR
        OLD.encryption_version>0 AND NOT sealed THEN
      RAISE EXCEPTION 'project_content_downgrade' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      (NEW.encryption_version=0 AND NEW.encrypted_content IS NOT NULL) OR
      (NEW.encryption_version>0 AND NOT sealed) OR
      (sealed AND COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <>NEW.encryption_version,true)) THEN
    RAISE EXCEPTION 'project_content_state_invalid' USING ERRCODE='23514';
  END IF;
  IF sealed AND NEW.icon_url IS NOT NULL AND
      NEW.icon_url !~ ('^/api/projects/'||NEW.id::text||
        '/icon/content[?]v=[0-9]+$') THEN
    RAISE EXCEPTION 'project_content_external_icon_refused'
      USING ERRCODE='23514';
  END IF;
  IF NOT sealed AND EXISTS(
    SELECT 1 FROM public.project_content_encryption_scope) THEN
    RAISE EXCEPTION 'project_content_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_content_guard BEFORE INSERT OR UPDATE
  ON public.projects FOR EACH ROW EXECUTE FUNCTION public.guard_project_content();
REVOKE ALL ON FUNCTION public.guard_project_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_project_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-content-activation',591));
  IF NOT EXISTS(SELECT 1 FROM public.project_icon_encryption_scope) OR
      EXISTS(SELECT 1 FROM public.projects WHERE
        encryption_version<1 OR encrypted_content IS NULL OR
        name IS NOT NULL OR automations IS NOT NULL OR
        smart_assign_rules IS NOT NULL OR encryption_checked_at IS NULL OR
        icon_url IS NOT NULL AND icon_url !~
          ('^/api/projects/'||id::text||'/icon/content[?]v=[0-9]+$')) THEN
    RETURN false;
  END IF;
  INSERT INTO public.project_content_encryption_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_project_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_project_content()
  TO service_role;
-- Return identifiers and counts; authorized repositories hydrate project names.
create or replace function public.get_user_stats(
  p_tz text default 'UTC'::text,
  p_since timestamp with time zone default (now() - '371 days'::interval)
) returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with me as (
    select * from public.stat_events where user_id = auth.uid()
  ),
  issue_events as (
    select * from me where kind in ('issue_created', 'issue_completed')
  ),
  active_projects as (
    select id, color, icon_url, orb_seed
    from public.projects
    where deleted_at is null
  ),
  totals as (
    select
      count(*) filter (where kind = 'issue_created') as created,
      count(distinct coalesce(issue_id::text, id::text))
        filter (where kind = 'issue_completed') as completed,
      (select count(*) from me where kind = 'scratchpad_task_completed') as tasks_completed
    from issue_events
  ),
  active_project_count as (
    select count(distinct e.project_id) as projects
    from issue_events e
    join active_projects p on p.id = e.project_id
  ),
  completed_issues as (
    select distinct i.id as issue_id, i.project_id, i.objective_id
    from me e
    join public.issues i
      on i.id = e.issue_id
     and i.deleted_at is null
    join active_projects p on p.id = i.project_id
    where e.kind = 'issue_completed'
  ),
  per_project as (
    select
      p.id,
      NULL::text AS name,
      p.color,
      p.icon_url,
      p.orb_seed,
      count(ci.issue_id) as completed
    from completed_issues ci
    join active_projects p on p.id = ci.project_id
    group by p.id, p.color, p.icon_url, p.orb_seed
  ),
  per_category as (
    select
      c.id,
      c.project_id,
      NULL::text AS name,
      c.color,
      count(distinct ci.issue_id) as completed
    from completed_issues ci
    join public.issue_categories ic on ic.issue_id = ci.issue_id
    join public.categories c on c.id = ic.category_id
    group by c.id, c.project_id, c.color
  ),
  per_objective as (
    select
      o.id,
      o.project_id,
      NULL::text AS name,
      o.color,
      count(distinct ci.issue_id) as completed
    from completed_issues ci
    join public.objectives o
      on o.id = ci.objective_id
     and o.deleted_at is null
    group by o.id, o.project_id, o.color
  ),
  days as (
    select
      to_char((me.occurred_at at time zone p_tz)::date, 'YYYY-MM-DD') as date,
      count(*) as count,
      count(*) filter (where me.kind = 'issue_completed') as issues,
      count(*) filter (where me.kind = 'scratchpad_task_completed') as tasks
    from me
    where me.kind in ('issue_completed', 'scratchpad_task_completed')
      and me.occurred_at >= p_since
    group by 1
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'created', coalesce((select created from totals), 0),
      'completed', coalesce((select completed from totals), 0),
      'projects', coalesce((select projects from active_project_count), 0),
      'tasks_completed', coalesce((select tasks_completed from totals), 0)
    ),
    'breakdown_total', (select count(*) from completed_issues),
    'per_project', coalesce(
      (select jsonb_agg(to_jsonb(pp) order by pp.completed desc, pp.id asc)
       from per_project pp),
      '[]'::jsonb
    ),
    'per_category', coalesce(
      (select jsonb_agg(to_jsonb(pc) order by pc.completed desc, pc.id asc)
       from per_category pc),
      '[]'::jsonb
    ),
    'per_objective', coalesce(
      (select jsonb_agg(to_jsonb(po) order by po.completed desc, po.id asc)
       from per_objective po),
      '[]'::jsonb
    ),
    'days', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'date', d.date, 'count', d.count, 'issues', d.issues, 'tasks', d.tasks))
       from days d),
      '[]'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_usage_history(
  p_user_id uuid,
  p_since timestamptz,
  p_features text[] DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  WITH runs AS (
    SELECT
      COALESCE(u.numo_turn_id, u.run_id) AS run_id,
      CASE
        WHEN bool_or(u.routine_id IS NOT NULL) THEN 'routine_code'
        WHEN p_features IS NULL AND bool_or(u.numo_turn_id IS NOT NULL) THEN 'numo_chat'
        ELSE min(u.feature)
      END AS feature,
      sum(COALESCE(u.cost, 0)) AS cost,
      count(*) AS calls,
      min(u.created_at) AS first_at,
      max(u.project_id::text)::uuid AS project_id
    FROM public.ai_usage AS u
    WHERE u.user_id = p_user_id
      AND u.created_at >= p_since
      AND (p_features IS NULL OR u.feature = ANY(p_features))
    GROUP BY COALESCE(u.numo_turn_id, u.run_id)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM runs),
    'entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'run_id', r.run_id,
        'feature', r.feature,
        'cost', r.cost,
        'calls', r.calls,
        'first_at', r.first_at,
        'project_id', r.project_id,
        'project_name', NULL::text
      ) ORDER BY r.first_at DESC)
      FROM (
        SELECT * FROM runs ORDER BY first_at DESC LIMIT p_limit OFFSET p_offset
      ) AS r
    ), '[]'::jsonb)
  );
$$;
COMMIT;
