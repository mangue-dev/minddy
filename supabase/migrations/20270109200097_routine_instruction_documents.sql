-- MIN-832: a routine's instruction is a live document, like an issue's plan.
--
-- The instruction is edited in the shared editor on the routine's page, live
-- across the owner's tabs and devices and with Numo or MCP rewriting it: a
-- `rich_documents` stream of kind `routine`, whose Markdown projection is
-- `agent_routines.prompt`. The row id is the routine's id. Everything else is
-- the description stream's: commits, journal, materialization claim, head
-- wake-ups on the project topic, and sealing under the project's key.
--
-- Only the project owner writes a routine (lib/server/routines.ts); the
-- authority (lib/server/description-collaboration.ts) decides that on every
-- request, since the table is service-only. No caret topic is added: a
-- routine has one writer, so its sessions do not publish carets.
--
-- Additive only: the previous release never writes a `routine` row and reads
-- none.

BEGIN;

ALTER TABLE public.rich_documents
  ADD COLUMN routine_id uuid UNIQUE REFERENCES public.agent_routines(id) ON DELETE CASCADE;

ALTER TABLE public.rich_documents DROP CONSTRAINT rich_documents_kind_check;
ALTER TABLE public.rich_documents ADD CONSTRAINT rich_documents_kind_check
  CHECK (kind IN ('issue', 'objective', 'plan', 'routine', 'notebook'));

ALTER TABLE public.rich_documents DROP CONSTRAINT rich_documents_owner;
ALTER TABLE public.rich_documents ADD CONSTRAINT rich_documents_owner CHECK (
  num_nonnulls(issue_id, objective_id, routine_id, user_id) = 1
  AND (kind NOT IN ('issue', 'plan') OR issue_id IS NOT NULL)
  AND (kind <> 'objective' OR objective_id IS NOT NULL)
  AND (kind <> 'routine' OR routine_id IS NOT NULL)
  AND (kind <> 'notebook' OR user_id IS NOT NULL)
  AND ((kind = 'notebook') = (project_id IS NULL)));

-- The latest definition, from 20270109200066_description_collaboration_review_fixes.sql,
-- with the routine parent added.
CREATE OR REPLACE FUNCTION public.guard_rich_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE parent_project uuid; parent_version integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.issue_id IS DISTINCT FROM OLD.issue_id
      OR NEW.objective_id IS DISTINCT FROM OLD.objective_id
      OR NEW.routine_id IS DISTINCT FROM OLD.routine_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'rich_document_owner_is_immutable' USING ERRCODE = '23514';
  END IF;
  CASE NEW.kind
    WHEN 'issue', 'plan' THEN
      SELECT project_id, encryption_version INTO parent_project, parent_version
        FROM public.issues WHERE id = NEW.issue_id;
    WHEN 'objective' THEN
      SELECT project_id, encryption_version INTO parent_project, parent_version
        FROM public.objectives WHERE id = NEW.objective_id;
    WHEN 'routine' THEN
      SELECT project_id, encryption_version INTO parent_project, parent_version
        FROM public.agent_routines WHERE id = NEW.routine_id;
    ELSE
      SELECT NULL::uuid, encryption_version INTO parent_project, parent_version
        FROM public.user_scratchpad WHERE user_id = NEW.user_id;
  END CASE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rich_document_parent_missing' USING ERRCODE = '23503';
  END IF;
  IF NEW.kind <> 'notebook' AND parent_project IS NULL THEN
    RAISE EXCEPTION 'rich_document_parent_without_project' USING ERRCODE = '23514';
  END IF;
  NEW.project_id := parent_project;
  -- Only writes of content are refused in clear: stream metadata (claims,
  -- materialization marks, queue deferral) still moves on a clear document
  -- awaiting its purge or its sealing.
  IF NEW.encryption_version = 0 AND COALESCE(parent_version, 0) > 0
     AND (TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content) THEN
    RAISE EXCEPTION 'rich_document_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.encryption_version > 0 AND NEW.encryption_version = 0 THEN
    RAISE EXCEPTION 'rich_document_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_rich_document() FROM PUBLIC, anon, authenticated;

-- The latest definition, from 20270109200066_description_collaboration_review_fixes.sql,
-- with the routine parent added.
CREATE OR REPLACE FUNCTION public.purge_clear_rich_documents(p_limit integer DEFAULT 200)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed integer;
BEGIN
  WITH doomed AS (
    SELECT d.id FROM public.rich_documents d
    LEFT JOIN public.issues i ON d.kind IN ('issue', 'plan') AND i.id = d.issue_id
    LEFT JOIN public.objectives o ON d.kind = 'objective' AND o.id = d.objective_id
    LEFT JOIN public.agent_routines r ON d.kind = 'routine' AND r.id = d.routine_id
    LEFT JOIN public.user_scratchpad s ON d.kind = 'notebook' AND s.user_id = d.user_id
    WHERE d.encryption_version = 0
      AND COALESCE(i.encryption_version, o.encryption_version, r.encryption_version,
        s.encryption_version, 0) > 0
    ORDER BY d.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000)
  )
  DELETE FROM public.rich_documents WHERE id IN (SELECT id FROM doomed);
  GET DIAGNOSTICS removed = ROW_COUNT;
  -- Clear steps of a document sealed since, or whose parent is encrypted.
  WITH stale AS (
    SELECT b.document_id, b.base_revision FROM public.rich_document_batches b
    JOIN public.rich_documents d ON d.id = b.document_id
    LEFT JOIN public.issues i ON d.kind IN ('issue', 'plan') AND i.id = d.issue_id
    LEFT JOIN public.objectives o ON d.kind = 'objective' AND o.id = d.objective_id
    LEFT JOIN public.agent_routines r ON d.kind = 'routine' AND r.id = d.routine_id
    WHERE b.encryption_version = 0
      AND (d.encryption_version > 0
        OR COALESCE(i.encryption_version, o.encryption_version, r.encryption_version, 0) > 0)
    ORDER BY b.document_id, b.base_revision
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000)
  )
  DELETE FROM public.rich_document_batches b
  USING stale WHERE b.document_id = stale.document_id AND b.base_revision = stale.base_revision;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_clear_rich_documents(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_clear_rich_documents(integer) TO service_role;

COMMIT;
