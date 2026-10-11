-- MIN-677: a transactional event journal and single-use routine armings.
BEGIN;
ALTER TABLE public.agent_routines
  ADD COLUMN legacy_source_key text,
  ADD CONSTRAINT agent_routines_legacy_source_unique UNIQUE(project_id,legacy_source_key),
  ADD COLUMN trigger_type text NOT NULL DEFAULT 'schedule' CHECK (trigger_type IN ('schedule','event','database')),
  ADD COLUMN trigger jsonb,
  ADD COLUMN trigger_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN trigger_activated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT agent_routines_event_schedule_check CHECK (trigger_type='schedule' OR next_run_at IS NULL),
  ADD CONSTRAINT agent_routines_trigger_protection_check CHECK (encryption_version=0 OR trigger IS NULL);

CREATE FUNCTION public.revise_routine_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.enabled IS DISTINCT FROM OLD.enabled OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.trigger IS DISTINCT FROM OLD.trigger OR NEW.trigger_type IS DISTINCT FROM OLD.trigger_type
    OR NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR NEW.prompt IS DISTINCT FROM OLD.prompt
    OR NEW.max_spend_percent IS DISTINCT FROM OLD.max_spend_percent OR NEW.timezone IS DISTINCT FROM OLD.timezone THEN
    NEW.trigger_revision := OLD.trigger_revision+1;
    NEW.trigger_activated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER agent_routines_trigger_revision BEFORE UPDATE ON public.agent_routines
  FOR EACH ROW EXECUTE FUNCTION public.revise_routine_trigger();
REVOKE ALL ON FUNCTION public.revise_routine_trigger() FROM PUBLIC,anon,authenticated;

