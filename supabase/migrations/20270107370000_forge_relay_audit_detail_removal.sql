BEGIN;

ALTER TABLE public.forge_relay_audit
  ADD COLUMN detail_checked_at timestamptz;
CREATE INDEX forge_relay_audit_detail_queue
  ON public.forge_relay_audit (detail_checked_at NULLS FIRST,id);

-- Action and instance are sufficient for quota and incident correlation.
-- The sole structured SQL reservation is a fixed, non-user-authored enum.
CREATE FUNCTION public.guard_forge_relay_audit_detail()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.detail <> '{}'::jsonb AND NOT (
    NEW.action = 'mint_installation_token' AND
    NEW.detail = '{"state":"reserved"}'::jsonb
  ) AND (TG_OP = 'INSERT' OR NEW.detail IS DISTINCT FROM OLD.detail) THEN
    RAISE EXCEPTION 'forge_relay_audit_detail_forbidden'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_relay_audit_detail_guard
  BEFORE INSERT OR UPDATE ON public.forge_relay_audit
  FOR EACH ROW EXECUTE FUNCTION public.guard_forge_relay_audit_detail();
REVOKE ALL ON FUNCTION public.guard_forge_relay_audit_detail()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.scrub_forge_relay_audit_detail(
  p_id bigint,p_old_detail jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_detail jsonb;
BEGIN
  SELECT detail INTO current_detail FROM public.forge_relay_audit
    WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR current_detail IS DISTINCT FROM p_old_detail THEN
    RETURN false;
  END IF;
  UPDATE public.forge_relay_audit SET detail='{}'::jsonb,
    detail_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.scrub_forge_relay_audit_detail(bigint,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scrub_forge_relay_audit_detail(bigint,jsonb)
  TO service_role;

COMMIT;
