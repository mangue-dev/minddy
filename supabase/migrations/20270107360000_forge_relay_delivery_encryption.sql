BEGIN;

ALTER TABLE public.forge_relay_deliveries
  ADD COLUMN content_encryption_checked_at timestamptz;
CREATE INDEX forge_relay_delivery_encryption_queue
  ON public.forge_relay_deliveries
  (content_encryption_checked_at NULLS FIRST,id);
CREATE TABLE public.forge_relay_delivery_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_relay_delivery_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_relay_delivery_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.forge_relay_delivery_encryption_scope TO service_role;

CREATE FUNCTION public.guard_forge_relay_delivery_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE field text; old_value text; new_value text;
  active boolean; old_version integer; new_version integer;
BEGIN
  IF TG_OP='UPDATE' AND
      (NEW.instance_id,NEW.provider,NEW.delivery_guid) IS DISTINCT FROM
      (OLD.instance_id,OLD.provider,OLD.delivery_guid) THEN
    RAISE EXCEPTION 'forge_relay_delivery_identity_immutable' USING ERRCODE='23514';
  END IF;
  active := EXISTS (SELECT 1 FROM public.forge_relay_delivery_encryption_scope)
    OR NEW.payload LIKE 'mdyd3:%' OR NEW.last_error LIKE 'mdyd3:%';
  FOREACH field IN ARRAY ARRAY['payload','last_error'] LOOP
    new_value := to_jsonb(NEW)->>field;
    old_value := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>field ELSE NULL END;
    IF new_value LIKE 'mdyd3:%' THEN
      IF new_value !~ '^mdyd3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'forge_relay_delivery_ciphertext_invalid' USING ERRCODE='23514';
      END IF;
      new_version := split_part(new_value,':',2)::integer;
      IF old_value LIKE 'mdyd3:%' THEN
        old_version := split_part(old_value,':',2)::integer;
        IF new_version < old_version THEN
          RAISE EXCEPTION 'forge_relay_delivery_key_version_rollback'
            USING ERRCODE='23514';
        END IF;
      END IF;
    ELSIF new_value IS NOT NULL AND active AND
        (TG_OP='INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      RAISE EXCEPTION 'forge_relay_delivery_requires_encryption'
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF NEW.payload LIKE 'mdyd3:%' OR NEW.last_error LIKE 'mdyd3:%' THEN
    INSERT INTO public.forge_relay_delivery_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_relay_delivery_content_guard
  BEFORE INSERT OR UPDATE ON public.forge_relay_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_forge_relay_delivery_content();
REVOKE ALL ON FUNCTION public.guard_forge_relay_delivery_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_forge_relay_delivery_content(
  p_id uuid,p_old_payload text,p_old_error text,
  p_new_payload text DEFAULT NULL,p_new_error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.forge_relay_deliveries;
BEGIN
  SELECT * INTO row FROM public.forge_relay_deliveries WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.payload IS DISTINCT FROM p_old_payload OR
      row.last_error IS DISTINCT FROM p_old_error THEN RETURN false; END IF;
  UPDATE public.forge_relay_deliveries SET
    payload=COALESCE(p_new_payload,row.payload),
    last_error=COALESCE(p_new_error,row.last_error),
    content_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_forge_relay_delivery_content(
  uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_forge_relay_delivery_content(
  uuid,text,text,text,text) TO service_role;

COMMIT;
