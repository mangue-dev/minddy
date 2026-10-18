-- MIN-728 review fixes for live descriptions and plans.
--
-- - A document sealed after its parent was encrypted no longer keeps the
--   steps it journaled in clear: `commit_rich_document` deletes them when it
--   seals the document, and `purge_clear_rich_documents` also deletes clear
--   steps of sealed documents and of documents under encrypted parents.
-- - The guard refuses only CONTENT written in clear under an encrypted
--   parent: stream metadata (claims, materialization marks, queue deferral)
--   still moves on a clear document awaiting its purge or its sealing.
-- - Carets on issue, plan and objective topics are sent by members who may
--   write the project, as page carets are (20270109200060); readers still
--   receive them.
-- - A materialization claim carries a token, and only its holder releases it.

BEGIN;

CREATE OR REPLACE FUNCTION public.commit_rich_document(
  p_id uuid,
  p_base bigint,
  p_content jsonb,
  p_encrypted_content jsonb,
  p_encryption_version integer,
  p_batch jsonb,
  p_materialized_hash text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  document record;
  receipt record;
  batch_steps integer := COALESCE((p_batch ->> 'step_count')::integer, 0);
  batch_version integer := COALESCE((p_batch ->> 'encryption_version')::integer, 0);
  next_revision bigint;
BEGIN
  SELECT id, kind, project_id, revision, encryption_version INTO document
  FROM public.rich_documents WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF document.kind = 'notebook' THEN
    RAISE EXCEPTION 'rich_document_not_collaborative' USING ERRCODE = '23514';
  END IF;
  SELECT base_revision, step_count AS steps INTO receipt
  FROM public.rich_document_batches
  WHERE document_id = p_id AND batch_id = (p_batch ->> 'batch_id')::uuid;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate',
      'revision', receipt.base_revision + receipt.steps);
  END IF;
  IF document.revision <> p_base THEN
    RETURN jsonb_build_object('status', 'behind', 'head', document.revision);
  END IF;
  IF batch_steps < 1 THEN
    RAISE EXCEPTION 'rich_document_batch_empty' USING ERRCODE = '22023';
  END IF;
  -- A sealed document never journals clear steps.
  IF (p_encryption_version > 0 OR document.encryption_version > 0) AND batch_version = 0 THEN
    RAISE EXCEPTION 'rich_document_batch_requires_encryption' USING ERRCODE = '23514';
  END IF;
  next_revision := p_base + batch_steps;
  -- The document is sealed now: steps journaled while it was clear must not
  -- outlive it in clear. Sessions behind them catch up from a snapshot.
  IF document.encryption_version = 0 AND p_encryption_version > 0 THEN
    DELETE FROM public.rich_document_batches
    WHERE document_id = p_id AND encryption_version = 0;
  END IF;

  UPDATE public.rich_documents SET
    content = p_content,
    encrypted_content = p_encrypted_content,
    encryption_version = p_encryption_version,
    revision = next_revision,
    materialized_revision = CASE WHEN p_materialized_hash IS NULL
      THEN materialized_revision ELSE next_revision END,
    materialized_hash = COALESCE(p_materialized_hash, materialized_hash),
    pending_since = CASE WHEN p_materialized_hash IS NULL
      THEN COALESCE(pending_since, now()) ELSE NULL END
  WHERE id = p_id;

  INSERT INTO public.rich_document_batches (
    document_id, base_revision, project_id, step_count, batch_id, client_id,
    author_id, steps, encrypted_content, encryption_version)
  VALUES (
    p_id, p_base, document.project_id, batch_steps, (p_batch ->> 'batch_id')::uuid,
    p_batch ->> 'client_id', NULLIF(p_batch ->> 'author_id', '')::uuid,
    CASE WHEN batch_version = 0 THEN p_batch -> 'steps' END,
    CASE WHEN batch_version > 0 THEN p_batch -> 'encrypted_content' END,
    batch_version);

  -- A bounded suffix: catch-up past it answers with a fresh snapshot.
  DELETE FROM public.rich_document_batches
  WHERE document_id = p_id
    AND (base_revision + step_count <= next_revision - 2000
      OR created_at < now() - interval '7 days' AND base_revision + step_count < next_revision);

  RETURN jsonb_build_object('status', 'accepted', 'revision', next_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.commit_rich_document(uuid, bigint, jsonb, jsonb, integer, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_rich_document(uuid, bigint, jsonb, jsonb, integer, jsonb, text)
  TO service_role;


CREATE OR REPLACE FUNCTION public.guard_rich_document()
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
    WHEN 'issue', 'plan' THEN
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

CREATE OR REPLACE FUNCTION public.purge_clear_rich_documents(p_limit integer DEFAULT 200)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed integer;
BEGIN
  WITH doomed AS (
    SELECT d.id FROM public.rich_documents d
    LEFT JOIN public.issues i ON d.kind IN ('issue', 'plan') AND i.id = d.issue_id
    LEFT JOIN public.objectives o ON d.kind = 'objective' AND o.id = d.objective_id
    LEFT JOIN public.user_scratchpad s ON d.kind = 'notebook' AND s.user_id = d.user_id
    WHERE d.encryption_version = 0
      AND COALESCE(i.encryption_version, o.encryption_version, s.encryption_version, 0) > 0
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
    WHERE b.encryption_version = 0
      AND (d.encryption_version > 0
        OR COALESCE(i.encryption_version, o.encryption_version, 0) > 0)
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

DROP POLICY members_send_description_carets ON realtime.messages;
CREATE POLICY members_send_description_carets ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND (
    ((realtime.topic() LIKE 'issue-collaboration:%' OR realtime.topic() LIKE 'plan-collaboration:%')
      AND EXISTS (
      SELECT 1 FROM public.issues AS issue
      WHERE issue.id = public.topic_uuid(realtime.topic())
        AND issue.deleted_at IS NULL
        AND public.can_write_project(issue.project_id)))
    OR (realtime.topic() LIKE 'objective-collaboration:%' AND EXISTS (
      SELECT 1 FROM public.objectives AS objective
      WHERE objective.id = public.topic_uuid(realtime.topic())
        AND objective.deleted_at IS NULL
        AND public.can_write_project(objective.project_id)))
  )
  AND public.realtime_topic_is_current(realtime.topic())
);

ALTER TABLE public.rich_documents ADD COLUMN materializing_token uuid;

DROP FUNCTION public.claim_rich_document_materialization(uuid, integer);
CREATE FUNCTION public.claim_rich_document_materialization(p_id uuid, p_token uuid, p_seconds integer DEFAULT 30)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.rich_documents
  SET materializing_until = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_seconds, 30), 1), 120)),
      materializing_token = p_token
  WHERE id = p_id
    AND kind <> 'notebook'
    AND (materializing_until IS NULL OR materializing_until < now());
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_rich_document_materialization(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rich_document_materialization(uuid, uuid, integer)
  TO service_role;

-- Only the claim's holder releases it: a materializer slower than its claim
-- must not end the next one's.
DROP FUNCTION public.release_rich_document_materialization(uuid);
CREATE FUNCTION public.release_rich_document_materialization(p_id uuid, p_token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.rich_documents SET materializing_until = NULL, materializing_token = NULL
  WHERE id = p_id AND materializing_token = p_token;
$$;
REVOKE ALL ON FUNCTION public.release_rich_document_materialization(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rich_document_materialization(uuid, uuid)
  TO service_role;

COMMIT;
