-- MIN-926: the first brick of a proactive Numo (MIN-925). Workspace events
-- already land in the routine journal (`routine_events`, MIN-677). This
-- migration records who caused each event, journals a few more sources, and
-- adds the per-user batches that the routines clock fills and empties.
--
-- Actor. A write made during a Numo turn carries the `x-minddy-actor-kind:
-- numo` request header (lib/server/supabase-fetch.ts, `withEventActor`),
-- like the routine cause headers. PostgREST runs each request in its own
-- transaction, so a request header is the only way the application can tag a
-- write; a `set_config` from a separate RPC would not reach it. The kind is
-- read from any caller: a person who forges it only hides their own gesture
-- from their teammates' Numo, which they could achieve by not writing at all.
-- The actor id is trusted from a header only on service-role requests;
-- otherwise it is `auth.uid()`, then the authoring column of the row.
--
-- Batches. `route_numo_event` adds one journal row to the open batch of each
-- member who should hear about it, and `claim_numo_event_batches` hands due
-- batches to exactly one worker. Every new event pushes a batch's deadline
-- five minutes past the event, never beyond ten minutes after the first one.
--
-- Additive only: the previous release reads `routine_events` through
-- `select *` and ignores the new columns, and never reads the new table.

BEGIN;

ALTER TABLE public.routine_events
  ADD COLUMN actor_id uuid,
  ADD COLUMN actor_kind text CHECK (actor_kind IN ('user','numo','system')),
  -- Columns an UPDATE changed, so the batch filter can drop reorders and
  -- background maintenance. NULL for inserts and for derived events.
  ADD COLUMN changed_fields text[],
  DROP CONSTRAINT routine_events_subject_type_check,
  ADD CONSTRAINT routine_events_subject_type_check
    CHECK (subject_type IN ('issue','page','feedback','objective','routine')),
  DROP CONSTRAINT routine_events_event_check,
  ADD CONSTRAINT routine_events_event_check CHECK (event IN (
    'issue.created','issue.updated','issue.status_changed','issue.assigned','issue.comment_added',
    'issue.pull_request','feedback.received','feedback.updated','page.arrived','page.updated',
    'objective.status_changed','objective.target_date_changed','routine.finished'));

