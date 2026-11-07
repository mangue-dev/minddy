-- MIN-926, second part: fixes from the review of 20270109200103.
--
-- Attribution. The application now tags background work: `system` for
-- automated news (Smart Assign, forge sync), which must not borrow a row's
-- author, and `maintenance` for re-sealing, rollovers and recurrence, which
-- routines still see but background Numo never batches. A Numo reply to a
-- comment mention is stored with its human author and `via_assistant`, so
-- the row flag now marks it as Numo's.
--
-- Sources. Comments on objectives and feedback, page comments, and mention
-- notifications, the only place a mention exists outside an encrypted body.
-- A mention reaches the mentioned member only (`recipient_id`).
--
-- Routing. `numo_routed_at` makes routing durable: a replayed row is never
-- batched twice, even after its first batch closed. Every journal row is
-- marked, filtered or not, so a later sweep can find the rows a failed or
-- previous-release worker finished without routing.
--
-- Claims. A batch whose worker died three times is closed instead of being
-- handed out forever.
--
-- Additive for the previous release: it never reads the new columns, and
-- the new event values only reach its routine worker, where no trigger
-- matches them.

BEGIN;

ALTER TABLE public.routine_events
  ADD COLUMN recipient_id uuid,
  ADD COLUMN numo_routed_at timestamptz,
  DROP CONSTRAINT routine_events_actor_kind_check,
  ADD CONSTRAINT routine_events_actor_kind_check CHECK (actor_kind IN ('user','numo','system','maintenance')),
  DROP CONSTRAINT routine_events_event_check,
  ADD CONSTRAINT routine_events_event_check CHECK (event IN (
    'issue.created','issue.updated','issue.status_changed','issue.assigned','issue.comment_added',
    'issue.pull_request','feedback.received','feedback.updated','feedback.comment_added',
    'page.arrived','page.updated','page.comment_added',
    'objective.status_changed','objective.target_date_changed','objective.comment_added',
    'mention.received','routine.finished'));
-- The routing sweep reads recent finished rows that were never routed.
CREATE INDEX routine_events_unrouted ON public.routine_events(created_at)
  WHERE numo_routed_at IS NULL AND processed_at IS NOT NULL;

