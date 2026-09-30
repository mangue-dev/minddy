-- Run against an isolated schema-only database after migration 20270107510000.
BEGIN;
INSERT INTO public.app_config(key,value) VALUES('legacy_private','legacy-secret');
INSERT INTO public.app_config(key,value,encryption_version,encrypted_content)
  VALUES('protected_private',NULL,1,'{"format":3,"keyVersion":1,"data":"cipher"}');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.app_config WHERE key='protected_private'
      AND value IS NOT NULL) THEN RAISE EXCEPTION 'protected source retained clear value'; END IF;
  IF (SELECT count(*) FROM public.app_config_encryption_scope) <> 1 THEN
    RAISE EXCEPTION 'configuration marker was not activated';
  END IF;
  BEGIN
    INSERT INTO public.app_config(key,value) VALUES('obsolete','clear-secret');
    RAISE EXCEPTION 'obsolete insert was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'obsolete insert was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.app_config SET value='changed-secret' WHERE key='legacy_private';
    RAISE EXCEPTION 'obsolete update was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'obsolete update was accepted' THEN RAISE; END IF;
  END;
  IF public.migrate_app_config_value('legacy_private','wrong',NULL,0,
       '{"format":3,"keyVersion":1,"data":"cipher"}',1) THEN
    RAISE EXCEPTION 'stale CAS was accepted';
  END IF;
  IF NOT public.migrate_app_config_value('legacy_private','legacy-secret',NULL,0,
       '{"format":3,"keyVersion":1,"data":"cipher"}',1) THEN
    RAISE EXCEPTION 'valid CAS was refused';
  END IF;
  IF public.mark_app_config_attempt('legacy_private','legacy-secret',NULL,0) THEN
    RAISE EXCEPTION 'stale attempt CAS was accepted';
  END IF;
  IF NOT public.mark_app_config_attempt('protected_private',NULL,
       '{"format":3,"keyVersion":1,"data":"cipher"}',1) THEN
    RAISE EXCEPTION 'valid attempt CAS was refused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_config WHERE key='legacy_private'
      AND value IS NOT NULL) THEN RAISE EXCEPTION 'migration retained clear value'; END IF;
  IF has_function_privilege('authenticated',
       'public.migrate_app_config_value(text,text,text,integer,text,integer)',
       'EXECUTE') THEN RAISE EXCEPTION 'client can migrate configuration'; END IF;
  IF has_function_privilege('authenticated',
       'public.mark_app_config_attempt(text,text,text,integer)',
       'EXECUTE') THEN RAISE EXCEPTION 'client can mark a conversion attempt'; END IF;
END $$;
ROLLBACK;
