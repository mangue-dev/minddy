BEGIN;

CREATE TABLE public.provider_operation_resource_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_operation_resource_encryption_scope
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_operation_resource_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.provider_operation_resource_encryption_scope TO service_role;

CREATE FUNCTION public.guard_provider_operation_resource()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.resource_key ~ '^mdyp1:[0-9a-f]{64}$' THEN
    IF TG_OP='UPDATE' AND OLD.resource_key ~ '^mdyp1:[0-9a-f]{64}$'
        AND NEW.resource_key IS DISTINCT FROM OLD.resource_key THEN
      RAISE EXCEPTION 'provider_operation_resource_immutable'
        USING ERRCODE='23514';
    END IF;
    INSERT INTO public.provider_operation_resource_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.provider_operation_resource_encryption_scope)
      OR NEW.resource_key LIKE 'mdyp1:%' THEN
    RAISE EXCEPTION 'provider_operation_resource_requires_index'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER provider_operation_resource_guard
  BEFORE INSERT OR UPDATE ON public.provider_operation_reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_provider_operation_resource();
REVOKE ALL ON FUNCTION public.guard_provider_operation_resource()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.list_provider_operation_resource_candidates(
  p_limit integer
) RETURNS TABLE(id bigint,resource_key text,lease_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_provider_resource_batch_size' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT r.id,r.resource_key,r.lease_expires_at
    FROM public.provider_operation_reservations r
    WHERE r.resource_key !~ '^mdyp1:[0-9a-f]{64}$'
    ORDER BY r.id LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_provider_operation_resource_candidates(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_provider_operation_resource_candidates(integer)
  TO service_role;

-- Keep the quota's actor lock and both resource locks in the same order as
-- the legacy reservation. During migration either identity can own a lease.
CREATE FUNCTION public.reserve_provider_operation_protected(
  p_actor_id uuid,p_provider text,p_operation text,
  p_legacy_resource_key text,p_indexed_resource_key text,
  p_limit integer,p_window_seconds integer,p_dedupe_seconds integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_lease timestamptz; now_at timestamptz := clock_timestamp();
BEGIN
  IF p_indexed_resource_key !~ '^mdyp1:[0-9a-f]{64}$' OR
      p_legacy_resource_key IS NULL OR
      p_legacy_resource_key='' OR length(p_legacy_resource_key)>512 OR
      p_actor_id IS NULL OR p_provider IS NULL OR p_provider='' OR
      length(p_provider)>64 OR p_operation IS NULL OR p_operation='' OR
      length(p_operation)>64 OR p_limit<1 OR p_window_seconds<1 OR
      p_window_seconds>86400 OR
      p_legacy_resource_key = p_indexed_resource_key OR
      p_dedupe_seconds < 0 OR p_dedupe_seconds > 3600 THEN
    RAISE EXCEPTION 'provider_operation_resource_invalid' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.provider_operation_resource_encryption_scope(id)
    VALUES(true) ON CONFLICT DO NOTHING;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text || ':' || p_provider,465));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider || ':' || p_legacy_resource_key,466));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider || ':' || p_indexed_resource_key,466));
  IF p_dedupe_seconds > 0 THEN
    SELECT max(lease_expires_at) INTO current_lease
    FROM public.provider_operation_reservations
    WHERE provider=p_provider AND resource_key IN
      (p_legacy_resource_key,p_indexed_resource_key)
      AND lease_expires_at>now_at;
    IF current_lease IS NOT NULL THEN
      RETURN jsonb_build_object('state','deduplicated','retry_after',
        greatest(1,ceil(extract(epoch FROM
          (current_lease-now_at)))::integer));
    END IF;
  END IF;
  RETURN public.reserve_provider_operation(p_actor_id,p_provider,p_operation,
    p_indexed_resource_key,p_limit,p_window_seconds,p_dedupe_seconds);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_provider_operation_protected(
  uuid,text,text,text,text,integer,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_provider_operation_protected(
  uuid,text,text,text,text,integer,integer,integer) TO service_role;

CREATE FUNCTION public.release_provider_operation_protected(
  p_actor_id uuid,p_provider text,p_operation text,
  p_legacy_resource_key text,p_indexed_resource_key text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE reservation public.provider_operation_reservations;
BEGIN
  IF p_actor_id IS NULL OR p_provider IS NULL OR p_provider='' OR
      p_operation IS NULL OR p_operation='' OR
      p_legacy_resource_key IS NULL OR p_legacy_resource_key='' OR
      p_indexed_resource_key !~ '^mdyp1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'provider_operation_release_invalid' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.provider_operation_resource_encryption_scope(id)
    VALUES(true) ON CONFLICT DO NOTHING;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider || ':' || p_legacy_resource_key,466));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider || ':' || p_indexed_resource_key,466));
  SELECT * INTO reservation FROM public.provider_operation_reservations
  WHERE actor_id=p_actor_id AND provider=p_provider AND operation=p_operation
    AND resource_key IN (p_legacy_resource_key,p_indexed_resource_key)
    AND lease_expires_at>clock_timestamp()
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.provider_operation_reservations
    SET resource_key=p_indexed_resource_key,
      lease_expires_at=clock_timestamp()
    WHERE id=reservation.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.release_provider_operation_protected(
  uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_provider_operation_protected(
  uuid,text,text,text,text) TO service_role;

CREATE FUNCTION public.migrate_provider_operation_resource(
  p_id bigint,p_old text,p_new text,p_old_lease timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE observed public.provider_operation_reservations;
BEGIN
  IF p_new !~ '^mdyp1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'provider_operation_resource_invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO observed FROM public.provider_operation_reservations
    WHERE id=p_id;
  IF NOT FOUND OR observed.resource_key IS DISTINCT FROM p_old THEN
    RETURN false;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(observed.provider || ':' || p_old,466));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(observed.provider || ':' || p_new,466));
  SELECT * INTO observed FROM public.provider_operation_reservations
    WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR observed.resource_key IS DISTINCT FROM p_old OR
      observed.lease_expires_at IS DISTINCT FROM p_old_lease THEN
    RETURN false;
  END IF;
  UPDATE public.provider_operation_reservations SET resource_key=p_new
    WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_provider_operation_resource(
  bigint,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_provider_operation_resource(
  bigint,text,text,timestamptz) TO service_role;

COMMIT;
