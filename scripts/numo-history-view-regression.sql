-- MIN-591 schema rehearsal: rebuilding views must preserve their access boundary.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  actor uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  own_conversation uuid := gen_random_uuid();
  other_conversation uuid := gen_random_uuid();
  view_name text;
BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Run this rehearsal only in an isolated minddy_min591_* database';
  END IF;
  FOREACH view_name IN ARRAY ARRAY['numo_work', 'numo_conversation_history', 'numo_user_conversation_history'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = view_name AND column_name = 'detail_href') THEN
      RAISE EXCEPTION 'obsolete history URL remains in %', view_name;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = ('public.' || view_name)::regclass
      AND reloptions @> ARRAY['security_invoker=true']) THEN
      RAISE EXCEPTION 'history view lost security_invoker: %', view_name;
    END IF;
    IF has_table_privilege('anon', 'public.' || view_name, 'SELECT') THEN
      RAISE EXCEPTION 'history view became anonymous: %', view_name;
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.' || view_name, 'SELECT') THEN
      RAISE EXCEPTION 'history view lost authenticated access: %', view_name;
    END IF;
  END LOOP;
  INSERT INTO auth.users(id) VALUES(actor), (other_actor);
  INSERT INTO public.conversations(id, user_id, title)
    VALUES(own_conversation, actor, 'Own private conversation'),
      (other_conversation, other_actor, 'Other private conversation');
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.numo_conversation_history) <> 1
      OR (SELECT count(*) FROM public.numo_user_conversation_history) <> 1 THEN
    RAISE EXCEPTION 'rebuilt history bypassed source RLS or lost the visible conversation';
  END IF;
  BEGIN
    INSERT INTO public.assistant_active_conversation(user_id, conversation_id) VALUES(actor, other_conversation);
    RAISE EXCEPTION 'active conversation insert accepted an inaccessible conversation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.assistant_active_conversation(user_id, conversation_id) VALUES(actor, own_conversation);
  BEGIN
    UPDATE public.assistant_active_conversation SET conversation_id = other_conversation WHERE user_id = actor;
    RAISE EXCEPTION 'active conversation update accepted an inaccessible conversation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT conversation_id FROM public.assistant_active_conversation WHERE user_id = actor) <> own_conversation THEN
    RAISE EXCEPTION 'active conversation selection was lost';
  END IF;
  RESET ROLE;
END;
$test$;
ROLLBACK;