-- Who caused the current write. `p_row_actor` is the authoring column of the
-- row (comment author, page editor, issue creator), used when neither the
-- session nor a trusted header names anyone.
CREATE FUNCTION public.routine_event_actor(p_row_actor uuid, OUT actor_id uuid, OUT actor_kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE headers jsonb; header_actor uuid;
BEGIN
  headers := nullif(current_setting('request.headers',true),'')::jsonb;
  IF current_user='service_role' OR nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role' THEN
    BEGIN header_actor := (headers->>'x-minddy-actor-id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN header_actor := NULL; END;
  END IF;
  actor_id := COALESCE(header_actor, auth.uid(), p_row_actor);
  actor_kind := CASE
    WHEN headers->>'x-minddy-actor-kind'='numo' THEN 'numo'
    WHEN actor_id IS NOT NULL THEN 'user'
    ELSE 'system' END;
END; $$;
REVOKE ALL ON FUNCTION public.routine_event_actor(uuid) FROM PUBLIC,anon,authenticated;

-- The MIN-767 version, plus the actor and the changed columns.
CREATE OR REPLACE FUNCTION public.capture_routine_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  n jsonb; o jsonb; pid uuid; sid uuid; kind text; ev text; src uuid;
  before_value jsonb := '{}'; after_value jsonb := '{}'; cause uuid; ancestors uuid[] := '{}'; headers jsonb;
  row_actor uuid; v_actor uuid; v_kind text; changed text[];
BEGIN
  n := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  o := CASE WHEN TG_OP='INSERT' THEN '{}' ELSE to_jsonb(OLD) END;
  IF TG_TABLE_NAME='issue_categories' THEN
    sid := (n->>'issue_id')::uuid; kind := 'issue'; ev := 'issue.updated';
    changed := ARRAY['category'];
    SELECT project_id INTO pid FROM public.issues WHERE id=sid FOR NO KEY UPDATE;
  ELSIF TG_TABLE_NAME='comments' THEN
    sid := (n->>'issue_id')::uuid;
    IF sid IS NULL THEN RETURN NEW; END IF;
    SELECT project_id INTO pid FROM public.issues WHERE id=sid FOR NO KEY UPDATE;
    kind := 'issue'; ev := 'issue.comment_added'; src := (n->>'id')::uuid;
    row_actor := (n->>'author_id')::uuid;
  ELSE
    sid := (n->>'id')::uuid; pid := (n->>'project_id')::uuid;
    IF TG_OP='UPDATE' THEN
      SELECT COALESCE(array_agg(key ORDER BY key),'{}') INTO changed
        FROM jsonb_each(n) WHERE n->key IS DISTINCT FROM o->key AND key<>'updated_at';
    END IF;
    IF TG_TABLE_NAME='issues' THEN
      kind := 'issue'; ev := CASE WHEN TG_OP='INSERT' THEN 'issue.created' ELSE 'issue.updated' END;
      before_value := jsonb_build_object('status',o->'status','assignee',o->'assignee_id','deleted',o->'deleted_at');
      after_value := jsonb_build_object('status',n->'status','assignee',n->'assignee_id','priority',n->'priority','effort',n->'effort','deleted',n->'deleted_at');
      IF TG_OP='UPDATE' AND n->'status' IS DISTINCT FROM o->'status' THEN ev := 'issue.status_changed'; END IF;
      IF TG_OP='INSERT' THEN row_actor := (n->>'created_by')::uuid; END IF;
    ELSIF TG_TABLE_NAME='feedback_posts' THEN
      kind := 'feedback'; ev := CASE WHEN TG_OP='INSERT' THEN 'feedback.received' ELSE 'feedback.updated' END;
      IF TG_OP='INSERT' THEN row_actor := (n->>'author_id')::uuid; END IF;
    ELSE
      kind := 'page'; ev := CASE WHEN TG_OP='INSERT' OR n->'parent_id' IS DISTINCT FROM o->'parent_id' THEN 'page.arrived' ELSE 'page.updated' END;
      before_value := jsonb_build_object('parent_id',o->'parent_id','deleted',o->'deleted_at');
      after_value := jsonb_build_object('parent_id',n->'parent_id','deleted',n->'deleted_at');
      -- Restoring an entry does not create another arrival.
      IF TG_OP='UPDATE' AND o->>'deleted_at' IS NOT NULL THEN ev := 'page.updated'; END IF;
      row_actor := COALESCE((n->>'updated_by')::uuid,(n->>'created_by')::uuid);
    END IF;
  END IF;
  IF pid IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;
  -- A cascade from a deleted project (an account erasure, for instance) can
  -- still update its rows in the same statement: nothing is left to route,
  -- and the journal's foreign key would reject the event.
  IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=pid) THEN RETURN COALESCE(NEW,OLD); END IF;

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
  SELECT a.actor_id, a.actor_kind INTO v_actor, v_kind FROM public.routine_event_actor(row_actor) a;
  -- Serialize mutations before allocating the event identity, not just consumers.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pid::text||kind||sid::text,677));
  IF kind='issue' THEN
    SELECT after_value || jsonb_build_object('status',i.status,'assignee',i.assignee_id,'priority',i.priority,'effort',i.effort,'deleted',i.deleted_at,
      'category',COALESCE((SELECT jsonb_agg(c.category_id ORDER BY c.category_id) FROM public.issue_categories c WHERE c.issue_id=sid),'[]'::jsonb))
      INTO after_value FROM public.issues i WHERE i.id=sid;
    -- The issue was deleted later in the same statement: it has no state left.
    IF NOT FOUND THEN RETURN COALESCE(NEW,OLD); END IF;
  END IF;
  INSERT INTO public.routine_events(project_id,subject_type,subject_id,event,source_id,before_state,after_state,cause_routine_id,cause_routine_ids,actor_id,actor_kind,changed_fields)
    VALUES(pid,kind,sid,ev,src,before_value,after_value,cause,ancestors,v_actor,v_kind,changed);
  IF TG_TABLE_NAME='issues' AND n->>'assignee_id' IS NOT NULL
    AND n->'assignee_id' IS DISTINCT FROM o->'assignee_id' THEN
    INSERT INTO public.routine_events(project_id,subject_type,subject_id,event,before_state,after_state,cause_routine_id,cause_routine_ids,actor_id,actor_kind)
      VALUES(pid,kind,sid,'issue.assigned',before_value,after_value,cause,ancestors,v_actor,v_kind);
  END IF;
  RETURN COALESCE(NEW,OLD);
END; $$;
REVOKE ALL ON FUNCTION public.capture_routine_event() FROM PUBLIC,anon,authenticated;