CREATE TABLE public.routine_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('issue','page','feedback')),
  subject_id uuid NOT NULL,
  event text NOT NULL CHECK(event IN ('issue.created','issue.updated','issue.status_changed','issue.assigned','issue.comment_added','feedback.received','feedback.updated','page.arrived','page.updated')),
  source_id uuid,
  before_state jsonb NOT NULL DEFAULT '{}',
  after_state jsonb NOT NULL DEFAULT '{}',
  cause_routine_id uuid,
  cause_routine_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(cause_routine_ids)<=8),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  error_code text
);
CREATE INDEX routine_events_pending ON public.routine_events(id) WHERE processed_at IS NULL;
CREATE INDEX routine_events_subject ON public.routine_events(project_id,subject_type,subject_id,id) WHERE processed_at IS NULL;
CREATE TABLE public.routine_armings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES public.agent_routines(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  event_id bigint NOT NULL REFERENCES public.routine_events(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK(subject_type IN ('issue','page','feedback')),
  subject_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'armed' CHECK(state IN ('armed','reserved','consumed','cancelled','failed')),
  request_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  retry_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(routine_id,revision,event_id)
);
CREATE INDEX routine_armings_subject ON public.routine_armings(project_id,subject_type,subject_id) WHERE state IN ('armed','reserved');
CREATE INDEX routine_armings_retry ON public.routine_armings(retry_at) WHERE state IN ('armed','reserved');
ALTER TABLE public.routine_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_armings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.routine_events,public.routine_armings FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.routine_events,public.routine_armings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.routine_events_id_seq TO service_role;

-- Only bounded workflow state and routing IDs enter the journal. Text and
-- database property values are read through their access-checked codecs later.
CREATE FUNCTION public.capture_routine_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  n jsonb; o jsonb; pid uuid; sid uuid; kind text; ev text; src uuid;
  before_value jsonb := '{}'; after_value jsonb := '{}'; cause uuid; ancestors uuid[] := '{}'; headers jsonb;
BEGIN
  n := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  o := CASE WHEN TG_OP='INSERT' THEN '{}' ELSE to_jsonb(OLD) END;
  IF TG_TABLE_NAME='issue_categories' THEN
    sid := (n->>'issue_id')::uuid; kind := 'issue'; ev := 'issue.updated';
    SELECT project_id INTO pid FROM public.issues WHERE id=sid FOR NO KEY UPDATE;
  ELSIF TG_TABLE_NAME='comments' THEN
    sid := (n->>'issue_id')::uuid;
    IF sid IS NULL THEN RETURN NEW; END IF;
    SELECT project_id INTO pid FROM public.issues WHERE id=sid FOR NO KEY UPDATE;
    kind := 'issue'; ev := 'issue.comment_added'; src := (n->>'id')::uuid;
  ELSE
    sid := (n->>'id')::uuid; pid := (n->>'project_id')::uuid;
    IF TG_TABLE_NAME='issues' THEN
      kind := 'issue'; ev := CASE WHEN TG_OP='INSERT' THEN 'issue.created' ELSE 'issue.updated' END;
      before_value := jsonb_build_object('status',o->'status','assignee',o->'assignee_id','deleted',o->'deleted_at');
      after_value := jsonb_build_object('status',n->'status','assignee',n->'assignee_id','priority',n->'priority','effort',n->'effort','deleted',n->'deleted_at');
      IF TG_OP='UPDATE' AND n->'status' IS DISTINCT FROM o->'status' THEN ev := 'issue.status_changed'; END IF;
    ELSIF TG_TABLE_NAME='feedback_posts' THEN
      kind := 'feedback'; ev := CASE WHEN TG_OP='INSERT' THEN 'feedback.received' ELSE 'feedback.updated' END;
    ELSE
      kind := 'page'; ev := CASE WHEN TG_OP='INSERT' OR n->'parent_id' IS DISTINCT FROM o->'parent_id' THEN 'page.arrived' ELSE 'page.updated' END;
      before_value := jsonb_build_object('parent_id',o->'parent_id','deleted',o->'deleted_at');
      after_value := jsonb_build_object('parent_id',n->'parent_id','deleted',n->'deleted_at');
      -- Restoring an entry does not create another arrival.
      IF TG_OP='UPDATE' AND o->>'deleted_at' IS NOT NULL THEN ev := 'page.updated'; END IF;
    END IF;
  END IF;
  IF pid IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;

  -- Header attribution is trusted only from our server's service-role calls.
  IF current_user='service_role' OR nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role' THEN
    headers := nullif(current_setting('request.headers',true),'')::jsonb;
    IF headers->>'x-minddy-routine-suppress'='true' THEN RETURN COALESCE(NEW,OLD); END IF;
    BEGIN
      SELECT COALESCE(array_agg(value::uuid),'{}') INTO ancestors FROM jsonb_array_elements_text(COALESCE(headers->>'x-minddy-routine-ancestors','[]')::jsonb);
      IF cardinality(ancestors)>8 THEN ancestors := ancestors[1:8]; END IF;
      cause := (nullif(current_setting('request.headers',true),'')::jsonb->>'x-minddy-routine-cause')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN cause := NULL; ancestors := '{}'; END;
  END IF;
  -- Serialize mutations before allocating the event identity, not just consumers.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pid::text||kind||sid::text,677));
  IF kind='issue' THEN
    SELECT after_value || jsonb_build_object('status',i.status,'assignee',i.assignee_id,'priority',i.priority,'effort',i.effort,'deleted',i.deleted_at,
      'category',COALESCE((SELECT jsonb_agg(c.category_id ORDER BY c.category_id) FROM public.issue_categories c WHERE c.issue_id=sid),'[]'::jsonb))
      INTO after_value FROM public.issues i WHERE i.id=sid;
  END IF;
  INSERT INTO public.routine_events(project_id,subject_type,subject_id,event,source_id,before_state,after_state,cause_routine_id,cause_routine_ids)
    VALUES(pid,kind,sid,ev,src,before_value,after_value,cause,ancestors);
  IF TG_TABLE_NAME='issues' AND n->>'assignee_id' IS NOT NULL
    AND n->'assignee_id' IS DISTINCT FROM o->'assignee_id' THEN
    INSERT INTO public.routine_events(project_id,subject_type,subject_id,event,before_state,after_state,cause_routine_id,cause_routine_ids)
      VALUES(pid,kind,sid,'issue.assigned',before_value,after_value,cause,ancestors);
  END IF;
  RETURN COALESCE(NEW,OLD);
