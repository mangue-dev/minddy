-- Order full link snapshots by their signed request timestamp so delayed
-- deliveries cannot restore authorization removed by a newer snapshot.
ALTER TABLE public.forge_relay_instances
  ADD COLUMN last_link_snapshot_generation bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.apply_forge_relay_link_snapshot(
  p_instance_id uuid,
  p_generation bigint,
  p_snapshot jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous bigint;
  v_deleted integer := 0;
  v_upserted integer := 0;
BEGIN
  IF p_instance_id IS NULL OR p_generation <= 0
     OR p_snapshot IS NULL OR pg_catalog.jsonb_typeof(p_snapshot) <> 'array' THEN
    RAISE EXCEPTION 'forge_relay_snapshot_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT last_link_snapshot_generation
  INTO v_previous
  FROM public.forge_relay_instances
  WHERE id = p_instance_id AND status = 'active'
  FOR UPDATE;
  IF v_previous IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('state', 'instance_inactive');
  END IF;
  IF p_generation <= v_previous THEN
    RETURN pg_catalog.jsonb_build_object('state', 'stale', 'applied', 0);
  END IF;

  DELETE FROM public.forge_relay_link_mirror AS mirror
  WHERE mirror.instance_id = p_instance_id
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_to_recordset(p_snapshot)
        AS entry("provider" text, "repoId" text)
      WHERE entry."provider" = mirror.provider
        AND entry."repoId" = mirror.external_repo_id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.forge_relay_link_mirror (
    instance_id, provider, external_repo_id, repo_full_name,
    connection_id, updated_at
  )
  SELECT p_instance_id, entry."provider", entry."repoId", entry.repo,
         entry."connectionId", pg_catalog.clock_timestamp()
  FROM pg_catalog.jsonb_to_recordset(p_snapshot)
    AS entry(
      "provider" text,
      "repoId" text,
      repo text,
      "connectionId" text
    )
  ON CONFLICT (instance_id, provider, external_repo_id) DO UPDATE
  SET repo_full_name = EXCLUDED.repo_full_name,
      connection_id = EXCLUDED.connection_id,
      updated_at = EXCLUDED.updated_at;
  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  UPDATE public.forge_relay_instances
  SET last_link_snapshot_generation = p_generation
  WHERE id = p_instance_id;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'applied',
    'applied', v_deleted + v_upserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_forge_relay_link_snapshot(uuid, bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_forge_relay_link_snapshot(uuid, bigint, jsonb)
  TO service_role;

-- Apply one signed delivery as one ordered transaction. A full snapshot is
-- authoritative and therefore replaces the mirror; event-only deliveries are
-- applied incrementally. In both cases the generation advances before another
-- delivery can inspect or mutate the same instance.
CREATE OR REPLACE FUNCTION public.apply_forge_relay_link_sync(
  p_instance_id uuid,
  p_generation bigint,
  p_events jsonb,
  p_snapshot jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous bigint;
  v_deleted integer := 0;
  v_upserted integer := 0;
BEGIN
  IF p_instance_id IS NULL OR p_generation <= 0
     OR p_events IS NULL OR pg_catalog.jsonb_typeof(p_events) <> 'array'
     OR (p_snapshot IS NOT NULL AND pg_catalog.jsonb_typeof(p_snapshot) <> 'array')
     OR (p_snapshot IS NULL AND pg_catalog.jsonb_array_length(p_events) = 0) THEN
    RAISE EXCEPTION 'forge_relay_link_sync_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT last_link_snapshot_generation
  INTO v_previous
  FROM public.forge_relay_instances
  WHERE id = p_instance_id AND status = 'active'
  FOR UPDATE;
  IF v_previous IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('state', 'instance_inactive');
  END IF;
  IF p_generation <= v_previous THEN
    RETURN pg_catalog.jsonb_build_object('state', 'stale', 'applied', 0);
  END IF;

  IF p_snapshot IS NOT NULL THEN
    DELETE FROM public.forge_relay_link_mirror AS mirror
    WHERE mirror.instance_id = p_instance_id
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_to_recordset(p_snapshot)
          AS entry("provider" text, "repoId" text)
        WHERE entry."provider" = mirror.provider
          AND entry."repoId" = mirror.external_repo_id
      );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO public.forge_relay_link_mirror (
      instance_id, provider, external_repo_id, repo_full_name,
      connection_id, updated_at
    )
    SELECT p_instance_id, entry."provider", entry."repoId", entry.repo,
           entry."connectionId", pg_catalog.clock_timestamp()
    FROM pg_catalog.jsonb_to_recordset(p_snapshot)
      AS entry("provider" text, "repoId" text, repo text, "connectionId" text)
    ON CONFLICT (instance_id, provider, external_repo_id) DO UPDATE
    SET repo_full_name = EXCLUDED.repo_full_name,
        connection_id = EXCLUDED.connection_id,
        updated_at = EXCLUDED.updated_at;
    GET DIAGNOSTICS v_upserted = ROW_COUNT;
  ELSE
    DELETE FROM public.forge_relay_link_mirror AS mirror
    USING pg_catalog.jsonb_to_recordset(p_events)
      AS event("event" text, "provider" text, "repoId" text)
    WHERE mirror.instance_id = p_instance_id
      AND event."event" = 'unlinked'
      AND mirror.provider = event."provider"
      AND mirror.external_repo_id = event."repoId";
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO public.forge_relay_link_mirror (
      instance_id, provider, external_repo_id, repo_full_name,
      connection_id, updated_at
    )
    SELECT p_instance_id, event."provider", event."repoId", event.repo,
           event."connectionId", pg_catalog.clock_timestamp()
    FROM pg_catalog.jsonb_to_recordset(p_events)
      AS event(
        "event" text, "provider" text, "repoId" text,
        repo text, "connectionId" text
      )
    WHERE event."event" = 'linked'
    ON CONFLICT (instance_id, provider, external_repo_id) DO UPDATE
    SET repo_full_name = EXCLUDED.repo_full_name,
        connection_id = EXCLUDED.connection_id,
        updated_at = EXCLUDED.updated_at;
    GET DIAGNOSTICS v_upserted = ROW_COUNT;
  END IF;

  UPDATE public.forge_relay_instances
  SET last_link_snapshot_generation = p_generation
  WHERE id = p_instance_id;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'applied',
    'applied', v_deleted + v_upserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_forge_relay_link_sync(
  uuid, bigint, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_forge_relay_link_sync(
  uuid, bigint, jsonb, jsonb
) TO service_role;
