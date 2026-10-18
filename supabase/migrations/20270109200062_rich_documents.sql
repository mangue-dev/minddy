-- MIN-728: the ProseMirror document of every rich text surface outside pages.
--
-- Issue and objective descriptions and the task notebook are edited with the
-- page editor engine. Their Markdown stays where it is (`issues.description`,
-- `objectives.description`, `user_scratchpad.content`):
-- it is the projection every external reader uses — forge sync, MCP, Numo,
-- notifications, webhooks, search and exports. This table holds the editor's
-- document next to it: block identities, colors, mention pills and the other
-- presentation Markdown cannot carry. Comments are edited with the same
-- engine but rendered from their Markdown, so they keep no document here.
--
-- A document is valid only while its Markdown projection equals the parent's
-- Markdown. A writer that only writes Markdown (an agent, the forge, an
-- import) therefore needs no change: the editor finds the document stale and
-- reconciles it with the new Markdown, keeping untouched blocks, the way pages
-- absorb agent writes. A torn write between the parent and this table is
-- harmless for the same reason.
--
-- The table is service-only. Routes authorize through the parent with the
-- caller's own client before reading or writing here. The document is
-- private content: the repository encrypts it under the parent's key, and it
-- may never stay in clear next to an encrypted parent:
-- - writes of a clear document under an encrypted parent are refused;
-- - `purge_clear_rich_documents` deletes clear documents whose parent has
--   since been encrypted. The encryption maintenance cron calls it; the
--   document is rebuilt from the Markdown on the next edit.

BEGIN;

CREATE TABLE public.rich_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('issue', 'objective', 'notebook')),
  issue_id uuid UNIQUE REFERENCES public.issues(id) ON DELETE CASCADE,
  objective_id uuid UNIQUE REFERENCES public.objectives(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  content jsonb,
  encrypted_content jsonb,
  encryption_version integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rich_documents_owner CHECK (
    num_nonnulls(issue_id, objective_id, user_id) = 1
    AND (kind <> 'issue' OR issue_id IS NOT NULL)
    AND (kind <> 'objective' OR objective_id IS NOT NULL)
    AND (kind <> 'notebook' OR user_id IS NOT NULL)
    AND ((kind = 'notebook') = (project_id IS NULL))),
  CONSTRAINT rich_documents_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND content IS NOT NULL
      AND jsonb_typeof(content) = 'object')
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND content IS NULL))
);

CREATE INDEX idx_rich_documents_clear ON public.rich_documents (kind, id)
  WHERE encryption_version = 0;

ALTER TABLE public.rich_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rich_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rich_documents TO service_role;

-- The owner and the project come from the parent, never from the writer: the
-- project is the encryption scope, and a wrong one would seal the document
-- under another project's key.
CREATE FUNCTION public.guard_rich_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE parent_project uuid; parent_version integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.issue_id IS DISTINCT FROM OLD.issue_id
      OR NEW.objective_id IS DISTINCT FROM OLD.objective_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'rich_document_owner_is_immutable' USING ERRCODE = '23514';
  END IF;
  CASE NEW.kind
    WHEN 'issue' THEN
      SELECT project_id, encryption_version INTO parent_project, parent_version
        FROM public.issues WHERE id = NEW.issue_id;
    WHEN 'objective' THEN
      SELECT project_id, encryption_version INTO parent_project, parent_version
        FROM public.objectives WHERE id = NEW.objective_id;
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
  IF NEW.encryption_version = 0 AND COALESCE(parent_version, 0) > 0 THEN
    RAISE EXCEPTION 'rich_document_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.encryption_version > 0 AND NEW.encryption_version = 0 THEN
    RAISE EXCEPTION 'rich_document_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER rich_documents_guard BEFORE INSERT OR UPDATE ON public.rich_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_rich_document();
REVOKE ALL ON FUNCTION public.guard_rich_document() FROM PUBLIC, anon, authenticated;

-- Delete clear documents whose parent has been encrypted since they were
-- written. Bounded, so the hourly maintenance pass stays short.
CREATE FUNCTION public.purge_clear_rich_documents(p_limit integer DEFAULT 200)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed integer;
BEGIN
  WITH doomed AS (
    SELECT d.id FROM public.rich_documents d
    LEFT JOIN public.issues i ON d.kind = 'issue' AND i.id = d.issue_id
    LEFT JOIN public.objectives o ON d.kind = 'objective' AND o.id = d.objective_id
    LEFT JOIN public.user_scratchpad s ON d.kind = 'notebook' AND s.user_id = d.user_id
    WHERE d.encryption_version = 0
      AND COALESCE(i.encryption_version, o.encryption_version, s.encryption_version, 0) > 0
    ORDER BY d.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000)
  )
  DELETE FROM public.rich_documents WHERE id IN (SELECT id FROM doomed);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_clear_rich_documents(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_clear_rich_documents(integer) TO service_role;

COMMIT;