-- Sources that only Numo's batches read: no routine trigger listens to them.
-- Objectives: status and target date. Pull requests: the forge gestures the
-- issue activity already records (opened, reopened, approved, changes
-- requested, merged, closed), with the activity's own actor. Routines: the end
-- of a turn that belongs to a routine occurrence.
CREATE FUNCTION public.capture_numo_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pid uuid; sid uuid; kind text; ev text; before_value jsonb := '{}'; after_value jsonb := '{}';
  headers jsonb; v_actor uuid; v_kind text; row_actor uuid; row_numo boolean := false;
BEGIN
  IF current_user='service_role' OR nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role' THEN
    headers := nullif(current_setting('request.headers',true),'')::jsonb;
    IF headers->>'x-minddy-routine-suppress'='true' THEN RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME='objectives' THEN
    IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
    pid := NEW.project_id; sid := NEW.id; kind := 'objective';
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      ev := 'objective.status_changed';
      before_value := jsonb_build_object('status',OLD.status);
      after_value := jsonb_build_object('status',NEW.status,'lead',NEW.lead_user_id);
    ELSIF NEW.target_date IS DISTINCT FROM OLD.target_date THEN
      ev := 'objective.target_date_changed';
      before_value := jsonb_build_object('target_date',OLD.target_date);
      after_value := jsonb_build_object('target_date',NEW.target_date,'lead',NEW.lead_user_id);
    ELSE RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='issue_events' THEN
    IF NEW.type NOT IN ('pr_opened','pr_reopened','pr_approved','pr_changes_requested','pr_accepted','pr_rejected')
      OR NEW.issue_id IS NULL THEN RETURN NEW; END IF;
    SELECT project_id INTO pid FROM public.issues WHERE id=NEW.issue_id AND deleted_at IS NULL;
    sid := NEW.issue_id; kind := 'issue'; ev := 'issue.pull_request';
    after_value := jsonb_build_object('type',NEW.type);
    row_actor := NEW.actor_id; row_numo := NEW.via_assistant;
  ELSE
    IF NEW.status NOT IN ('completed','failed','stopped') OR OLD.status IN ('completed','failed','stopped') THEN RETURN NEW; END IF;
    SELECT r.project_id, r.id INTO pid, sid FROM public.numo_routine_occurrences occ
      JOIN public.agent_routines r ON r.id=occ.routine_id
      WHERE occ.turn_id=NEW.id AND r.deleted_at IS NULL;
    kind := 'routine'; ev := 'routine.finished';
    after_value := jsonb_build_object('status',NEW.status,'owner',NEW.user_id);
  END IF;
  IF pid IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=pid) THEN RETURN NEW; END IF;
  -- The end of a run has no human actor: it reaches the routine's owner too,
  -- and the batch filter keeps only failures (lib/server/numo/event-batches.ts).
  IF kind='routine' THEN v_actor := NULL; v_kind := 'system';
  ELSE
    SELECT a.actor_id, a.actor_kind INTO v_actor, v_kind FROM public.routine_event_actor(row_actor) a;
    IF row_numo THEN v_kind := 'numo'; END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pid::text||kind||sid::text,677));
  INSERT INTO public.routine_events(project_id,subject_type,subject_id,event,before_state,after_state,actor_id,actor_kind)
    VALUES(pid,kind,sid,ev,before_value,after_value,v_actor,v_kind);
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.capture_numo_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER numo_objective_event AFTER UPDATE OF status,target_date ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.capture_numo_event();
CREATE TRIGGER numo_pull_request_event AFTER INSERT ON public.issue_events
  FOR EACH ROW EXECUTE FUNCTION public.capture_numo_event();
CREATE TRIGGER numo_routine_finished_event AFTER UPDATE OF status ON public.numo_assistant_turns
  FOR EACH ROW EXECUTE FUNCTION public.capture_numo_event();

CREATE TABLE public.numo_event_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  -- Journal ids, not a foreign key: the journal keeps its own 30-day
  -- retention, and a batch lives for minutes.
  event_ids bigint[] NOT NULL CHECK (cardinality(event_ids) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','processing','done')),
  claimed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  error_code text,
  CHECK (due_at <= opened_at + interval '10 minutes')
);
-- At most one batch per user collects new events.
CREATE UNIQUE INDEX numo_event_batches_one_open ON public.numo_event_batches(user_id) WHERE status='open';
CREATE INDEX numo_event_batches_due ON public.numo_event_batches(status,due_at);
ALTER TABLE public.numo_event_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_event_batches FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_event_batches TO service_role;