END; $$;
REVOKE ALL ON FUNCTION public.capture_routine_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER routine_issue_event AFTER INSERT OR UPDATE ON public.issues FOR EACH ROW EXECUTE FUNCTION public.capture_routine_event();
CREATE TRIGGER routine_category_event AFTER INSERT OR DELETE ON public.issue_categories FOR EACH ROW EXECUTE FUNCTION public.capture_routine_event();
CREATE TRIGGER routine_comment_event AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.capture_routine_event();
CREATE TRIGGER routine_feedback_event AFTER INSERT OR UPDATE ON public.feedback_posts FOR EACH ROW EXECUTE FUNCTION public.capture_routine_event();
CREATE TRIGGER routine_page_event AFTER INSERT OR UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.capture_routine_event();

CREATE FUNCTION public.claim_routine_events(p_limit integer DEFAULT 20)
RETURNS SETOF public.routine_events LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(677,1);
  RETURN QUERY WITH candidates AS (
    SELECT e.id FROM public.routine_events e WHERE e.processed_at IS NULL
      AND (e.lease_until IS NULL OR e.lease_until<now())
      AND NOT EXISTS(SELECT 1 FROM public.routine_events earlier WHERE earlier.project_id=e.project_id
        AND earlier.subject_type=e.subject_type AND earlier.subject_id=e.subject_id
        AND earlier.processed_at IS NULL AND earlier.id<e.id)
    ORDER BY e.id LIMIT least(greatest(p_limit,1),50) FOR UPDATE SKIP LOCKED
  ) UPDATE public.routine_events e SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=e.attempts+1
    FROM candidates c WHERE e.id=c.id RETURNING e.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_routine_events(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_routine_events(integer) TO service_role;

CREATE FUNCTION public.arm_routine_event(p_routine_id uuid,p_revision bigint,p_event_id bigint,p_delay_minutes integer DEFAULT 0)
RETURNS public.routine_armings LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.agent_routines%ROWTYPE; e public.routine_events%ROWTYPE; a public.routine_armings%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.agent_routines WHERE id=p_routine_id FOR UPDATE;
  SELECT * INTO e FROM public.routine_events WHERE id=p_event_id;
  IF r.id IS NULL OR e.id IS NULL OR NOT r.enabled OR r.deleted_at IS NOT NULL OR r.trigger_revision<>p_revision
    OR r.project_id<>e.project_id OR e.created_at<r.trigger_activated_at OR e.cause_routine_id=r.id OR r.id=ANY(e.cause_routine_ids) OR cardinality(e.cause_routine_ids)>=8 THEN RETURN NULL; END IF;
  INSERT INTO public.routine_armings(routine_id,revision,event_id,project_id,subject_type,subject_id,retry_at)
    VALUES(r.id,r.trigger_revision,e.id,e.project_id,e.subject_type,e.subject_id,greatest(e.created_at+make_interval(mins=>least(greatest(p_delay_minutes,0),120)),now()))
    ON CONFLICT(routine_id,revision,event_id) DO NOTHING;
  SELECT * INTO a FROM public.routine_armings WHERE routine_id=r.id AND revision=r.trigger_revision AND event_id=e.id;
  RETURN a;
END; $$;
REVOKE ALL ON FUNCTION public.arm_routine_event(uuid,bigint,bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arm_routine_event(uuid,bigint,bigint,integer) TO service_role;

CREATE FUNCTION public.claim_routine_arming(p_id uuid,p_revision bigint)
RETURNS public.routine_armings LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.routine_armings%ROWTYPE; r public.agent_routines%ROWTYPE;
BEGIN
  SELECT r0.* INTO r FROM public.agent_routines r0 JOIN public.routine_armings a0 ON a0.routine_id=r0.id WHERE a0.id=p_id FOR UPDATE OF r0;
  IF NOT r.enabled OR r.deleted_at IS NOT NULL OR r.trigger_revision<>p_revision THEN RETURN NULL; END IF;
  UPDATE public.routine_armings SET state='reserved',lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()
    WHERE id=p_id AND revision=p_revision AND state IN ('armed','reserved') AND retry_at<=now()
    AND (lease_until IS NULL OR lease_until<now()) RETURNING * INTO a;
  RETURN a;
END; $$;
REVOKE ALL ON FUNCTION public.claim_routine_arming(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_routine_arming(uuid,bigint) TO service_role;

ALTER TABLE public.numo_routine_occurrences
  ADD COLUMN arming_id uuid UNIQUE REFERENCES public.routine_armings(id) ON DELETE SET NULL,
  ADD COLUMN event_id bigint,
  ADD COLUMN subject_id uuid,
  ADD COLUMN subject_type text,
  ADD COLUMN cause_routine_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(cause_routine_ids)<=8),
  DROP CONSTRAINT numo_routine_occurrences_origin_check,
  DROP CONSTRAINT numo_routine_occurrences_schedule_check,
  ADD CONSTRAINT numo_routine_occurrences_origin_check CHECK(origin IN ('scheduled','manual','event','database')),
  ADD CONSTRAINT numo_routine_occurrences_schedule_check CHECK((origin='scheduled' AND scheduled_for IS NOT NULL) OR (origin<>'scheduled' AND scheduled_for IS NULL));
DROP FUNCTION public.ensure_numo_routine_occurrence(uuid,uuid,text,timestamptz,uuid,text);
CREATE OR REPLACE FUNCTION public.ensure_numo_routine_occurrence(
  p_routine_id uuid,
  p_user_id uuid,
  p_origin text,
  p_scheduled_for timestamptz,
  p_request_id uuid,
  p_title text,
  p_arming_id uuid DEFAULT NULL
) RETURNS public.numo_routine_occurrences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_routine public.agent_routines%ROWTYPE;
  v_occurrence public.numo_routine_occurrences%ROWTYPE;
  v_conversation_id uuid;
  v_arming public.routine_armings%ROWTYPE;
BEGIN
  IF p_routine_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
     OR p_origin NOT IN ('scheduled', 'manual', 'event', 'database')
     OR (p_origin = 'scheduled' AND p_scheduled_for IS NULL)
     OR (p_origin <> 'scheduled' AND p_scheduled_for IS NOT NULL)
     OR nullif(pg_catalog.btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'routine_occurrence_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT routine.* INTO v_routine
  FROM public.agent_routines AS routine
  JOIN public.projects AS project ON project.id = routine.project_id
  WHERE routine.id = p_routine_id
    AND routine.deleted_at IS NULL
    AND project.deleted_at IS NULL
    AND project.owner_id = p_user_id
  FOR UPDATE OF routine;
  IF v_routine.id IS NULL THEN
    RAISE EXCEPTION 'routine_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_routine.owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'routine_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_origin IN ('event','database') THEN
    SELECT * INTO v_arming FROM public.routine_armings WHERE id=p_arming_id AND routine_id=p_routine_id FOR UPDATE;
    IF v_arming.id IS NULL OR NOT v_routine.enabled OR v_arming.revision<>v_routine.trigger_revision
      OR v_arming.state NOT IN ('reserved','consumed') OR v_arming.request_id<>p_request_id
      OR v_arming.lease_until<now() OR v_routine.trigger_type<>p_origin THEN
      RAISE EXCEPTION 'routine_arming_invalid' USING ERRCODE='22023';
    END IF;
  END IF;
  SELECT * INTO v_occurrence
  FROM public.numo_routine_occurrences
  WHERE request_id = p_request_id
     OR (
       p_origin = 'scheduled'
       AND routine_id = p_routine_id
       AND origin = 'scheduled'
       AND scheduled_for = p_scheduled_for
     )
  ORDER BY created_at ASC
  LIMIT 1;
  IF v_occurrence.id IS NOT NULL THEN
    IF v_occurrence.routine_id IS DISTINCT FROM p_routine_id
       OR v_occurrence.origin IS DISTINCT FROM p_origin
       OR v_occurrence.scheduled_for IS DISTINCT FROM p_scheduled_for THEN
      RAISE EXCEPTION 'routine_occurrence_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_occurrence;
  END IF;

  INSERT INTO public.conversations (
    project_id, user_id, title, model, reasoning_level
  ) VALUES (
    NULL, p_user_id, pg_catalog.left(pg_catalog.btrim(p_title), 200), NULL, NULL
  ) RETURNING id INTO v_conversation_id;

  INSERT INTO public.numo_routine_occurrences (
    routine_id, origin, scheduled_for, conversation_id, request_id,arming_id,event_id,subject_id,subject_type,cause_routine_ids
  ) VALUES (
    p_routine_id, p_origin, p_scheduled_for, v_conversation_id, p_request_id,p_arming_id,v_arming.event_id,v_arming.subject_id,v_arming.subject_type,COALESCE((SELECT cause_routine_ids FROM public.routine_events WHERE id=v_arming.event_id),'{}')
  ) RETURNING * INTO v_occurrence;
  RETURN v_occurrence;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid, uuid, text, timestamptz, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid, uuid, text, timestamptz, uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_agent_routine_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean:=NEW.encryption_version>0 AND
  NEW.encrypted_content IS NOT NULL AND NEW.title IS NULL AND
  NEW.prompt IS NULL AND NEW.prompt_mentions IS NULL AND
  NEW.base_branch IS NULL AND NEW.trigger IS NULL;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-routine-content-activation',591));
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    IF NEW.project_id IS DISTINCT FROM OLD.project_id OR
        NEW.owner_id IS DISTINCT FROM OLD.owner_id OR
        NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'agent_routine_scope_immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.encryption_version<OLD.encryption_version OR
        OLD.encryption_version>0 AND NOT sealed THEN
      RAISE EXCEPTION 'agent_routine_content_downgrade'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      (NEW.encryption_version=0 AND NEW.encrypted_content IS NOT NULL) OR
      (NEW.encryption_version>0 AND NOT sealed) OR
      (sealed AND COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <>NEW.encryption_version,true)) THEN
    RAISE EXCEPTION 'agent_routine_content_state_invalid'
      USING ERRCODE='23514';
  END IF;
  IF (sealed OR EXISTS(SELECT 1 FROM public.agent_routine_content_encryption_scope))
      AND NEW.last_error IS NOT NULL AND NEW.last_error NOT IN (
        'quota','noRepo','alreadyRunning','noModelForProvider',
        'modelAbovePlan','managedServiceUnavailable',
        'executionBackendUnavailable','providerEndpointUnavailableFromSandbox',
        'launchFailed') THEN
    RAISE EXCEPTION 'agent_routine_error_requires_code' USING ERRCODE='23514';
  END IF;
  IF NOT sealed AND EXISTS(
    SELECT 1 FROM public.agent_routine_content_encryption_scope) THEN
    RAISE EXCEPTION 'agent_routine_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.activate_agent_routine_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-routine-content-activation',591));
  IF EXISTS(SELECT 1 FROM public.agent_routines WHERE
      encryption_version<1 OR encrypted_content IS NULL OR
      title IS NOT NULL OR prompt IS NOT NULL OR
      prompt_mentions IS NOT NULL OR base_branch IS NOT NULL OR trigger IS NOT NULL OR
      encryption_checked_at IS NULL OR
      last_error IS NOT NULL AND last_error NOT IN (
        'quota','noRepo','alreadyRunning','noModelForProvider',
        'modelAbovePlan','managedServiceUnavailable',
        'executionBackendUnavailable','providerEndpointUnavailableFromSandbox',
        'launchFailed')) THEN
    RETURN false;
  END IF;
  INSERT INTO public.agent_routine_content_encryption_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_agent_routine_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_agent_routine_content()
  TO service_role;

-- The archive survives. Waiting chains are closed; active work can finish or stop.
UPDATE public.agent_chains SET status='stopped',stop_reason='replaced_by_routines',pending_event=NULL,not_before=NULL
  WHERE status IN ('pending','awaiting_human');

CREATE FUNCTION public.cleanup_routine_events() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.routine_armings a SET state='cancelled',updated_at=now() FROM public.agent_routines r
    WHERE a.routine_id=r.id AND a.state IN ('armed','reserved')
      AND (NOT r.enabled OR r.deleted_at IS NOT NULL OR a.revision<>r.trigger_revision OR a.created_at<now()-interval '30 days');
  DELETE FROM public.routine_events e WHERE e.created_at<now()-interval '30 days'
    AND NOT EXISTS(SELECT 1 FROM public.routine_armings a WHERE a.event_id=e.id AND a.state IN ('armed','reserved'));
END; $$;
REVOKE ALL ON FUNCTION public.cleanup_routine_events() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_routine_events() TO service_role;
COMMIT;
