BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('67604000-0000-4000-8000-000000000001','numo-owner@example.test'),
 ('67604000-0000-4000-8000-000000000002','numo-other@example.test');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','67604000-0000-4000-8000-000000000001',true);
INSERT INTO public.user_numo_preferences(user_id,provider,model) VALUES
 ('67604000-0000-4000-8000-000000000001','openrouter','test/model'),
 ('67604000-0000-4000-8000-000000000001','anthropic','test-claude');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_numo_preferences) <> 2 THEN
    RAISE EXCEPTION 'owner preferences did not persist';
  END IF;
  BEGIN
    INSERT INTO public.user_numo_preferences(user_id,provider,model)
      VALUES ('67604000-0000-4000-8000-000000000002','openrouter','foreign-model');
    RAISE EXCEPTION 'foreign preference insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','67604000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.user_numo_preferences) THEN
    RAISE EXCEPTION 'another account read model preferences';
  END IF;
END $$;
UPDATE public.user_numo_preferences SET model='foreign-overwrite';
SELECT set_config('request.jwt.claim.sub','67604000-0000-4000-8000-000000000001',true);
UPDATE public.user_numo_preferences SET model=NULL WHERE provider='openrouter';
DO $$ BEGIN
  IF (SELECT model FROM public.user_numo_preferences WHERE provider='openrouter') IS NOT NULL
     OR (SELECT model FROM public.user_numo_preferences WHERE provider='anthropic') <> 'test-claude' THEN
    RAISE EXCEPTION 'clearing a model changed another provider or account';
  END IF;
END $$;
ROLLBACK;
