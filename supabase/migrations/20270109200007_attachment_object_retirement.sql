BEGIN;

-- Retry metadata retirement after successful Storage deletion, including rows
-- left behind by an earlier cleanup implementation or a transient SQL failure.
CREATE OR REPLACE FUNCTION public.orphan_attachment_objects(
  p_before timestamptz, p_limit integer DEFAULT 500
) RETURNS TABLE(name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT candidate.name
  FROM (
    SELECT o.name, o.created_at AS retired_before
    FROM storage.objects o
    WHERE o.bucket_id = 'attachments'
      AND (storage.foldername(o.name))[1] = 'projects'
    UNION ALL
    SELECT e.path AS name, e.checked_at AS retired_before
    FROM public.attachment_object_encrypted e
    WHERE NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'attachments' AND o.name = e.path
    )
  ) candidate
  WHERE candidate.retired_before < p_before
    AND NOT EXISTS (
      SELECT 1 FROM public.attachments a WHERE a.storage_path = candidate.name
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.page_files f WHERE f.storage_path = candidate.name
    )
  ORDER BY candidate.retired_before, candidate.name
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.orphan_attachment_objects(timestamptz,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_attachment_objects(timestamptz,integer)
  TO service_role;

COMMIT;
