-- MIN-591: activity and page snapshots share the project's application encryption boundary.
BEGIN;

ALTER TABLE public.issue_events
  ADD COLUMN project_id uuid,
  ADD COLUMN starts_work boolean NOT NULL DEFAULT false;
ALTER TABLE public.issue_events DISABLE TRIGGER issue_events_broadcast;
UPDATE public.issue_events e SET project_id = COALESCE(
  (SELECT project_id FROM public.issues WHERE id = e.issue_id),
  (SELECT project_id FROM public.objectives WHERE id = e.objective_id),
  (SELECT project_id FROM public.feedback_posts WHERE id = e.feedback_post_id),
  (SELECT project_id FROM public.pages WHERE id = e.page_id)),
  starts_work = COALESCE(field = 'status' AND to_value = 'in_progress', false);
ALTER TABLE public.issue_events ALTER COLUMN project_id SET NOT NULL;

-- Bind the stored key scope to the real parent even for service-role writes.
ALTER TABLE public.issues ADD CONSTRAINT issues_id_project_history_key UNIQUE (id, project_id);
ALTER TABLE public.issue_events ADD CONSTRAINT issue_events_issue_id_project_fk
  FOREIGN KEY (issue_id, project_id) REFERENCES public.issues(id, project_id) ON DELETE CASCADE;
ALTER TABLE public.objectives ADD CONSTRAINT objectives_id_project_history_key UNIQUE (id, project_id);
ALTER TABLE public.issue_events ADD CONSTRAINT issue_events_objective_id_project_fk
  FOREIGN KEY (objective_id, project_id) REFERENCES public.objectives(id, project_id) ON DELETE CASCADE;
ALTER TABLE public.feedback_posts ADD CONSTRAINT feedback_posts_id_project_history_key UNIQUE (id, project_id);
ALTER TABLE public.issue_events ADD CONSTRAINT issue_events_feedback_post_id_project_fk
  FOREIGN KEY (feedback_post_id, project_id) REFERENCES public.feedback_posts(id, project_id) ON DELETE CASCADE;
ALTER TABLE public.pages ADD CONSTRAINT pages_id_project_history_key UNIQUE (id, project_id);
ALTER TABLE public.issue_events ADD CONSTRAINT issue_events_page_id_project_fk
  FOREIGN KEY (page_id, project_id) REFERENCES public.pages(id, project_id) ON DELETE CASCADE;
ALTER TABLE public.page_versions ADD CONSTRAINT page_versions_page_project_fk
  FOREIGN KEY (page_id, project_id) REFERENCES public.pages(id, project_id) ON DELETE CASCADE;
ALTER TABLE public.page_versions ALTER COLUMN title DROP NOT NULL, ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.issue_events
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT issue_events_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND from_value IS NULL AND to_value IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false))
  );
CREATE INDEX issue_events_encryption_queue ON public.issue_events(encryption_checked_at NULLS FIRST, id);

ALTER TABLE public.page_versions
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT page_versions_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND title IS NOT NULL AND content IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND title IS NULL AND icon IS NULL AND content IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false))
  );
CREATE INDEX page_versions_encryption_queue ON public.page_versions(encryption_checked_at NULLS FIRST, id);

