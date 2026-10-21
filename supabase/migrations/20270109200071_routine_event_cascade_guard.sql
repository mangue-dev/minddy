-- MIN-767: deleting an account failed for every owner of a project with
-- issues. Erasing auth.users deletes the owned projects and, in the same
-- statement, sets author and assignee columns of their issues to NULL. The
-- issue trigger then re-read a row the project cascade had already removed,
-- inserted a NULL after_state and aborted the whole deletion. The journal now
-- skips subjects whose issue or project no longer exists.
BEGIN;
CREATE OR REPLACE FUNCTION public.capture_routine_event() RETURNS trigger
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
  -- Serialize mutations before allocating the event identity, not just consumers.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pid::text||kind||sid::text,677));
  IF kind='issue' THEN
    SELECT after_value || jsonb_build_object('status',i.status,'assignee',i.assignee_id,'priority',i.priority,'effort',i.effort,'deleted',i.deleted_at,
      'category',COALESCE((SELECT jsonb_agg(c.category_id ORDER BY c.category_id) FROM public.issue_categories c WHERE c.issue_id=sid),'[]'::jsonb))
      INTO after_value FROM public.issues i WHERE i.id=sid;
    -- The issue was deleted later in the same statement: it has no state left.
    IF NOT FOUND THEN RETURN COALESCE(NEW,OLD); END IF;
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
COMMIT;
