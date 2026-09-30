-- MIN-591: category names use project content keys; metadata remains queryable.
BEGIN;

ALTER TABLE public.categories
  ALTER COLUMN name DROP NOT NULL,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT categories_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND name IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND name IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false)));
CREATE INDEX categories_encryption_queue ON public.categories(encryption_checked_at NULLS FIRST, id);
REVOKE INSERT, UPDATE, DELETE ON public.categories FROM anon, authenticated;

CREATE FUNCTION public.guard_category_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.encryption_version = 0 AND
    (TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name) AND
    EXISTS (SELECT 1 FROM public.envelope_data_keys WHERE scope_kind = 'project'
      AND scope_id = NEW.project_id AND purpose = 'content') THEN
    RAISE EXCEPTION 'category_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'category_identity_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.encryption_version < OLD.encryption_version THEN
      RAISE EXCEPTION 'category_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['encryption_checked_at','encryption_revision'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['encryption_checked_at','encryption_revision']) THEN
      NEW.encryption_revision := OLD.encryption_revision + 1;
    ELSE NEW.encryption_revision := OLD.encryption_revision;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER categories_encryption_guard BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_category_encryption();
REVOKE ALL ON FUNCTION public.guard_category_encryption() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_category_ciphertext(
  p_id uuid, p_project_id uuid, p_revision bigint, p_previous_version integer,
  p_encryption_version integer DEFAULT NULL, p_encrypted_content text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer; previous_setting text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  IF p_encryption_version IS NULL AND p_encrypted_content IS NULL THEN
    UPDATE public.categories SET encryption_checked_at = clock_timestamp()
      WHERE id = p_id AND project_id = p_project_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  ELSE
    UPDATE public.categories SET name = NULL,
      encrypted_content = p_encrypted_content, encryption_version = p_encryption_version
      WHERE id = p_id AND project_id = p_project_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(previous_setting, ''), true);
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_category_ciphertext(uuid,uuid,bigint,integer,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_category_ciphertext(uuid,uuid,bigint,integer,integer,text)
  TO service_role;

CREATE FUNCTION public.broadcast_category_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_new public.categories%ROWTYPE; v_old public.categories%ROWTYPE; pid uuid;
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW; pid := NEW.project_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := OLD; pid := OLD.project_id; END IF;
  v_new.name := NULL; v_new.encrypted_content := NULL;
  v_old.name := NULL; v_old.encrypted_content := NULL;
  PERFORM realtime.broadcast_changes('project:' || pid, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, v_new, v_old);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
DROP TRIGGER categories_broadcast ON public.categories;
CREATE TRIGGER categories_broadcast AFTER INSERT OR UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_category_metadata();
REVOKE ALL ON FUNCTION public.broadcast_category_metadata() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.delete_category_guarded(p_id uuid, p_project_id uuid, p_actor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.guard_project_actor(p_project_id, p_actor_id, false);
  DELETE FROM public.categories WHERE id = p_id AND project_id = p_project_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_category_guarded(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_category_guarded(uuid,uuid,uuid) TO service_role;

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
      (select jsonb_agg(to_jsonb(pp) order by pp.completed desc, pp.name asc)
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

COMMIT;
