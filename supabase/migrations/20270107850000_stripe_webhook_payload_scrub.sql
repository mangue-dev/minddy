-- MIN-591: the event payload is unnecessary after signature verification.
BEGIN;
ALTER TABLE public.stripe_webhook_events
  ADD COLUMN payload_scrub_attempted_at timestamptz;
CREATE INDEX stripe_webhook_payload_scrub_queue ON
  public.stripe_webhook_events(payload_scrub_attempted_at NULLS FIRST,
    stripe_event_id) WHERE payload IS NOT NULL;

CREATE TABLE public.stripe_webhook_payload_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_webhook_payload_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_payload_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.stripe_webhook_payload_scope TO service_role;

CREATE FUNCTION public.guard_stripe_webhook_payload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-webhook-payload',591));
  IF TG_OP='UPDATE' AND OLD.payload IS NULL AND NEW.payload IS NOT NULL THEN
    RAISE EXCEPTION 'stripe_webhook_payload_resurrection'
      USING ERRCODE='23514';
  END IF;
  IF NEW.payload IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.stripe_webhook_payload_scope) THEN
    RAISE EXCEPTION 'stripe_webhook_payload_retired'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stripe_webhook_payload_guard BEFORE INSERT OR UPDATE
  ON public.stripe_webhook_events FOR EACH ROW
  EXECUTE FUNCTION public.guard_stripe_webhook_payload();
REVOKE ALL ON FUNCTION public.guard_stripe_webhook_payload()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_stripe_webhook_payload_scrub()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-webhook-payload',591));
  IF EXISTS(SELECT 1 FROM public.stripe_webhook_events
      WHERE payload IS NOT NULL) THEN RETURN false; END IF;
  INSERT INTO public.stripe_webhook_payload_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_stripe_webhook_payload_scrub()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_stripe_webhook_payload_scrub()
  TO service_role;
COMMIT;
