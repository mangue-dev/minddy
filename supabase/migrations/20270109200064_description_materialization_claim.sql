-- MIN-728: one materialization of a description at a time.
--
-- Typing batches of one session can be accepted by different server
-- instances, and each schedules writing the description's Markdown once the
-- typing rests. Two materializations running together would each read the
-- other's freshly written Markdown as a write made outside the authority.
-- A materializer therefore claims the document first, for a bounded time, and
-- the claim ends when it records what it wrote (or expires if it died).

BEGIN;

ALTER TABLE public.rich_documents
  ADD COLUMN materializing_until timestamp with time zone;

CREATE FUNCTION public.claim_rich_document_materialization(p_id uuid, p_seconds integer DEFAULT 30)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.rich_documents
  SET materializing_until = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_seconds, 30), 1), 120))
  WHERE id = p_id
    AND kind <> 'notebook'
    AND (materializing_until IS NULL OR materializing_until < now());
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_rich_document_materialization(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rich_document_materialization(uuid, integer)
  TO service_role;

CREATE FUNCTION public.release_rich_document_materialization(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.rich_documents SET materializing_until = NULL WHERE id = p_id;
$$;
REVOKE ALL ON FUNCTION public.release_rich_document_materialization(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rich_document_materialization(uuid)
  TO service_role;

COMMIT;
