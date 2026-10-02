-- MIN-591: seal relay instance labels, destinations and signing secrets together.
BEGIN;
ALTER TABLE public.forge_relay_instances
  ALTER COLUMN name DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz;
CREATE INDEX forge_relay_instances_content_queue
  ON public.forge_relay_instances(encryption_attempted_at NULLS FIRST,id);

CREATE TABLE public.forge_relay_instance_content_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_relay_instance_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_relay_instance_content_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.forge_relay_instance_content_scope TO service_role;

CREATE FUNCTION public.guard_forge_relay_instance_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean := NEW.encryption_version>0 AND
  NEW.encrypted_content IS NOT NULL AND NEW.name IS NULL AND
  NEW.webhook_url IS NULL AND NEW.webhook_secret_encrypted IS NULL;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-relay-instance-content',591));
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'relay_instance_identity_immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.encryption_version<OLD.encryption_version OR
        OLD.encryption_version>0 AND NOT sealed THEN
      RAISE EXCEPTION 'relay_instance_content_downgrade' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      NEW.encryption_version=0 AND NEW.encrypted_content IS NOT NULL OR
      NEW.encryption_version>0 AND NOT sealed OR
      sealed AND COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <>NEW.encryption_version,true) THEN
    RAISE EXCEPTION 'relay_instance_content_invalid' USING ERRCODE='23514';
  END IF;
  IF NOT sealed AND EXISTS(SELECT 1 FROM public.forge_relay_instance_content_scope) THEN
    RAISE EXCEPTION 'relay_instance_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_relay_instances_a_content_guard BEFORE INSERT OR UPDATE
  ON public.forge_relay_instances FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_relay_instance_content();
REVOKE ALL ON FUNCTION public.guard_forge_relay_instance_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_forge_relay_instance_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-relay-instance-content',591));
  IF EXISTS(SELECT 1 FROM public.forge_relay_instances WHERE
      encryption_version<1 OR encrypted_content IS NULL OR name IS NOT NULL OR
      webhook_url IS NOT NULL OR webhook_secret_encrypted IS NOT NULL OR
      encryption_checked_at IS NULL) THEN
    RETURN false;
  END IF;
  INSERT INTO public.forge_relay_instance_content_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_forge_relay_instance_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_forge_relay_instance_content()
  TO service_role;

-- A relay installation row has no provider field. Evaluate table-specific
-- columns only inside its own branch so ownership checks remain usable.
CREATE OR REPLACE FUNCTION public.enforce_github_installation_single_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='git_connections' THEN
    IF NEW.provider='github' AND NEW.installation_id IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('github:'||NEW.installation_id::text,456));
      IF EXISTS(SELECT 1 FROM public.forge_relay_installations
          WHERE installation_id=NEW.installation_id) THEN
        RAISE EXCEPTION 'github_installation_relay_owned' USING ERRCODE='23505';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='forge_relay_installations' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('github:'||NEW.installation_id::text,456));
    IF EXISTS(SELECT 1 FROM public.git_connections
        WHERE provider='github' AND installation_id=NEW.installation_id) THEN
      RAISE EXCEPTION 'github_installation_cloud_owned' USING ERRCODE='23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
