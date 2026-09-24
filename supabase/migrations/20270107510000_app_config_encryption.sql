-- MIN-591: system configuration values are private, including non-admin keys.
BEGIN;

ALTER TABLE public.app_config
  ALTER COLUMN value DROP NOT NULL,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT app_config_encryption_state CHECK (
    (encryption_version = 0 AND value IS NOT NULL AND encrypted_content IS NULL)
    OR (encryption_version > 0 AND value IS NULL AND encrypted_content IS NOT NULL
      AND COALESCE((encrypted_content::jsonb->>'keyVersion')::integer = encryption_version,false))
  );
CREATE INDEX app_config_encryption_queue ON public.app_config
  (encryption_checked_at NULLS FIRST,key);

CREATE TABLE public.app_config_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_config_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_config_encryption_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.app_config_encryption_scope TO service_role;

CREATE FUNCTION public.guard_app_config_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.key IS DISTINCT FROM OLD.key THEN
    RAISE EXCEPTION 'app_config_key_immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.encryption_version < OLD.encryption_version THEN
    RAISE EXCEPTION 'app_config_key_version_rollback' USING ERRCODE='23514';
  END IF;
  IF NEW.encryption_version > 0 THEN
    INSERT INTO public.app_config_encryption_scope(id) VALUES(true)
      ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.app_config_encryption_scope)
      AND (TG_OP='INSERT' OR NEW.value IS DISTINCT FROM OLD.value) THEN
    RAISE EXCEPTION 'app_config_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER app_config_encryption_guard BEFORE INSERT OR UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.guard_app_config_encryption();
REVOKE ALL ON FUNCTION public.guard_app_config_encryption()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_app_config_value(
  p_key text,p_old_value text,p_old_cipher text,p_old_version integer,
  p_new_cipher text,p_new_version integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.app_config%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM public.app_config WHERE key=p_key FOR UPDATE;
  IF NOT FOUND OR current_row.value IS DISTINCT FROM p_old_value OR
      current_row.encrypted_content IS DISTINCT FROM p_old_cipher OR
      current_row.encryption_version IS DISTINCT FROM p_old_version THEN
    RETURN false;
  END IF;
  UPDATE public.app_config SET value=NULL,encrypted_content=p_new_cipher,
    encryption_version=p_new_version,encryption_checked_at=clock_timestamp()
    WHERE key=p_key;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_app_config_value(text,text,text,integer,text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_app_config_value(text,text,text,integer,text,integer)
  TO service_role;

CREATE FUNCTION public.mark_app_config_attempt(
  p_key text,p_old_value text,p_old_cipher text,p_old_version integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.app_config%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM public.app_config WHERE key=p_key FOR UPDATE;
  IF NOT FOUND OR current_row.value IS DISTINCT FROM p_old_value OR
      current_row.encrypted_content IS DISTINCT FROM p_old_cipher OR
      current_row.encryption_version IS DISTINCT FROM p_old_version THEN
    RETURN false;
  END IF;
  UPDATE public.app_config SET encryption_checked_at=clock_timestamp()
    WHERE key=p_key;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_app_config_attempt(text,text,text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_app_config_attempt(text,text,text,integer)
  TO service_role;

COMMIT;