-- `x-minddy-actor-kind`:
-- - `numo` and `maintenance` are read from any caller: forging either only
--   keeps the caller's own write out of other members' batches;
-- - `system` is trusted from the service role only, and drops any actor;
-- - anything else resolves to the person behind the write, if known.
CREATE OR REPLACE FUNCTION public.routine_event_actor(p_row_actor uuid, OUT actor_id uuid, OUT actor_kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE headers jsonb; header_actor uuid; header_kind text; trusted boolean;
BEGIN
  headers := nullif(current_setting('request.headers',true),'')::jsonb;
  header_kind := headers->>'x-minddy-actor-kind';
  trusted := current_user='service_role' OR nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role';
  IF trusted AND header_kind='system' THEN
    actor_id := NULL; actor_kind := 'system'; RETURN;
  END IF;
  IF trusted THEN
    BEGIN header_actor := (headers->>'x-minddy-actor-id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN header_actor := NULL; END;
  END IF;
  actor_id := COALESCE(header_actor, auth.uid(), p_row_actor);
  actor_kind := CASE
    WHEN header_kind IN ('numo','maintenance') THEN header_kind
    WHEN actor_id IS NOT NULL THEN 'user'
    ELSE 'system' END;
END; $$;
REVOKE ALL ON FUNCTION public.routine_event_actor(uuid) FROM PUBLIC,anon,authenticated;

-- The 20270109200103 version, plus: objective and feedback comments (the
-- existing `routine_comment_event` trigger already fires for every comment),
-- a comment written by Numo marked as such, and the issue's due date.
CREATE OR REPLACE FUNCTION public.capture_routine_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  n jsonb; o jsonb; pid uuid; sid uuid; kind text; ev text; src uuid;
  before_value jsonb := '{}'; after_value jsonb := '{}'; cause uuid; ancestors uuid[] := '{}'; headers jsonb;
  row_actor uuid; row_numo boolean := false; v_actor uuid; v_kind text; changed text[];
BEGIN
  n := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  o := CASE WHEN TG_OP='INSERT' THEN '{}' ELSE to_jsonb(OLD) END;
  IF TG_TABLE_NAME='issue_categories' THEN
    sid := (n->>'issue_id')::uuid; kind := 'issue'; ev := 'issue.updated';
    changed := ARRAY['category'];
    SELECT project_id INTO pid FROM public.issues WHERE id=sid FOR NO KEY UPDATE;
  ELSIF TG_TABLE_NAME='comments' THEN
    src := (n->>'id')::uuid;
    row_actor := (n->>'author_id')::uuid;
    row_numo := COALESCE((n->>'via_assistant')::boolean,false);
    IF n->>'issue_id' IS NOT NULL THEN
      sid := (n->>'issue_id')::uuid; kind := 'issue'; ev := 'issue.comment_added';
      SELECT project_id INTO pid FROM public.issues WHERE id=sid FOR NO KEY UPDATE;
    ELSIF n->>'objective_id' IS NOT NULL THEN
      sid := (n->>'objective_id')::uuid; kind := 'objective'; ev := 'objective.comment_added';
      SELECT project_id INTO pid FROM public.objectives WHERE id=sid AND deleted_at IS NULL;
    ELSIF n->>'feedback_post_id' IS NOT NULL THEN
      sid := (n->>'feedback_post_id')::uuid; kind := 'feedback'; ev := 'feedback.comment_added';
      SELECT project_id INTO pid FROM public.feedback_posts WHERE id=sid AND deleted_at IS NULL;
    ELSE RETURN NEW; END IF;
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
  IF row_numo THEN v_kind := 'numo'; END IF;
  -- Serialize mutations before allocating the event identity, not just consumers.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pid::text||kind||sid::text,677));
  IF kind='issue' THEN
    SELECT after_value || jsonb_build_object('status',i.status,'assignee',i.assignee_id,'priority',i.priority,'effort',i.effort,'deleted',i.deleted_at,
      'due_date',i.due_date,
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

-- The 20270109200103 version, plus page comments and mention notifications.
-- The pull request branch now takes the issue row lock before the advisory
-- lock, in the same order as the comment and category paths.
CREATE OR REPLACE FUNCTION public.capture_numo_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pid uuid; sid uuid; kind text; ev text; before_value jsonb := '{}'; after_value jsonb := '{}';
  headers jsonb; v_actor uuid; v_kind text; row_actor uuid; row_numo boolean := false; recipient uuid; src uuid;
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
    SELECT project_id INTO pid FROM public.issues WHERE id=NEW.issue_id AND deleted_at IS NULL FOR NO KEY UPDATE;
    sid := NEW.issue_id; kind := 'issue'; ev := 'issue.pull_request';
    after_value := jsonb_build_object('type',NEW.type);
    row_actor := NEW.actor_id; row_numo := NEW.via_assistant;
  ELSIF TG_TABLE_NAME='page_comments' THEN
    SELECT project_id, jsonb_build_object('parent_id',parent_id,'deleted',deleted_at) INTO pid, after_value
      FROM public.pages WHERE id=NEW.page_id AND deleted_at IS NULL;
    sid := NEW.page_id; kind := 'page'; ev := 'page.comment_added'; src := NEW.id;
    row_actor := NEW.author_id; row_numo := NEW.via_assistant;
  ELSIF TG_TABLE_NAME='notifications' THEN
    -- Mentions only: every other notification repeats a journaled event.
    IF NEW.type NOT IN ('mention','page_mention') THEN RETURN NEW; END IF;
    IF NEW.issue_id IS NOT NULL THEN sid := NEW.issue_id; kind := 'issue';
      SELECT project_id INTO pid FROM public.issues WHERE id=sid AND deleted_at IS NULL;
    ELSIF NEW.page_id IS NOT NULL THEN sid := NEW.page_id; kind := 'page';
      SELECT project_id INTO pid FROM public.pages WHERE id=sid AND deleted_at IS NULL;
    ELSIF NEW.objective_id IS NOT NULL THEN sid := NEW.objective_id; kind := 'objective';
      SELECT project_id INTO pid FROM public.objectives WHERE id=sid AND deleted_at IS NULL;
    ELSIF NEW.feedback_post_id IS NOT NULL THEN sid := NEW.feedback_post_id; kind := 'feedback';
      SELECT project_id INTO pid FROM public.feedback_posts WHERE id=sid AND deleted_at IS NULL;
    ELSE RETURN NEW; END IF;
    ev := 'mention.received'; src := NEW.comment_id; recipient := NEW.user_id;
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
  INSERT INTO public.routine_events(project_id,subject_type,subject_id,event,source_id,before_state,after_state,actor_id,actor_kind,recipient_id)
    VALUES(pid,kind,sid,ev,src,before_value,COALESCE(after_value,'{}'),v_actor,v_kind,recipient);
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.capture_numo_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER numo_page_comment_event AFTER INSERT ON public.page_comments
  FOR EACH ROW EXECUTE FUNCTION public.capture_numo_event();
CREATE TRIGGER numo_mention_event AFTER INSERT ON public.notifications
  FOR EACH ROW WHEN (NEW.type IN ('mention','page_mention')) EXECUTE FUNCTION public.capture_numo_event();

-- One routing per journal row: `p_batchable` is the application's filter
-- (lib/server/numo/event-batches.ts); a filtered row is only marked.
DROP FUNCTION public.route_numo_event(bigint);
CREATE FUNCTION public.route_numo_event(p_event_id bigint, p_batchable boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.routine_events%ROWTYPE; recipient uuid; touched integer := 0;
  b public.numo_event_batches%ROWTYPE; tries integer;
BEGIN
  SELECT * INTO e FROM public.routine_events WHERE id=p_event_id FOR UPDATE;
  IF e.id IS NULL OR e.numo_routed_at IS NOT NULL THEN RETURN 0; END IF;
  UPDATE public.routine_events SET numo_routed_at=now() WHERE id=e.id;
  IF NOT p_batchable OR e.actor_kind IN ('numo','maintenance') THEN RETURN 0; END IF;
  -- A fixed order, so two workers routing for shared members never lock
  -- their batches in opposite orders.
  FOR recipient IN
    SELECT r FROM public.numo_event_recipients(e.project_id,e.actor_id) r
      WHERE e.recipient_id IS NULL OR r=e.recipient_id ORDER BY r
  LOOP
    -- A claim can close the open batch between the conflict and the re-read:
    -- the next round then opens a fresh one.
    FOR tries IN 1..3 LOOP
      SELECT * INTO b FROM public.numo_event_batches WHERE user_id=recipient AND status='open' FOR UPDATE;
      IF b.id IS NULL THEN
        INSERT INTO public.numo_event_batches(user_id,opened_at,due_at,event_ids)
          VALUES(recipient,e.created_at,e.created_at+interval '5 minutes',ARRAY[e.id])
          ON CONFLICT (user_id) WHERE status='open' DO NOTHING;
        IF FOUND THEN touched := touched+1; EXIT; END IF;
        CONTINUE;
      END IF;
      IF cardinality(b.event_ids)>=200 THEN EXIT; END IF;
      IF e.event='page.updated' AND EXISTS(SELECT 1 FROM public.routine_events o WHERE o.id=ANY(b.event_ids)
        AND o.event='page.updated' AND o.subject_id=e.subject_id) THEN EXIT; END IF;
      UPDATE public.numo_event_batches SET event_ids=event_ids||e.id,
        due_at=least(greatest(due_at,e.created_at+interval '5 minutes'),opened_at+interval '10 minutes')
        WHERE id=b.id;
      touched := touched+1;
      EXIT;
    END LOOP;
  END LOOP;
  RETURN touched;
END; $$;
REVOKE ALL ON FUNCTION public.route_numo_event(bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.route_numo_event(bigint,boolean) TO service_role;

-- The 20270109200103 version, plus: a batch handed out three times is closed
-- as abandoned rather than handed out again.
CREATE OR REPLACE FUNCTION public.claim_numo_event_batches(p_limit integer DEFAULT 20)
RETURNS SETOF public.numo_event_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  DELETE FROM public.numo_event_batches WHERE status='done' AND closed_at<now()-interval '7 days';
  UPDATE public.numo_event_batches SET status='done',closed_at=now(),error_code='abandoned'
    WHERE status='processing' AND claimed_at<now()-interval '15 minutes' AND attempts>=3;
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
