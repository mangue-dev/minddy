\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE legacy text := 'mention:github:private-org/private-repo:alice';
  indexed text := 'mdyf1:' || repeat('a',64);
  other text := 'denied:github:private-org/private-repo:bob';
  other_index text := 'mdyf1:' || repeat('b',64);
  refused boolean := false; migrated boolean; first_count integer;
BEGIN
  INSERT INTO public.forge_mention_throttle(key,window_start,count)
    VALUES (legacy,now(),4),(other,now(),2);
  first_count := public.claim_forge_mention_protected(legacy,indexed,3600);
  IF first_count <> 5 THEN
    RAISE EXCEPTION 'Indexed claim reset the legacy counter';
  END IF;
  IF EXISTS (SELECT 1 FROM public.forge_mention_throttle
      WHERE key=legacy) THEN
    RAISE EXCEPTION 'Protected claim left a clear key';
  END IF;
  IF public.rekey_forge_mention_counter(other,other_index,3600,
      now() - interval '1 day',2) THEN
    RAISE EXCEPTION 'Stale counter migration succeeded';
  END IF;
  migrated := public.rekey_forge_mention_counter(other,other_index,3600);
  IF NOT migrated OR EXISTS (SELECT 1 FROM public.forge_mention_throttle
        WHERE key=other) THEN
    RAISE EXCEPTION 'Counter conversion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.forge_mention_throttle
      WHERE key LIKE '%private-repo%') THEN
    RAISE EXCEPTION 'Counter plaintext survived conversion';
  END IF;
  IF public.claim_forge_mention_protected(legacy,indexed,3600) <> 6 THEN
    RAISE EXCEPTION 'Indexed replay lost a claim';
  END IF;
  BEGIN
    PERFORM public.claim_forge_mention(legacy,3600);
  EXCEPTION WHEN check_violation THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Old clear writer accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.claim_forge_mention_protected(text,text,integer)','EXECUTE') OR
      has_function_privilege('authenticated',
      'public.rekey_forge_mention_counter(text,text,integer,timestamptz,integer)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Protected counter RPC has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
