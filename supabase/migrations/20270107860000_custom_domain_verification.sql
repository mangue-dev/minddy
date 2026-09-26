-- MIN-591: protect DNS verification records for both custom-domain targets.
BEGIN;
ALTER TABLE public.custom_domains
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN verification_encryption_checked_at timestamptz,
  ADD COLUMN verification_encryption_attempted_at timestamptz;
CREATE INDEX custom_domain_verification_queue ON public.custom_domains
  (verification_encryption_attempted_at NULLS FIRST,id)
  WHERE verification IS NOT NULL;

CREATE TABLE public.custom_domain_verification_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_domain_verification_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.custom_domain_verification_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.custom_domain_verification_scope TO service_role;

CREATE FUNCTION public.custom_domain_verification_version(p_value jsonb)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE raw text; parsed jsonb; format_number integer; key_version integer;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value)<>'string' THEN RETURN 0; END IF;
  raw:=p_value #>> '{}';
  IF left(raw,6)<>'mdye3:' THEN RETURN 0; END IF;
  parsed:=substring(raw FROM 7)::jsonb;
  format_number:=COALESCE((parsed->>'format')::integer,0);
  key_version:=COALESCE((parsed->>'keyVersion')::integer,0);
  IF format_number=3 AND key_version>0 THEN RETURN key_version; END IF;
  RETURN 0;
EXCEPTION WHEN others THEN RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.custom_domain_verification_version(jsonb)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_custom_domain_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_version integer:=0; new_version integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('custom-domain-verification',591));
  new_version:=public.custom_domain_verification_version(NEW.verification);
  IF NEW.verification IS NOT NULL AND
      pg_catalog.jsonb_typeof(NEW.verification)='string' AND
      new_version=0 THEN
    RAISE EXCEPTION 'custom_domain_invalid_envelope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    old_version:=public.custom_domain_verification_version(OLD.verification);
    IF NEW.id IS DISTINCT FROM OLD.id OR
        NEW.board_id IS DISTINCT FROM OLD.board_id OR
        NEW.share_id IS DISTINCT FROM OLD.share_id OR
        (NEW.verification IS NOT NULL AND old_version>new_version) THEN
      RAISE EXCEPTION 'custom_domain_verification_scope_change'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.verification IS NOT NULL AND new_version=0 AND EXISTS(
      SELECT 1 FROM public.custom_domain_verification_scope) THEN
    RAISE EXCEPTION 'custom_domain_verification_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' OR NEW.verification IS DISTINCT FROM OLD.verification THEN
    NEW.verification_encryption_checked_at:=CASE WHEN new_version>0
      THEN pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER custom_domain_verification_guard BEFORE INSERT OR UPDATE
  ON public.custom_domains FOR EACH ROW
  EXECUTE FUNCTION public.guard_custom_domain_verification();
REVOKE ALL ON FUNCTION public.guard_custom_domain_verification()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_custom_domain_verification()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('custom-domain-verification',591));
  IF EXISTS(SELECT 1 FROM public.custom_domains WHERE
      verification IS NOT NULL AND
      (public.custom_domain_verification_version(verification)=0 OR
        verification_encryption_checked_at IS NULL)) THEN RETURN false; END IF;
  INSERT INTO public.custom_domain_verification_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_custom_domain_verification()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_custom_domain_verification()
  TO service_role;
COMMIT;