-- Members of the project who may hear about one event: anyone with access,
-- except its actor, a member who has not opened minddy in 30 days, and a
-- member with Numo's memory or background Numo switched off. Background Numo
-- (`numo_background` in user_metadata) is opt-in until its switch ships.
CREATE FUNCTION public.numo_event_recipients(p_project_id uuid, p_actor_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT account.id FROM (
    SELECT owner_id AS user_id FROM public.projects WHERE id=p_project_id AND deleted_at IS NULL
    UNION
    SELECT m.user_id FROM public.project_members m JOIN public.projects p ON p.id=m.project_id
      WHERE m.project_id=p_project_id AND p.deleted_at IS NULL
  ) member
  JOIN auth.users account ON account.id=member.user_id
  WHERE account.id IS DISTINCT FROM p_actor_id
    AND account.deleted_at IS NULL
    AND COALESCE(account.raw_user_meta_data->>'numo_memory','true')<>'false'
    AND account.raw_user_meta_data->>'numo_background'='true'
    AND (account.last_sign_in_at>=now()-interval '30 days' OR EXISTS(
      SELECT 1 FROM auth.sessions s WHERE s.user_id=account.id
        AND GREATEST(s.created_at,s.updated_at,s.refreshed_at::timestamptz)>=now()-interval '30 days'))
$$;
REVOKE ALL ON FUNCTION public.numo_event_recipients(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.numo_event_recipients(uuid,uuid) TO service_role;

-- Add one journal row to the open batch of each recipient; returns how many
-- batches it opened or extended. Idempotent: replaying an event changes
-- nothing. Repeated saves of one page count once per batch.
CREATE FUNCTION public.route_numo_event(p_event_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.routine_events%ROWTYPE; recipient uuid; touched integer := 0; b public.numo_event_batches%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.routine_events WHERE id=p_event_id;
  IF e.id IS NULL OR e.actor_kind='numo' THEN RETURN 0; END IF;
  FOR recipient IN SELECT public.numo_event_recipients(e.project_id,e.actor_id) LOOP
    SELECT * INTO b FROM public.numo_event_batches WHERE user_id=recipient AND status='open' FOR UPDATE;
    IF b.id IS NULL THEN
      INSERT INTO public.numo_event_batches(user_id,opened_at,due_at,event_ids)
        VALUES(recipient,e.created_at,e.created_at+interval '5 minutes',ARRAY[e.id])
        ON CONFLICT (user_id) WHERE status='open' DO NOTHING;
      IF FOUND THEN touched := touched+1; CONTINUE; END IF;
      SELECT * INTO b FROM public.numo_event_batches WHERE user_id=recipient AND status='open' FOR UPDATE;
    END IF;
    IF e.id=ANY(b.event_ids) OR cardinality(b.event_ids)>=200 THEN CONTINUE; END IF;
    IF e.event='page.updated' AND EXISTS(SELECT 1 FROM public.routine_events o WHERE o.id=ANY(b.event_ids)
      AND o.event='page.updated' AND o.subject_id=e.subject_id) THEN CONTINUE; END IF;
    UPDATE public.numo_event_batches SET event_ids=event_ids||e.id,
      due_at=least(greatest(due_at,e.created_at+interval '5 minutes'),opened_at+interval '10 minutes')
      WHERE id=b.id;
    touched := touched+1;
  END LOOP;
  RETURN touched;
END; $$;
REVOKE ALL ON FUNCTION public.route_numo_event(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.route_numo_event(bigint) TO service_role;

-- Hand due batches to one worker: open batches past their deadline, and
-- batches whose worker vanished 15 minutes ago. Also forgets batches closed a
-- week ago, so the table stays small.
CREATE FUNCTION public.claim_numo_event_batches(p_limit integer DEFAULT 20)
RETURNS SETOF public.numo_event_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  DELETE FROM public.numo_event_batches WHERE status='done' AND closed_at<now()-interval '7 days';
  RETURN QUERY WITH candidates AS (
    SELECT id FROM public.numo_event_batches
      WHERE (status='open' AND due_at<=now())
         OR (status='processing' AND claimed_at<now()-interval '15 minutes')
      ORDER BY due_at LIMIT least(greatest(p_limit,1),50) FOR UPDATE SKIP LOCKED
  ) UPDATE public.numo_event_batches b SET status='processing',claimed_at=now(),attempts=b.attempts+1
    FROM candidates c WHERE b.id=c.id RETURNING b.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_numo_event_batches(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_numo_event_batches(integer) TO service_role;

COMMIT;
