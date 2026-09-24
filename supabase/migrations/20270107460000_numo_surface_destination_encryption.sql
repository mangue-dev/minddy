BEGIN;

ALTER TABLE public.numo_surface_events
  ADD COLUMN destination_encryption_checked_at timestamptz;
CREATE INDEX numo_surface_destination_queue ON public.numo_surface_events
  (destination_encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.numo_surface_destination_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.numo_surface_destination_encryption_scope
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_surface_destination_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_surface_destination_encryption_scope TO service_role;

CREATE FUNCTION public.guard_numo_surface_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; old_version integer; new_version integer;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.actor_id IS DISTINCT FROM OLD.actor_id) THEN
    RAISE EXCEPTION 'surface_destination_binding_immutable' USING ERRCODE='23514';
  END IF;
  active := EXISTS (SELECT 1 FROM public.numo_surface_destination_encryption_scope)
    OR NEW.destination ? 'ciphertext';
  IF NEW.destination ? 'ciphertext' THEN
    IF jsonb_typeof(NEW.destination) <> 'object' OR
        (SELECT count(*) FROM pg_catalog.jsonb_object_keys(NEW.destination)) <> 1 OR
        NEW.destination->>'ciphertext' IS NULL OR
        NEW.destination->>'ciphertext' !~ '^mdyn3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'surface_destination_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := split_part(NEW.destination->>'ciphertext',':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.destination ? 'ciphertext' THEN
      old_version := split_part(OLD.destination->>'ciphertext',':',2)::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'surface_destination_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.numo_surface_destination_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF active AND (TG_OP='INSERT' OR
      NEW.destination IS DISTINCT FROM OLD.destination) THEN
    RAISE EXCEPTION 'surface_destination_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_surface_destination_guard
  BEFORE INSERT OR UPDATE ON public.numo_surface_events FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_surface_destination();
REVOKE ALL ON FUNCTION public.guard_numo_surface_destination()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_numo_surface_destination(
  p_id uuid,p_old jsonb,p_new jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.numo_surface_events;
BEGIN
  SELECT * INTO row FROM public.numo_surface_events WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.destination IS DISTINCT FROM p_old THEN RETURN false; END IF;
  UPDATE public.numo_surface_events SET destination=p_new,
    destination_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_surface_destination(uuid,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_surface_destination(uuid,jsonb,jsonb)
  TO service_role;

COMMIT;
