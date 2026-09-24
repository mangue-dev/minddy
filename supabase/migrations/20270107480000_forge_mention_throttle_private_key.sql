BEGIN;

CREATE TABLE public.forge_mention_key_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_mention_key_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_mention_key_encryption_scope
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.forge_mention_key_encryption_scope TO service_role;

CREATE FUNCTION public.guard_forge_mention_key()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.key ~ '^mdyf1:[0-9a-f]{64}$' THEN
    INSERT INTO public.forge_mention_key_encryption_scope(id)
      VALUES (true) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.forge_mention_key_encryption_scope) THEN
    RAISE EXCEPTION 'forge_mention_key_requires_index'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_mention_key_guard
  BEFORE INSERT OR UPDATE ON public.forge_mention_throttle
  FOR EACH ROW EXECUTE FUNCTION public.guard_forge_mention_key();
REVOKE ALL ON FUNCTION public.guard_forge_mention_key()
  FROM PUBLIC, anon, authenticated;

-- All callers use the same advisory lock before touching either identity.
-- During activation a legacy counter is folded into its indexed identity
-- before counting a new mention, so a rollout cannot reset rate limits.
CREATE FUNCTION public.rekey_forge_mention_counter(
  p_legacy text, p_indexed text, p_window_seconds integer,
  p_expected_start timestamptz DEFAULT NULL,
  p_expected_count integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE legacy_row public.forge_mention_throttle;
  indexed_row public.forge_mention_throttle;
  merged_count integer; merged_start timestamptz;
BEGIN
  IF p_indexed !~ '^mdyf1:[0-9a-f]{64}$' OR
      p_legacy IS NULL OR p_legacy = p_indexed OR
      p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_forge_mention_rekey' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-mention-index:' || p_indexed, 591));
  SELECT * INTO legacy_row FROM public.forge_mention_throttle
    WHERE key = p_legacy FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_expected_start IS NOT NULL AND
      (legacy_row.window_start IS DISTINCT FROM p_expected_start OR
       legacy_row.count IS DISTINCT FROM p_expected_count) THEN
    RETURN false;
  END IF;
  SELECT * INTO indexed_row FROM public.forge_mention_throttle
    WHERE key = p_indexed FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.forge_mention_throttle SET key = p_indexed
      WHERE key = p_legacy;
    RETURN true;
  END IF;
  IF legacy_row.window_start < now() - make_interval(secs => p_window_seconds) THEN
    merged_count := indexed_row.count;
    merged_start := indexed_row.window_start;
  ELSIF indexed_row.window_start < now() - make_interval(secs => p_window_seconds) THEN
    merged_count := legacy_row.count;
    merged_start := legacy_row.window_start;
  ELSE
    merged_count := legacy_row.count + indexed_row.count;
    merged_start := least(legacy_row.window_start, indexed_row.window_start);
  END IF;
  UPDATE public.forge_mention_throttle SET count = merged_count,
    window_start = merged_start, updated_at = now() WHERE key = p_indexed;
  DELETE FROM public.forge_mention_throttle WHERE key = p_legacy;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.rekey_forge_mention_counter(
  text,text,integer,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rekey_forge_mention_counter(
  text,text,integer,timestamptz,integer) TO service_role;

CREATE FUNCTION public.claim_forge_mention_protected(
  p_legacy text, p_indexed text, p_window_seconds integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result integer;
BEGIN
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_forge_mention_window' USING ERRCODE = '22023';
  END IF;
  PERFORM public.rekey_forge_mention_counter(
    p_legacy,p_indexed,p_window_seconds);
  INSERT INTO public.forge_mention_throttle AS t (key,window_start,count)
    VALUES (p_indexed,now(),1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN t.window_start < now() -
        make_interval(secs => p_window_seconds) THEN 1 ELSE t.count + 1 END,
      window_start = CASE WHEN t.window_start < now() -
        make_interval(secs => p_window_seconds) THEN now() ELSE t.window_start END,
      updated_at = now()
    RETURNING t.count INTO result;
  IF random() < 0.01 THEN
    DELETE FROM public.forge_mention_throttle
      WHERE window_start < now() - interval '7 days';
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_forge_mention_protected(text,text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_forge_mention_protected(text,text,integer)
  TO service_role;

COMMIT;
