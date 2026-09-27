-- Run on an isolated schema-only database after migration 20270107520000.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  duplicate_id uuid := gen_random_uuid();
  canonical_id uuid := gen_random_uuid();
  child_id uuid := gen_random_uuid();
  voter_a uuid := gen_random_uuid();
  voter_b uuid := gen_random_uuid();
  merged_event_id uuid;
  legacy_id uuid := gen_random_uuid();
  invalid_id uuid := gen_random_uuid();
  legacy jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner_id);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project_id,owner_id,'Merge fixture','MERGE');
  INSERT INTO public.feedback_users(id,project_id,email,pseudonym,verified_via)
    VALUES(voter_a,project_id,'a@example.test','A','email'),
      (voter_b,project_id,'b@example.test','B','email');
  INSERT INTO public.feedback_posts(id,project_id,title,submitted_title,source)
    VALUES(duplicate_id,project_id,'Duplicate','Duplicate','internal'),
      (canonical_id,project_id,'Canonical','Canonical','internal'),
      (child_id,project_id,'Child','Child','internal');
  UPDATE public.feedback_posts SET merged_into_id=duplicate_id WHERE id=child_id;
  INSERT INTO public.feedback_votes(post_id,user_id)
    VALUES(duplicate_id,voter_a),(duplicate_id,voter_b),
      (canonical_id,voter_a);

  merged_event_id := public.merge_feedback_posts(duplicate_id,canonical_id,'team',owner_id);
  IF (SELECT payload FROM public.feedback_merge_events WHERE id=merged_event_id)
      <> '{}'::jsonb THEN RAISE EXCEPTION 'merge retained undo JSON'; END IF;
  IF (SELECT count(*) FROM public.feedback_merge_event_links
      WHERE event_id=merged_event_id) <> 3 THEN
    RAISE EXCEPTION 'merge relation count changed';
  END IF;
  IF (SELECT merged_into_id FROM public.feedback_posts WHERE id=child_id)
      IS DISTINCT FROM canonical_id THEN
    RAISE EXCEPTION 'merge chain was not repointed';
  END IF;
  PERFORM public.undo_feedback_merge(merged_event_id,owner_id);
  IF (SELECT merged_into_id FROM public.feedback_posts WHERE id=child_id)
      IS DISTINCT FROM duplicate_id OR
      (SELECT count(*) FROM public.feedback_votes WHERE post_id=duplicate_id) <> 2 THEN
    RAISE EXCEPTION 'relational undo lost its vote or chain state';
  END IF;

  BEGIN
    INSERT INTO public.feedback_merge_events(project_id,kind,dup_id,
      canonical_id,performed_by,payload)
      VALUES(project_id,'post',duplicate_id,canonical_id,'team',
        '{"secret":"obsolete writer"}'::jsonb);
    RAISE EXCEPTION 'obsolete merge writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='obsolete merge writer was accepted' THEN RAISE; END IF;
  END;

  legacy := jsonb_build_object('moved_vote_user_ids',jsonb_build_array(voter_b),
    'dropped_vote_user_ids',jsonb_build_array(voter_a),
    'repointed_chain_ids',jsonb_build_array(child_id),
    'private_extra','private legacy content');
  PERFORM set_config('session_replication_role','replica',true);
  INSERT INTO public.feedback_merge_events(id,project_id,kind,dup_id,
    canonical_id,performed_by,payload)
    VALUES(legacy_id,project_id,'post',duplicate_id,canonical_id,'team',legacy);
  PERFORM set_config('session_replication_role','origin',true);
  IF public.migrate_feedback_merge_payload(legacy_id,'{}'::jsonb) THEN
    RAISE EXCEPTION 'stale merge CAS was accepted';
  END IF;
  IF NOT public.migrate_feedback_merge_payload(legacy_id,legacy) THEN
    RAISE EXCEPTION 'legacy merge CAS was refused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.feedback_merge_events
      WHERE id=legacy_id AND payload<>'{}'::jsonb) OR
      (SELECT count(*) FROM public.feedback_merge_event_links
        WHERE event_id=legacy_id) <> 3 THEN
    RAISE EXCEPTION 'historical merge content remained clear';
  END IF;
  IF public.mark_feedback_merge_payload_attempt(legacy_id,legacy) THEN
    RAISE EXCEPTION 'stale attempt CAS was accepted';
  END IF;
  PERFORM set_config('session_replication_role','replica',true);
  INSERT INTO public.feedback_merge_events(id,project_id,kind,dup_id,
    canonical_id,performed_by,payload)
    VALUES(invalid_id,project_id,'post',duplicate_id,canonical_id,'team',
      '{"moved_vote_user_ids":"invalid"}'::jsonb);
  PERFORM set_config('session_replication_role','origin',true);
  BEGIN
    PERFORM public.migrate_feedback_merge_payload(invalid_id,
      '{"moved_vote_user_ids":"invalid"}'::jsonb);
    RAISE EXCEPTION 'invalid legacy array was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM='invalid legacy array was accepted' THEN RAISE; END IF;
  END;
  IF NOT public.mark_feedback_merge_payload_attempt(invalid_id,
      '{"moved_vote_user_ids":"invalid"}'::jsonb) THEN
    RAISE EXCEPTION 'failed-row queue attempt was not recorded';
  END IF;
  IF (SELECT payload_attempted_at FROM public.feedback_merge_events
      WHERE id=invalid_id) IS NULL OR
      (SELECT payload_checked_at FROM public.feedback_merge_events
        WHERE id=invalid_id) IS NOT NULL THEN
    RAISE EXCEPTION 'failed merge attempt was marked as verified';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_feedback_merge_payload(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'client can migrate merge payloads';
  END IF;
END $$;
ROLLBACK;
