-- MIN-792: orphan uploads are removed only once no document cites them.
--
-- Rows (`attachments`, `page_files`) are not the only references to an
-- uploaded object. Editors write images into Markdown and page bodies by
-- address (MIN-728): a description, a plan, a notebook, a pasted copy in
-- another ticket or page. Those references live in encrypted text that SQL
-- cannot read, so the nightly sweep reads them in the application
-- (`lib/server/upload-citations.ts`) and records here every candidate it
-- found cited. A recorded path is skipped until its check is older than the
-- grace period: the batch then moves on to the next candidates instead of
-- selecting the same cited objects every night.
BEGIN;

CREATE TABLE public.upload_citation_checks (
  storage_path text PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path ~ '^(projects|chat)/[0-9a-f-]{36}/')
);
CREATE INDEX upload_citation_checks_checked_at
  ON public.upload_citation_checks(checked_at);
ALTER TABLE public.upload_citation_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_citation_checks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.upload_citation_checks TO service_role;
COMMENT ON TABLE public.upload_citation_checks IS
  'Uploads the orphan sweep found cited by a document (MIN-792). Service role only.';

-- Same candidates as before, plus the `chat/` family (Numo attachments and
-- notebook images), minus two kinds of objects:
-- - a path checked as cited within the grace period;
-- - the target of an alias: documents written before the move to opaque
--   paths cite the OLD name, which only its digest records, so the sweep
--   could not tell that such an object is still shown.
CREATE OR REPLACE FUNCTION public.orphan_attachment_objects(
  p_before timestamptz, p_limit integer DEFAULT 500
) RETURNS TABLE(name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT candidate.name
  FROM (
    SELECT o.name, o.created_at AS retired_before
    FROM storage.objects o
    WHERE o.bucket_id = 'attachments'
      AND (storage.foldername(o.name))[1] IN ('projects', 'chat')
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
    AND NOT EXISTS (
      SELECT 1 FROM public.attachment_object_aliases alias
      WHERE alias.new_path = candidate.name
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.upload_citation_checks c
      WHERE c.storage_path = candidate.name AND c.checked_at >= p_before
    )
  ORDER BY candidate.retired_before, candidate.name
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.orphan_attachment_objects(timestamptz,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_attachment_objects(timestamptz,integer)
  TO service_role;

-- Page files past the grace period, oldest first, without those checked as
-- cited within it. Replaces an unordered `page_files` read that returned the
-- same first rows every night.
CREATE FUNCTION public.orphan_page_file_candidates(
  p_before timestamptz, p_limit integer DEFAULT 500
) RETURNS TABLE(id uuid, page_id uuid, storage_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT f.id, f.page_id, f.storage_path
  FROM public.page_files f
  WHERE f.created_at < p_before
    AND NOT EXISTS (
      SELECT 1 FROM public.upload_citation_checks c
      WHERE c.storage_path = f.storage_path AND c.checked_at >= p_before
    )
  ORDER BY f.created_at, f.id
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.orphan_page_file_candidates(timestamptz,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_page_file_candidates(timestamptz,integer)
  TO service_role;

COMMIT;