CREATE FUNCTION public.guard_history_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE owner_project uuid;
BEGIN
  IF TG_TABLE_NAME = 'issue_events' AND TG_OP = 'INSERT' THEN
    SELECT COALESCE(
      (SELECT project_id FROM public.issues WHERE id = NEW.issue_id),
      (SELECT project_id FROM public.objectives WHERE id = NEW.objective_id),
      (SELECT project_id FROM public.feedback_posts WHERE id = NEW.feedback_post_id),
      (SELECT project_id FROM public.pages WHERE id = NEW.page_id)) INTO owner_project;
    IF NEW.project_id IS NULL THEN NEW.project_id := owner_project; END IF;
    IF NEW.encryption_version = 0 THEN
      NEW.starts_work := COALESCE(NEW.field = 'status' AND NEW.to_value = 'in_progress', false);
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.encryption_version = 0 AND EXISTS (
    SELECT 1 FROM public.envelope_data_keys WHERE scope_kind = 'project'
      AND scope_id = NEW.project_id AND purpose = 'content'
  ) THEN
    RAISE EXCEPTION 'history_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.page_id IS DISTINCT FROM OLD.page_id THEN
      RAISE EXCEPTION 'history_identity_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'issue_events' THEN
      IF NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.objective_id IS DISTINCT FROM OLD.objective_id
        OR NEW.feedback_post_id IS DISTINCT FROM OLD.feedback_post_id
        OR NEW.starts_work IS DISTINCT FROM OLD.starts_work THEN
        RAISE EXCEPTION 'activity_identity_is_immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.encryption_version < OLD.encryption_version OR NEW.encryption_revision < OLD.encryption_revision THEN
      RAISE EXCEPTION 'history_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
    -- FK deletion may clear attribution; queue attempts do not change content.
    IF ((to_jsonb(NEW) - ARRAY['encryption_checked_at','encryption_revision','actor_id','author_id','api_key_id','author_api_key_id','integration_id'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['encryption_checked_at','encryption_revision','actor_id','author_id','api_key_id','author_api_key_id','integration_id']))
      AND NEW.encryption_revision <= OLD.encryption_revision THEN
      RAISE EXCEPTION 'history_revision_must_advance' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER issue_events_encryption_guard BEFORE INSERT OR UPDATE ON public.issue_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_history_encryption();
CREATE TRIGGER page_versions_encryption_guard BEFORE INSERT OR UPDATE ON public.page_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_history_encryption();
REVOKE ALL ON FUNCTION public.guard_history_encryption() FROM PUBLIC, anon, authenticated;

-- Realtime carries invalidation metadata only, including during the legacy phase.
CREATE OR REPLACE FUNCTION public.broadcast_event_scoped()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_new public.issue_events%ROWTYPE;
  v_old public.issue_events%ROWTYPE;
  pid uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.encryption_revision <> OLD.encryption_revision
    OR NEW.encryption_checked_at IS DISTINCT FROM OLD.encryption_checked_at) THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW; pid := NEW.project_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := OLD; pid := OLD.project_id; END IF;
  v_new.from_value := NULL; v_new.to_value := NULL; v_new.encrypted_content := NULL;
  v_old.from_value := NULL; v_old.to_value := NULL; v_old.encrypted_content := NULL;
  IF pid IS NOT NULL THEN
    PERFORM realtime.broadcast_changes('project:' || pid, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, v_new, v_old);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$function$;

create or replace function public.get_cycle_stats(p_tz text default 'UTC'::text)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with today as (
    select (now() at time zone p_tz)::date as d
  ),
  completion_offsets as (
    select ((i.completed_at at time zone p_tz)::date
              - (i.due_date at time zone p_tz)::date) as offset_days
    from public.issues i
    join public.projects p
      on p.id = i.project_id
     and p.deleted_at is null
    where i.assignee_id = auth.uid()
      and i.deleted_at is null
      and i.status = 'done'
      and i.completed_at is not null
      and i.due_date is not null
  ),
  cadence as (
    select avg(offset_days)::numeric as avg_offset, count(*) as sample
    from completion_offsets
  ),
  started_cycles as (
    select c.id
    from public.cycles c, today
    where c.user_id = auth.uid() and c.start_date <= today.d
  ),
  per_cycle as (
    select sc.id, count(p.id) as n
    from started_cycles sc
    left join public.issues i
      on i.cycle_id = sc.id
     and i.deleted_at is null
    left join public.projects p
      on p.id = i.project_id
     and p.deleted_at is null
    group by sc.id
  ),
  cycles_agg as (
    select avg(n)::numeric as avg_per_cycle, count(*) as cycle_count
    from per_cycle
  ),
  first_started as (
    select e.issue_id, min(e.created_at) as started_at
    from public.issue_events e
    where e.starts_work
    group by e.issue_id
  ),
  durations as (
    select
      i.effort,
      extract(epoch from (i.completed_at - fs.started_at)) as secs
    from public.issues i
    join public.projects p
      on p.id = i.project_id
     and p.deleted_at is null
    join first_started fs on fs.issue_id = i.id
    where i.assignee_id = auth.uid()
      and i.deleted_at is null
      and i.status = 'done'
      and i.completed_at is not null
      and i.effort is not null
      and i.completed_at > fs.started_at
  ),
  by_effort as (
    select
      effort,
      percentile_cont(0.5) within group (order by secs)::numeric as median_seconds,
      count(*) as sample
    from durations
    group by effort
  )
  select jsonb_build_object(
    'avg_completion_offset_days', (select avg_offset from cadence),
    'completion_offset_sample', coalesce((select sample from cadence), 0),
    'avg_issues_per_cycle', (select avg_per_cycle from cycles_agg),
    'cycle_count', coalesce((select cycle_count from cycles_agg), 0),
    'by_effort', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'effort', be.effort,
                'median_seconds', be.median_seconds,
                'sample', be.sample))
       from by_effort be),
      '[]'::jsonb
    )
  );
$$;

ALTER TABLE public.issue_events ENABLE TRIGGER issue_events_broadcast;
COMMIT;
