-- Preference writes are tested in every branch protection state without retained mutations.
BEGIN;
INSERT INTO auth.users(id) VALUES('67630000-0000-4000-8000-000000000001');
DELETE FROM public.agent_branch_prefix_scope;
DO $$ DECLARE r public.user_agent_preferences;
BEGIN
 IF has_function_privilege('authenticated','public.upsert_agent_preferences_partial(uuid,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.upsert_agent_preferences_partial(uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Partial preferences RPC is not service-only'; END IF;
 r:=public.upsert_agent_preferences_partial('67630000-0000-4000-8000-000000000001',
  '{"default_engine":"codex","branch_prefix":"team/","default_model":"first","sandbox_size":"performance"}');
 r:=public.upsert_agent_preferences_partial(r.user_id,'{"default_model":"second"}');
 IF r.default_engine<>'codex' OR r.branch_prefix<>'team/' OR r.default_model<>'second' OR r.sandbox_size<>'performance' THEN
  RAISE EXCEPTION 'Partial API preference write reset the native selection'; END IF;
 r:=public.upsert_agent_preferences_partial(r.user_id,'{"default_engine":"claude_code"}');
 IF r.default_model<>'second' OR r.branch_prefix<>'team/' THEN RAISE EXCEPTION 'Harness selection reset API preferences'; END IF;
 BEGIN
  PERFORM public.upsert_agent_preferences_partial(r.user_id,'{"branch_prefix":"mdye3:{\"format\":3,\"keyVersion\":1}"}');
  RAISE EXCEPTION 'Partial preferences accepted a forged envelope';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.upsert_agent_preferences_partial(r.user_id,'{"branch_prefix":null}');
  RAISE EXCEPTION 'Partial preferences accepted a null branch';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 r:=public.upsert_agent_preferences_protected(r.user_id,'{}','mdye3:{"format":3,"keyVersion":1}',true);
 r:=public.upsert_agent_preferences_partial(r.user_id,'{"default_model":"third"}');
 IF r.default_engine<>'claude_code' OR left(r.branch_prefix,6)<>'mdye3:' THEN
  RAISE EXCEPTION 'Metadata-only write downgraded an already protected prefix'; END IF;
 INSERT INTO public.agent_branch_prefix_scope(id) VALUES(true);
 BEGIN
  PERFORM public.upsert_agent_preferences_partial(r.user_id,'{"default_engine":"opencode"}');
  RAISE EXCEPTION 'Partial preferences bypassed branch protection';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'agent_branch_prefix_requires_encryption' THEN RAISE; END IF; END;
 r:=public.upsert_agent_preferences_protected(r.user_id,'{"default_model":"fourth"}','mdye3:{"format":3,"keyVersion":1}',false);
 IF r.default_engine<>'claude_code' THEN RAISE EXCEPTION 'Protected metadata write reset native selection'; END IF;
END; $$;
ROLLBACK;
