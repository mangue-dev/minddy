\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  other_project uuid:=gen_random_uuid();
  conversation uuid:=gen_random_uuid(); turn_id uuid:=gen_random_uuid();
  other_turn uuid:=gen_random_uuid(); run_a uuid:=gen_random_uuid();
  run_b uuid:=gen_random_uuid(); wrong_run uuid:=gen_random_uuid();
  event_id uuid:=gen_random_uuid(); old_payload jsonb; wrapped jsonb;
  brief jsonb; rejected boolean; marked boolean; bad_event uuid:=gen_random_uuid();
  malformed_event uuid:=gen_random_uuid(); unbound_run uuid:=gen_random_uuid();
  unbound_event uuid:=gen_random_uuid(); unbound_payload jsonb;
  missing_event uuid:=gen_random_uuid(); missing_payload jsonb;
  missing_wrapped jsonb; clear_checkpoint jsonb; next_checkpoint jsonb;
  legacy_v1 jsonb; legacy_v2 jsonb; malformed jsonb; missing_field text;
  probe_run uuid:=gen_random_uuid(); probe_event uuid:=gen_random_uuid();
  probe_turn uuid:=gen_random_uuid(); probe_payload jsonb;
  probe_checkpoint jsonb; probe_next jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Historical worker regression','HWR'),
      (other_project,actor,'Other worker regression','OWR');
  INSERT INTO public.conversations(id,user_id,project_id)
    VALUES(conversation,actor,project);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status)
    VALUES(turn_id,conversation,actor,gen_random_uuid(),gen_random_uuid(),'queued'),
      (other_turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),'queued'),
      (probe_turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),'queued');
  brief:=jsonb_build_object('version',1,'correlation',jsonb_build_object(
    'parentConversationId',conversation,'parentTurnId',turn_id,
    'toolCallId','call-a'),'targetRepository',jsonb_build_object('projectId',project),
    'objective','Test historical worker migration','sourceReferences','[]'::jsonb,
    'constraints','[]'::jsonb,'authorizedWork','["test"]'::jsonb,
    'expectedOutput','["test"]'::jsonb);
  INSERT INTO public.agent_runs(id,project_id,created_by,parent_numo_turn_id,
    parent_numo_conversation_id,parent_numo_tool_call_id,delegation_brief)
    VALUES(run_a,project,actor,turn_id,conversation,'call-a',brief),
      (run_b,project,actor,turn_id,conversation,'call-b',jsonb_set(brief,
        '{correlation,toolCallId}','"call-b"')),
      (wrong_run,project,actor,other_turn,conversation,'call-wrong',
        jsonb_set(jsonb_set(brief,'{correlation,parentTurnId}',
          to_jsonb(other_turn)),'{correlation,toolCallId}','"call-wrong"'));
  UPDATE public.numo_assistant_turns SET active_run_id=run_a,
    status='waiting_work' WHERE id=turn_id;
  old_payload:=jsonb_build_object('run_id',run_a,'result','Private result');
  INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
    VALUES(event_id,turn_id,1,'worker_completed',old_payload);
  UPDATE public.numo_assistant_turns SET checkpoint=jsonb_build_object(
    'phase','worker_result','worker_event',jsonb_build_object(
      'type','worker_completed','payload',old_payload)) WHERE id=turn_id;
  UPDATE public.numo_assistant_turns SET active_run_id=run_b WHERE id=turn_id;
  INSERT INTO public.agent_runs(id,project_id,created_by)
    VALUES(probe_run,project,actor);
  probe_payload:=jsonb_build_object('run_id',probe_run,'result','Reviewed scope probe');
  ALTER TABLE public.numo_turn_events DISABLE TRIGGER numo_worker_event_payload_guard;
  INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
    VALUES(probe_event,turn_id,6,'worker_completed',probe_payload);
  ALTER TABLE public.numo_turn_events ENABLE TRIGGER numo_worker_event_payload_guard;
  IF NOT public.register_numo_worker_legacy_binding('event',probe_event,
      probe_run,'MIN-591/project-scope-probe') THEN
    RAISE EXCEPTION 'Preactivation run binding was not registered';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.numo_turn_events SET payload=jsonb_set(payload,
      '{result}','"Edited after review"') WHERE id=probe_event;
  EXCEPTION WHEN check_violation THEN
    rejected:=SQLERRM='numo_worker_reviewed_event_immutable'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Reviewed clear event was mutable'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.agent_runs SET project_id=other_project WHERE id=probe_run;
  EXCEPTION WHEN check_violation THEN
    rejected:=SQLERRM='numo_worker_bound_run_immutable'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Reviewed run project was mutable'; END IF;
  probe_checkpoint:=jsonb_build_object('worker_event',jsonb_build_object(
    'type','worker_completed','payload',probe_payload));
  UPDATE public.numo_assistant_turns SET checkpoint=probe_checkpoint
    WHERE id=probe_turn;
  IF NOT public.register_numo_worker_legacy_binding('checkpoint',probe_turn,
      probe_run,'MIN-591/checkpoint-probe-v1') THEN
    RAISE EXCEPTION 'Preactivation checkpoint binding was not registered';
  END IF;
  probe_next:=jsonb_set(probe_checkpoint,'{worker_event,payload,result}',
    '"Revised reviewed probe"');
  UPDATE public.numo_assistant_turns SET checkpoint=probe_next
    WHERE id=probe_turn;
  IF public.lookup_numo_worker_legacy_binding('checkpoint',probe_turn)
      IS NOT NULL OR
      NOT public.register_numo_worker_legacy_binding('checkpoint',probe_turn,
        probe_run,'MIN-591/checkpoint-probe-v2') THEN
    RAISE EXCEPTION 'Checkpoint revision did not invalidate old review';
  END IF;
  UPDATE public.numo_assistant_turns SET checkpoint=jsonb_set(probe_next,
    '{worker_event,type}','"worker_failed"') WHERE id=probe_turn;
  IF public.lookup_numo_worker_legacy_binding('checkpoint',probe_turn)
      IS NOT NULL THEN
    RAISE EXCEPTION 'Checkpoint type change retained reviewed binding';
  END IF;
  DELETE FROM public.numo_assistant_turns WHERE id=probe_turn;
  DELETE FROM public.numo_turn_events WHERE id=probe_event;
  DELETE FROM public.agent_runs WHERE id=probe_run;
  wrapped:=jsonb_build_object('encrypted_worker_payload',
    '{"format":3,"keyVersion":1}','encryption_version',1,'project_id',project,
    'event_id',event_id,'run_id',run_a);
  FOREACH missing_field IN ARRAY ARRAY['encryption_version','event_id',
      'run_id','format','keyVersion'] LOOP
    IF missing_field IN ('encryption_version','event_id','run_id') THEN
      malformed:=wrapped - missing_field;
    ELSE
      malformed:=jsonb_set(wrapped,'{encrypted_worker_payload}',
        to_jsonb(((wrapped->>'encrypted_worker_payload')::jsonb - missing_field)::text));
    END IF;
    rejected:=false;
    BEGIN
      PERFORM public.migrate_numo_worker_event(event_id,old_payload,malformed);
    EXCEPTION WHEN check_violation THEN rejected:=true; END;
    IF NOT rejected OR (SELECT payload_encryption_checked_at
        FROM public.numo_turn_events WHERE id=event_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Missing worker envelope field was verified before scope activation';
    END IF;
  END LOOP;
  FOREACH missing_field IN ARRAY ARRAY['event_id','run_id'] LOOP
    rejected:=false;
    BEGIN
      PERFORM public.migrate_numo_worker_event(event_id,old_payload,
        jsonb_set(wrapped,ARRAY[missing_field],'null'::jsonb));
    EXCEPTION WHEN check_violation THEN rejected:=true; END;
    IF NOT rejected OR (SELECT payload_encryption_checked_at
        FROM public.numo_turn_events WHERE id=event_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Null worker binding field was verified before scope activation';
    END IF;
  END LOOP;
  INSERT INTO public.agent_result_encryption_scopes(project_id) VALUES(project);
  IF NOT public.migrate_numo_worker_event(event_id,old_payload,wrapped) OR
      public.migrate_numo_worker_event(event_id,old_payload,wrapped) THEN
    RAISE EXCEPTION 'Historical worker event CAS or migration failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_turn_events WHERE id=event_id AND
      (payload IS DISTINCT FROM wrapped OR payload::text LIKE '%Private result%')) OR
     EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=turn_id AND
       (checkpoint #> '{worker_event,payload}' IS DISTINCT FROM wrapped OR
        checkpoint::text LIKE '%Private result%')) THEN
    RAISE EXCEPTION 'Historical worker event or checkpoint remains clear';
  END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
      VALUES(bad_event,turn_id,2,'worker_completed',jsonb_build_object(
        'run_id',run_a,'result','Late unprotected result'));
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'New stale-run event accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.numo_turn_events SET payload=wrapped || jsonb_build_object(
      'run_id',wrong_run) WHERE id=event_id;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Historical run binding changed'; END IF;
  INSERT INTO public.agent_runs(id,project_id,created_by)
    VALUES(unbound_run,project,actor);
  unbound_payload:=jsonb_build_object('run_id',unbound_run,'result','Unbound result');
  ALTER TABLE public.numo_turn_events DISABLE TRIGGER numo_worker_event_payload_guard;
  INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
    VALUES(unbound_event,turn_id,4,'worker_completed',unbound_payload);
  ALTER TABLE public.numo_turn_events ENABLE TRIGGER numo_worker_event_payload_guard;
  ALTER TABLE public.numo_assistant_turns DISABLE TRIGGER numo_worker_checkpoint_guard;
  UPDATE public.numo_assistant_turns SET checkpoint=jsonb_build_object(
    'worker_event',jsonb_build_object('type','worker_completed',
      'payload',unbound_payload)) WHERE id=turn_id;
  ALTER TABLE public.numo_assistant_turns ENABLE TRIGGER numo_worker_checkpoint_guard;
  rejected:=false;
  BEGIN
    PERFORM public.migrate_numo_worker_event(unbound_event,unbound_payload,
      jsonb_build_object('encrypted_worker_payload',
        '{"format":3,"keyVersion":1}','encryption_version',1,
        'project_id',project,'event_id',unbound_event,'run_id',unbound_run));
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Unbound historical run accepted';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.migrate_numo_worker_event(unbound_event,unbound_payload,NULL);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Clear event was marked verified'; END IF;
  IF NOT public.register_numo_worker_legacy_binding('event',unbound_event,
      unbound_run,'MIN-591/historical-event') THEN
    RAISE EXCEPTION 'Reviewed historical binding was not registered';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.agent_runs SET parent_numo_turn_id=turn_id,
      parent_numo_conversation_id=conversation WHERE id=unbound_run;
  EXCEPTION WHEN check_violation THEN
    rejected:=SQLERRM='numo_worker_bound_run_immutable'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Reviewed run parent was mutable'; END IF;
  legacy_v1:=jsonb_build_object('encrypted_worker_payload',
    '{"format":3,"keyVersion":1}','encryption_version',1,
    'project_id',project,'event_id',unbound_event,'run_id',unbound_run);
  IF NOT public.migrate_numo_worker_event(unbound_event,unbound_payload,
      legacy_v1) THEN
    RAISE EXCEPTION 'Reviewed historical event did not migrate';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=turn_id AND
      checkpoint #>> '{worker_event,payload,event_id}' IS DISTINCT FROM
        unbound_event::text) THEN
    RAISE EXCEPTION 'Reviewed historical checkpoint did not migrate';
  END IF;
  legacy_v2:=jsonb_build_object('encrypted_worker_payload',
    '{"format":3,"keyVersion":2}','encryption_version',2,
    'project_id',project,'event_id',unbound_event,'run_id',unbound_run);
  marked:=public.migrate_numo_worker_event(unbound_event,legacy_v1,legacy_v2);
  IF NOT marked OR EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=turn_id AND
        checkpoint #> '{worker_event,payload}' IS DISTINCT FROM legacy_v2) THEN
    RAISE EXCEPTION 'Reviewed historical binding did not survive rotation';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.numo_worker_legacy_bindings SET run_id=run_b
      WHERE kind='event' AND target_id=unbound_event;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Reviewed binding was mutable'; END IF;
  missing_payload:=jsonb_build_object('result','Pre-parent result without run');
  ALTER TABLE public.numo_turn_events DISABLE TRIGGER numo_worker_event_payload_guard;
  INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
    VALUES(missing_event,turn_id,5,'worker_completed',missing_payload);
  ALTER TABLE public.numo_turn_events ENABLE TRIGGER numo_worker_event_payload_guard;
  missing_wrapped:=jsonb_build_object('encrypted_worker_payload',
    '{"format":3,"keyVersion":1}','encryption_version',1,
    'project_id',project,'event_id',missing_event,'run_id',unbound_run);
  rejected:=false;
  BEGIN
    PERFORM public.migrate_numo_worker_event(missing_event,missing_payload,
      missing_wrapped);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Missing run was inferred without review'; END IF;
  IF NOT public.register_numo_worker_legacy_binding('event',missing_event,
      unbound_run,'MIN-591/missing-run-event') OR
      NOT public.migrate_numo_worker_event(missing_event,missing_payload,
        missing_wrapped) THEN
    RAISE EXCEPTION 'Reviewed missing-run event did not migrate';
  END IF;
  clear_checkpoint:=jsonb_build_object('worker_event',jsonb_build_object(
    'type','worker_completed','payload',jsonb_build_object(
      'run_id',wrong_run,'result','Clear checkpoint')));
  ALTER TABLE public.numo_assistant_turns DISABLE TRIGGER numo_worker_checkpoint_guard;
  UPDATE public.numo_assistant_turns SET checkpoint=clear_checkpoint
    WHERE id=other_turn;
  ALTER TABLE public.numo_assistant_turns ENABLE TRIGGER numo_worker_checkpoint_guard;
  rejected:=false;
  BEGIN
    PERFORM public.migrate_numo_worker_checkpoint(other_turn,clear_checkpoint,NULL);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Clear checkpoint was marked verified'; END IF;
  marked:=public.mark_numo_worker_payload_attempt('checkpoint',other_turn,
    clear_checkpoint);
  IF NOT marked OR EXISTS (SELECT 1 FROM public.numo_assistant_turns
        WHERE id=other_turn AND
          (worker_checkpoint_encryption_attempted_at IS NULL OR
           worker_checkpoint_encryption_checked_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Clear checkpoint did not advance behind the queue';
  END IF;
  IF NOT public.register_numo_worker_legacy_binding('checkpoint',other_turn,
      wrong_run,'MIN-591/checkpoint-v1') THEN
    RAISE EXCEPTION 'First checkpoint review was not recorded';
  END IF;
  next_checkpoint:=jsonb_set(clear_checkpoint,
    '{worker_event,payload,result}','"Changed clear checkpoint"');
  ALTER TABLE public.numo_assistant_turns DISABLE TRIGGER numo_worker_checkpoint_guard;
  UPDATE public.numo_assistant_turns SET checkpoint=next_checkpoint,
    worker_checkpoint_revision=gen_random_uuid()
    WHERE id=other_turn;
  ALTER TABLE public.numo_assistant_turns ENABLE TRIGGER numo_worker_checkpoint_guard;
  marked:=public.register_numo_worker_legacy_binding('checkpoint',other_turn,
    wrong_run,'MIN-591/checkpoint-v2');
  IF NOT marked OR (SELECT count(*) FROM public.numo_worker_legacy_bindings
        WHERE kind='checkpoint' AND target_id=other_turn) <> 2 OR
      public.lookup_numo_worker_legacy_binding('checkpoint',other_turn)->>'run_id'
        IS DISTINCT FROM wrong_run::text THEN
    RAISE EXCEPTION 'Revised checkpoint lost immutable review history';
  END IF;
  IF public.mark_numo_worker_payload_attempt('event',event_id,old_payload) OR
      NOT public.mark_numo_worker_payload_attempt('event',event_id,wrapped) THEN
    RAISE EXCEPTION 'Numo attempt marker lost CAS';
  END IF;
  IF (SELECT payload_encryption_checked_at FROM public.numo_turn_events
      WHERE id=event_id) IS NULL THEN
    RAISE EXCEPTION 'Numo verification timestamp was lost';
  END IF;
  ALTER TABLE public.numo_turn_events DISABLE TRIGGER numo_worker_event_payload_guard;
  INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
    VALUES(malformed_event,turn_id,3,'worker_completed',
      jsonb_build_object('run_id',gen_random_uuid(),'result','Orphan result'));
  ALTER TABLE public.numo_turn_events ENABLE TRIGGER numo_worker_event_payload_guard;
  marked:=public.mark_numo_worker_payload_attempt('event',malformed_event,
    jsonb_build_object('run_id',gen_random_uuid()),true);
  IF NOT marked OR
      (SELECT payload_encryption_attempted_at FROM public.numo_turn_events
        WHERE id=malformed_event) IS NULL OR
      (SELECT payload_encryption_checked_at FROM public.numo_turn_events
        WHERE id=malformed_event) IS NOT NULL THEN
    RAISE EXCEPTION 'Malformed Numo event still blocks the queue';
  END IF;
  DELETE FROM public.numo_assistant_turns WHERE id=other_turn;
  IF EXISTS (SELECT 1 FROM public.numo_worker_legacy_bindings
      WHERE kind='checkpoint' AND target_id=other_turn) THEN
    RAISE EXCEPTION 'Deleted turn retained reviewed checkpoint bindings';
  END IF;
  DELETE FROM public.numo_turn_events WHERE id=missing_event;
  IF EXISTS (SELECT 1 FROM public.numo_worker_legacy_bindings
      WHERE kind='event' AND target_id=missing_event) THEN
    RAISE EXCEPTION 'Pruned event retained reviewed run binding';
  END IF;
  UPDATE public.numo_assistant_turns SET status='queued',active_run_id=NULL
    WHERE id=turn_id;
  DELETE FROM public.projects WHERE id=project;
  IF EXISTS (SELECT 1 FROM public.numo_worker_legacy_bindings
      WHERE project_id=project) THEN
    RAISE EXCEPTION 'Deleted project retained reviewed worker bindings';
  END IF;
END;
$test$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  bad_project uuid:=gen_random_uuid(); good_project uuid:=gen_random_uuid();
  board uuid:=gen_random_uuid(); bad_user uuid:=gen_random_uuid();
  good_user uuid:=gen_random_uuid(); bad_otp uuid:=gen_random_uuid();
  good_otp uuid:=gen_random_uuid(); bad_board uuid:=gen_random_uuid();
  good_board uuid:=gen_random_uuid(); bad_merge uuid:=gen_random_uuid();
  good_merge uuid:=gen_random_uuid(); marked boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Feedback queue regression','FQR'),
      (bad_project,actor,'Bad SSO queue regression','FBQ'),
      (good_project,actor,'Good SSO queue regression','FGQ');
  INSERT INTO public.feedback_boards(id,project_id,token,sso_secret)
    VALUES(board,project,'queue-root',NULL),
      (good_board,good_project,'queue-good','sso_legacy_secret');
  INSERT INTO public.feedback_users(id,project_id,email,pseudonym,verified_via)
    VALUES(good_user,project,'good@example.test','Good','email');
  INSERT INTO public.feedback_otp_codes(id,board_id,email,code_hash,expires_at)
    VALUES(good_otp,board,'good@example.test','good-code',now()+interval '5 minutes');
  INSERT INTO public.feedback_boards(id,project_id,token,sso_secret)
    VALUES(bad_board,bad_project,'queue-bad','mdyb3:1:QQ');
  INSERT INTO public.feedback_users(id,project_id,email,email_lookup,pseudonym,verified_via)
    VALUES(bad_user,project,'mdyf3:1:QQ',repeat('a',64),'Bad','email');
  INSERT INTO public.feedback_otp_codes(id,board_id,email,email_lookup,code_hash,expires_at)
    VALUES(bad_otp,board,'mdyf3:1:QQ',repeat('b',64),'bad-code',
      now()+interval '5 minutes');
  IF NOT public.mark_feedback_identity_attempt('user',bad_user,'mdyf3:1:QQ') OR
      NOT public.mark_feedback_identity_attempt('otp',bad_otp,'mdyf3:1:QQ') OR
      NOT public.mark_feedback_sso_attempt(bad_board,'mdyb3:1:QQ') THEN
    RAISE EXCEPTION 'Feedback failed attempts were not recorded';
  END IF;
  IF (SELECT content_encryption_checked_at FROM public.feedback_users
      WHERE id=bad_user) IS NOT NULL OR
     (SELECT content_encryption_checked_at FROM public.feedback_otp_codes
      WHERE id=bad_otp) IS NOT NULL OR
     (SELECT sso_encryption_checked_at FROM public.feedback_boards
      WHERE id=bad_board) IS NOT NULL THEN
    RAISE EXCEPTION 'Failed feedback rows were falsely verified';
  END IF;
  IF (SELECT id FROM public.feedback_users
      WHERE id IN (bad_user,good_user)
      ORDER BY content_encryption_attempted_at NULLS FIRST,id LIMIT 1)
        IS DISTINCT FROM good_user OR
     (SELECT id FROM public.feedback_otp_codes
      WHERE id IN (bad_otp,good_otp)
      ORDER BY content_encryption_attempted_at NULLS FIRST,id LIMIT 1)
        IS DISTINCT FROM good_otp OR
     (SELECT id FROM public.feedback_boards
      WHERE id IN (bad_board,good_board)
      ORDER BY sso_encryption_attempted_at NULLS FIRST,id LIMIT 1)
        IS DISTINCT FROM good_board THEN
    RAISE EXCEPTION 'Failed feedback rows still block the next page';
  END IF;
  IF public.mark_feedback_identity_attempt('user',bad_user,'stale@example.test') OR
      public.mark_feedback_identity_attempt('otp',bad_otp,'stale@example.test') OR
      public.mark_feedback_sso_attempt(bad_board,'stale-secret') THEN
    RAISE EXCEPTION 'Feedback attempt marker lost CAS';
  END IF;
  ALTER TABLE public.feedback_merge_events DISABLE TRIGGER feedback_merge_payload_guard;
  INSERT INTO public.feedback_merge_events(id,project_id,kind,dup_id,
    canonical_id,performed_by,payload)
    VALUES(bad_merge,project,'post',gen_random_uuid(),gen_random_uuid(),
      'team','{"moved_vote_user_ids":"malformed"}'::jsonb),
      (good_merge,project,'post',gen_random_uuid(),gen_random_uuid(),
        'team','{"moved_vote_user_ids":[]}'::jsonb);
  ALTER TABLE public.feedback_merge_events ENABLE TRIGGER feedback_merge_payload_guard;
  marked:=public.mark_feedback_merge_payload_attempt(bad_merge,
    '{"moved_vote_user_ids":"malformed"}'::jsonb);
  IF NOT marked OR
      (SELECT payload_checked_at FROM public.feedback_merge_events
        WHERE id=bad_merge) IS NOT NULL OR
      (SELECT id FROM public.feedback_merge_events
        WHERE id IN (bad_merge,good_merge)
        ORDER BY payload_attempted_at NULLS FIRST,id LIMIT 1)
          IS DISTINCT FROM good_merge OR
      NOT public.mark_feedback_merge_payload_attempt(bad_merge,
        '{}'::jsonb,true) THEN
    RAISE EXCEPTION 'Feedback merge failure or conflict blocks later rows';
  END IF;
END;
$test$;
ROLLBACK;
