-- MIN-591: protect objective names and descriptions without changing metadata queries.
BEGIN;

ALTER TABLE public.objectives
  ALTER COLUMN name DROP NOT NULL,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT objectives_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND name IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND name IS NULL AND description IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false)));
CREATE INDEX objectives_encryption_queue ON public.objectives(encryption_checked_at NULLS FIRST, id);
REVOKE INSERT, UPDATE, DELETE ON public.objectives FROM anon, authenticated;

CREATE FUNCTION public.guard_objective_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.encryption_version = 0 AND
    (TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description) AND
    EXISTS (SELECT 1 FROM public.envelope_data_keys WHERE scope_kind = 'project'
      AND scope_id = NEW.project_id AND purpose = 'content') THEN
    RAISE EXCEPTION 'objective_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'objective_identity_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.encryption_version < OLD.encryption_version THEN
      RAISE EXCEPTION 'objective_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['encryption_checked_at','encryption_revision','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['encryption_checked_at','encryption_revision','updated_at']) THEN
      NEW.encryption_revision := OLD.encryption_revision + 1;
    ELSE NEW.encryption_revision := OLD.encryption_revision;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER objectives_encryption_guard BEFORE INSERT OR UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.guard_objective_encryption();
REVOKE ALL ON FUNCTION public.guard_objective_encryption() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.set_objective_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on' OR
    (to_jsonb(NEW) - ARRAY['encryption_checked_at','updated_at']) =
    (to_jsonb(OLD) - ARRAY['encryption_checked_at','updated_at']) THEN
    NEW.updated_at := OLD.updated_at;
  ELSE NEW.updated_at := clock_timestamp(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER objectives_set_updated_at ON public.objectives;
CREATE TRIGGER objectives_set_updated_at BEFORE UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.set_objective_updated_at();
REVOKE ALL ON FUNCTION public.set_objective_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_objective_guarded(p_project_id uuid, p_actor_id uuid, p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner_id uuid; v_lead_user_id uuid; v_objective public.objectives%ROWTYPE;
BEGIN
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' OR
    p_values - ARRAY['id','name','description','status','lead_user_id','target_date','color',
      'encrypted_content','encryption_version'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'objective_values_invalid' USING ERRCODE = '22023';
  END IF;
  v_owner_id := public.guard_project_actor(p_project_id, p_actor_id, false);
  v_lead_user_id := NULLIF(p_values->>'lead_user_id', '')::uuid;
  IF v_lead_user_id IS NOT NULL AND v_lead_user_id <> v_owner_id AND NOT EXISTS (
    SELECT 1 FROM public.project_members WHERE project_id = p_project_id AND user_id = v_lead_user_id) THEN
    RAISE EXCEPTION 'objective_lead_forbidden' USING ERRCODE = '23503';
  END IF;
  INSERT INTO public.objectives(id, project_id, name, description, status, lead_user_id,
    target_date, color, encrypted_content, encryption_version)
  VALUES (COALESCE(NULLIF(p_values->>'id','')::uuid, gen_random_uuid()), p_project_id,
    p_values->>'name', p_values->>'description', COALESCE(p_values->>'status', 'planned'),
    v_lead_user_id, NULLIF(p_values->>'target_date','')::timestamptz, p_values->>'color',
    p_values->>'encrypted_content', COALESCE((p_values->>'encryption_version')::integer, 0))
  RETURNING * INTO v_objective;
  RETURN to_jsonb(v_objective);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_objective_guarded(p_objective_id uuid, p_actor_id uuid, p_updates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_project_id uuid; v_owner_id uuid; v_lead_user_id uuid;
  v_before public.objectives%ROWTYPE; v_after public.objectives%ROWTYPE;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' OR p_updates = '{}'::jsonb OR
    p_updates - ARRAY['name','description','status','lead_user_id','target_date','color',
      'encrypted_content','encryption_version','encryption_revision'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'objective_values_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT project_id INTO v_project_id FROM public.objectives WHERE id = p_objective_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'objective_not_found' USING ERRCODE = 'P0002'; END IF;
  v_owner_id := public.guard_project_actor(v_project_id, p_actor_id, false);
  SELECT * INTO v_before FROM public.objectives WHERE id = p_objective_id
    AND project_id = v_project_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'objective_not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_updates ? 'encryption_revision' AND
    (p_updates->>'encryption_revision')::bigint <> v_before.encryption_revision THEN
    RAISE EXCEPTION 'objective_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF p_updates ? 'lead_user_id' THEN
    v_lead_user_id := NULLIF(p_updates->>'lead_user_id', '')::uuid;
    IF v_lead_user_id IS NOT NULL AND v_lead_user_id <> v_owner_id AND NOT EXISTS (
      SELECT 1 FROM public.project_members WHERE project_id = v_project_id AND user_id = v_lead_user_id) THEN
      RAISE EXCEPTION 'objective_lead_forbidden' USING ERRCODE = '23503';
    END IF;
  END IF;
  UPDATE public.objectives SET
    name = CASE WHEN p_updates ? 'name' THEN p_updates->>'name' ELSE name END,
    description = CASE WHEN p_updates ? 'description' THEN p_updates->>'description' ELSE description END,
    status = CASE WHEN p_updates ? 'status' THEN p_updates->>'status' ELSE status END,
    lead_user_id = CASE WHEN p_updates ? 'lead_user_id' THEN v_lead_user_id ELSE lead_user_id END,
    target_date = CASE WHEN p_updates ? 'target_date' THEN NULLIF(p_updates->>'target_date','')::timestamptz ELSE target_date END,
    color = CASE WHEN p_updates ? 'color' THEN p_updates->>'color' ELSE color END,
    encrypted_content = CASE WHEN p_updates ? 'encrypted_content' THEN p_updates->>'encrypted_content' ELSE encrypted_content END,
    encryption_version = CASE WHEN p_updates ? 'encryption_version' THEN (p_updates->>'encryption_version')::integer ELSE encryption_version END
  WHERE id = p_objective_id RETURNING * INTO v_after;
  RETURN jsonb_build_object('previous', to_jsonb(v_before), 'objective', to_jsonb(v_after));
END;
$$;

CREATE FUNCTION public.migrate_objective_ciphertext(
  p_id uuid, p_project_id uuid, p_revision bigint, p_previous_version integer,
  p_encryption_version integer DEFAULT NULL, p_encrypted_content text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer; previous_setting text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  IF p_encryption_version IS NULL AND p_encrypted_content IS NULL THEN
    UPDATE public.objectives SET encryption_checked_at = clock_timestamp()
      WHERE id = p_id AND project_id = p_project_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  ELSE
    UPDATE public.objectives SET name = NULL, description = NULL,
      encrypted_content = p_encrypted_content, encryption_version = p_encryption_version
      WHERE id = p_id AND project_id = p_project_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(previous_setting, ''), true);
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_objective_ciphertext(uuid,uuid,bigint,integer,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_objective_ciphertext(uuid,uuid,bigint,integer,integer,text)
  TO service_role;

-- Broadcast only routing metadata. The API fetches authorized content after invalidation.
CREATE FUNCTION public.broadcast_objective_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_new public.objectives%ROWTYPE; v_old public.objectives%ROWTYPE; pid uuid;
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW; pid := NEW.project_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := OLD; pid := OLD.project_id; END IF;
  v_new.name := NULL; v_new.description := NULL; v_new.encrypted_content := NULL;
  v_old.name := NULL; v_old.description := NULL; v_old.encrypted_content := NULL;
  PERFORM realtime.broadcast_changes('project:' || pid, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, v_new, v_old);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
DROP TRIGGER objectives_broadcast ON public.objectives;
CREATE TRIGGER objectives_broadcast AFTER INSERT OR UPDATE OR DELETE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_objective_metadata();
REVOKE ALL ON FUNCTION public.broadcast_objective_metadata() FROM PUBLIC, anon, authenticated;

-- SQL returns only counts and identifiers; the server hydrates authorized names.
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
    select id, name, color, icon_url, orb_seed
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
      p.name,
      p.color,
      p.icon_url,
      p.orb_seed,
      count(ci.issue_id) as completed
    from completed_issues ci
    join active_projects p on p.id = ci.project_id
    group by p.id, p.name, p.color, p.icon_url, p.orb_seed
  ),
  per_category as (
    select
      c.name,
      c.color,
      count(distinct ci.issue_id) as completed
    from completed_issues ci
    join public.issue_categories ic on ic.issue_id = ci.issue_id
    join public.categories c on c.id = ic.category_id
    group by c.name, c.color
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
      (select jsonb_agg(to_jsonb(pp) order by pp.completed desc, pp.name asc)
       from per_project pp),
      '[]'::jsonb
    ),
    'per_category', coalesce(
      (select jsonb_agg(to_jsonb(pc) order by pc.completed desc, pc.name asc)
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

COMMIT;
