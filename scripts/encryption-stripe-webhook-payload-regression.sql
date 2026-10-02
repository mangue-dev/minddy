\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE rejected boolean;
BEGIN
  INSERT INTO public.stripe_webhook_events(stripe_event_id,type,payload)
    VALUES('evt_private','checkout.session.completed',
      '{"email":"private@example.test"}'::jsonb);
  IF public.activate_stripe_webhook_payload_scrub() THEN
    RAISE EXCEPTION 'Legacy Stripe event payload activated';
  END IF;
  UPDATE public.stripe_webhook_events SET payload=NULL
    WHERE stripe_event_id='evt_private';
  IF NOT public.activate_stripe_webhook_payload_scrub() THEN
    RAISE EXCEPTION 'Scrubbed Stripe events refused activation';
  END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.stripe_webhook_events(stripe_event_id,type,payload)
      VALUES('evt_old','checkout.session.completed',
        '{"email":"old@example.test"}'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old Stripe insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.stripe_webhook_events SET
      payload='{"email":"old@example.test"}'::jsonb
      WHERE stripe_event_id='evt_private';
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old Stripe update accepted'; END IF;
  UPDATE public.stripe_webhook_events SET processed_at=now()
    WHERE stripe_event_id='evt_private';
  IF NOT EXISTS(SELECT 1 FROM public.stripe_webhook_events WHERE
      stripe_event_id='evt_private' AND payload IS NULL AND
      processed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Event deduplication metadata changed';
  END IF;
  IF has_function_privilege('authenticated',
      'public.activate_stripe_webhook_payload_scrub()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate Stripe payload scrub';
  END IF;
END;
$test$;
ROLLBACK;
