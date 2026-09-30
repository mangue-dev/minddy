-- Run on an isolated clone before migration 20270108100000. Replace the
-- migration marker with that migration, preserving its transaction boundary.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $$
DECLARE actor uuid:=gen_random_uuid(); conversation uuid:=gen_random_uuid();
  turn_id uuid:=gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.conversations(id,user_id) VALUES(conversation,actor);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,checkpoint) VALUES(turn_id,conversation,actor,
    gen_random_uuid(),gen_random_uuid(),
    '{"phase":"model","messages":["MIN591_PRIVATE_CHECKPOINT"]}'::jsonb);
  PERFORM public.mark_numo_tool_content_attempt('checkpoint',turn_id,NULL);
  IF NOT EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=turn_id
      AND tool_checkpoint_checked_at IS NOT NULL AND
      checkpoint::text LIKE '%MIN591_PRIVATE_CHECKPOINT%') THEN
    RAISE EXCEPTION 'The false verified state was not reproduced';
  END IF;
  INSERT INTO public.numo_tool_content_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  PERFORM set_config('min591.legacy_turn',turn_id::text,false);
END $$;
-- APPLY_NUMO_ATTEMPT_AND_COMMENT_REALTIME_MIGRATION_HERE
DO $$
DECLARE turn_id uuid:=current_setting('min591.legacy_turn')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=turn_id
      AND tool_checkpoint_checked_at IS NULL AND
      tool_checkpoint_attempted_at IS NULL AND
      checkpoint::text LIKE '%MIN591_PRIVATE_CHECKPOINT%') THEN
    RAISE EXCEPTION 'The old false verification was not invalidated';
  END IF;
  BEGIN
    PERFORM public.mark_numo_tool_content_attempt('checkpoint',turn_id,NULL);
    RAISE EXCEPTION 'The obsolete marker was still usable';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM='The obsolete marker was still usable' THEN RAISE; END IF;
  END;
END $$;
