BEGIN;

-- Keep failed objects in the queue while allowing later objects to progress.
CREATE TABLE public.attachment_object_migration_attempts (
  object_id uuid PRIMARY KEY REFERENCES storage.objects(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.attachment_object_migration_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attachment_object_migration_attempts
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.attachment_object_migration_attempts TO service_role;

DROP FUNCTION public.list_attachment_object_migration_candidates(integer);
CREATE FUNCTION public.list_attachment_object_migration_candidates(p_limit integer)
RETURNS TABLE(id uuid,name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_attachment_object_batch' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT o.id,o.name FROM storage.objects o
    LEFT JOIN public.attachment_object_encrypted e ON e.path=o.name
    LEFT JOIN public.attachment_object_migration_attempts a ON a.object_id=o.id
    WHERE o.bucket_id='attachments' AND e.path IS NULL
    ORDER BY a.checked_at NULLS FIRST,o.created_at,o.id LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_attachment_object_migration_candidates(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_attachment_object_migration_candidates(integer)
  TO service_role;

CREATE FUNCTION public.record_attachment_object_migration_attempt(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.attachment_object_migration_attempts(object_id,checked_at)
    SELECT o.id,clock_timestamp() FROM storage.objects o
    WHERE o.id=p_id AND o.bucket_id='attachments'
    ON CONFLICT(object_id) DO UPDATE SET checked_at=EXCLUDED.checked_at;
END;
$$;
REVOKE ALL ON FUNCTION public.record_attachment_object_migration_attempt(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_attachment_object_migration_attempt(uuid)
  TO service_role;

COMMIT;
