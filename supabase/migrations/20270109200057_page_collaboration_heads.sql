-- Journal-only page collaboration commits (MIN-688 scaling follow-up).
--
-- Until now every accepted typing batch rewrote the page row: the server
-- re-sealed the whole envelope (up to ~180 KB on a large page) and
-- `commit_page_collaboration` updated `pages` under its row lock, about 200 ms
-- per batch on a large page. A batch now only journals its sealed steps and
-- advances a stream head; the page row is rewritten once per burst of typing
-- by a materialization.
--
-- 1. `page_collaboration_heads` holds the AUTHORITY: one row per page and
--    stream with the accepted revision. Rows exist for every page (backfilled
--    here, inserted with each new page), so every writer that moves a head
--    serializes on the same row lock.
-- 2. `pages.body_revision` / `pages.title_revision` keep their names but now
--    mean the MATERIALIZED revision: the revision the stored projection
--    (`content`/`title` or the sealed envelope) reflects. They change in the
--    same row update as the projection, so one row read gives a consistent
--    document and revision. Steps between the materialized revision and the
--    head are pending in the journal, which is never pruned below the
--    materialized revision.
-- 3. `append_page_collaboration` journals batches and advances heads without
--    touching the page row (only a KEY SHARE lock on it). It also checks the
--    project's membership generation carried by the session's collaboration
--    token, so a membership change refuses writes immediately.
-- 4. `materialize_page_collaboration` writes the projection a server computed
--    from the stored page plus pending steps, under the envelope CAS.
-- 5. `commit_page_collaboration` (whole-document writers, agents,
--    initialization) journals and materializes in one transaction, as before.
--
-- Lock order, everywhere: the page row, then its head rows ('body' before
-- 'title').

BEGIN;

CREATE TABLE public.page_collaboration_heads (
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('body', 'title')),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision >= 0),
  -- When the oldest step not yet materialized was accepted; NULL when the
  -- page row reflects the head. The cron safety net reads it.
  pending_since timestamp with time zone,
  PRIMARY KEY (page_id, field)
);

CREATE INDEX page_collaboration_heads_pending_idx
  ON public.page_collaboration_heads (pending_since)
  WHERE pending_since IS NOT NULL;

ALTER TABLE public.page_collaboration_heads ENABLE ROW LEVEL SECURITY;
-- No policy: heads are read by the server after its access check, and only
-- the functions below write them.
REVOKE ALL ON TABLE public.page_collaboration_heads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.page_collaboration_heads TO service_role;

INSERT INTO public.page_collaboration_heads (page_id, field, project_id, revision)
SELECT page.id, stream.field, page.project_id,
  CASE stream.field WHEN 'body' THEN page.body_revision ELSE page.title_revision END
FROM public.pages AS page
CROSS JOIN (VALUES ('body'), ('title')) AS stream(field)
ON CONFLICT (page_id, field) DO NOTHING;

-- Whether a journal batch is an authored write. Presentation and
-- initialization batches are not: materializing them neither signs the page
-- nor counts a body version.
ALTER TABLE public.page_collaboration_batches
  ADD COLUMN authored boolean NOT NULL DEFAULT true;

CREATE FUNCTION public.initialize_page_collaboration_heads()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.page_collaboration_heads (page_id, field, project_id, revision)
  VALUES (NEW.id, 'body', NEW.project_id, NEW.body_revision),
         (NEW.id, 'title', NEW.project_id, NEW.title_revision)
  ON CONFLICT (page_id, field) DO NOTHING;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.initialize_page_collaboration_heads()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER pages_initialize_collaboration_heads
  AFTER INSERT ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.initialize_page_collaboration_heads();

-- A head move wakes connected editors: a content-free event on the project
-- topic, about 150 bytes instead of the page row.
CREATE FUNCTION public.broadcast_page_collaboration_head()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM realtime.send(pg_catalog.jsonb_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', pg_catalog.jsonb_build_object(
      'page_id', NEW.page_id, 'field', NEW.field, 'revision', NEW.revision),
    'old_record', pg_catalog.jsonb_build_object(
      'page_id', OLD.page_id, 'field', OLD.field, 'revision', OLD.revision)),
    TG_OP, 'project:' || NEW.project_id, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.broadcast_page_collaboration_head()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER page_collaboration_heads_broadcast
  AFTER UPDATE ON public.page_collaboration_heads
  FOR EACH ROW WHEN (OLD.revision IS DISTINCT FROM NEW.revision)
  EXECUTE FUNCTION public.broadcast_page_collaboration_head();

-- Opens a gap on one stream: the head moves one past every accepted step and
-- the page row is declared to reflect it. Pending steps are discarded: the
-- writer that replaced the document started from the stored projection.
CREATE FUNCTION public.open_page_collaboration_gap(p_page_id uuid, p_field text,
  p_materialized bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  next_revision bigint;
BEGIN
  UPDATE public.page_collaboration_heads
  SET revision = GREATEST(revision, p_materialized) + 1,
      pending_since = NULL
  WHERE page_id = p_page_id AND field = p_field
  RETURNING revision INTO next_revision;
  RETURN COALESCE(next_revision, p_materialized + 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.open_page_collaboration_gap(uuid, text, bigint)
  FROM PUBLIC, anon, authenticated;

-- The safety net for writers that bypass the authority (an older deployment,
-- an account import, a direct SQL write): changing the body (it raises
-- `version`, or rewrites a plaintext body) or a plaintext title opens a gap.
-- Revisions still move only inside the collaboration functions.
CREATE OR REPLACE FUNCTION public.guard_page_collaboration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.encryption_version > 0 AND OLD.encryption_version = 0 THEN
    DELETE FROM public.page_collaboration_batches AS batch
    WHERE batch.page_id = OLD.id
      AND batch.encryption_version = 0;
  END IF;

  IF COALESCE(current_setting('minddy.page_collaboration_commit', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.body_revision IS DISTINCT FROM OLD.body_revision
     OR NEW.title_revision IS DISTINCT FROM OLD.title_revision THEN
    RAISE EXCEPTION 'page_collaboration_revision_immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.version IS DISTINCT FROM OLD.version
     OR (OLD.encryption_version = 0 AND NEW.encryption_version = 0
         AND NEW.content IS DISTINCT FROM OLD.content) THEN
    NEW.body_revision := public.open_page_collaboration_gap(OLD.id, 'body', OLD.body_revision);
  END IF;
  IF OLD.encryption_version = 0 AND NEW.encryption_version = 0
     AND NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.title_revision := public.open_page_collaboration_gap(OLD.id, 'title', OLD.title_revision);
  END IF;
  RETURN NEW;
END;
$function$;

-- Journals one or two batches (body, title) and advances their heads. The
-- page row is not written: it only takes a KEY SHARE lock, which a
-- materialization or a metadata write (NO KEY UPDATE) does not wait for.
--
-- `p_generation` is the project membership generation the caller's access
-- decision was made at; a different current generation (a member removed or
-- their role changed since) answers `revoked`.
--
-- Outcomes: `accepted`; `duplicate`; `batch_reused`; `behind`; `revoked`;
-- `missing`. `accepted` reports the steps pending materialization and the age
-- of the oldest, so the caller can decide to materialize at once.
CREATE FUNCTION public.append_page_collaboration(
  p_page_id uuid,
  p_project_id uuid,
  p_generation bigint,
  p_batches jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  page_row record;
  plaintext boolean;
  batch jsonb;
  existing record;
  heads record;
  head bigint;
  new_body bigint;
  new_title bigint;
  oldest timestamp with time zone;
BEGIN
  IF jsonb_typeof(p_batches) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_batches) NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'page_collaboration_invalid_request' USING ERRCODE = '22023';
  END IF;

  -- A plaintext batch must not race a page being sealed: it holds a share
  -- lock that the sealing update waits for. A sealed batch needs only the
  -- key share lock.
  SELECT bool_or(COALESCE((value->>'encryption_version')::integer, 0) = 0)
  INTO plaintext
  FROM jsonb_array_elements(p_batches);
  IF plaintext THEN
    SELECT id, project_id, deleted_at, encryption_version, body_revision, title_revision
    INTO page_row FROM public.pages WHERE id = p_page_id FOR SHARE;
  ELSE
    SELECT id, project_id, deleted_at, encryption_version, body_revision, title_revision
    INTO page_row FROM public.pages WHERE id = p_page_id FOR KEY SHARE;
  END IF;
  IF NOT FOUND OR page_row.deleted_at IS NOT NULL
     OR page_row.project_id IS DISTINCT FROM p_project_id THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF plaintext AND page_row.encryption_version > 0 THEN
    RAISE EXCEPTION 'page_collaboration_plaintext_refused' USING ERRCODE = '23514';
  END IF;

  IF p_generation IS DISTINCT FROM (
    SELECT generation.generation
    FROM public.project_realtime_generations AS generation
    WHERE generation.project_id = p_project_id
  ) THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;

  SELECT
    max(h.revision) FILTER (WHERE h.field = 'body') AS body,
    max(h.revision) FILTER (WHERE h.field = 'title') AS title
  INTO heads
  FROM (
    SELECT field, revision FROM public.page_collaboration_heads
    WHERE page_id = p_page_id
    ORDER BY field
    FOR UPDATE
  ) AS h;
  IF heads.body IS NULL OR heads.title IS NULL THEN
    RAISE EXCEPTION 'page_collaboration_heads_missing' USING ERRCODE = '23514';
  END IF;

  -- A retried request finds its receipt before any revision comparison.
  FOR batch IN SELECT value FROM jsonb_array_elements(p_batches) LOOP
    SELECT b.field, b.base_revision, b.step_count INTO existing
    FROM public.page_collaboration_batches AS b
    WHERE b.page_id = p_page_id
      AND b.batch_id = (batch->>'batch_id')::uuid;
    IF FOUND THEN
      IF existing.field IS DISTINCT FROM batch->>'field'
         OR existing.base_revision IS DISTINCT FROM (batch->>'base_revision')::bigint
         OR existing.step_count IS DISTINCT FROM (batch->>'step_count')::integer THEN
        RETURN jsonb_build_object('status', 'batch_reused');
      END IF;
      RETURN jsonb_build_object('status', 'duplicate',
        'body_revision', heads.body, 'title_revision', heads.title);
    END IF;
  END LOOP;

  new_body := heads.body;
  new_title := heads.title;
  FOR batch IN SELECT value FROM jsonb_array_elements(p_batches) LOOP
    head := CASE batch->>'field' WHEN 'body' THEN heads.body WHEN 'title' THEN heads.title END;
    IF head IS NULL OR (batch->>'step_count')::integer IS NULL
       OR (batch->>'step_count')::integer < 1 THEN
      RAISE EXCEPTION 'page_collaboration_invalid_request' USING ERRCODE = '22023';
    END IF;
    IF head <> (batch->>'base_revision')::bigint THEN
      RETURN jsonb_build_object('status', 'behind', 'field', batch->>'field', 'head', head);
    END IF;
    IF batch->>'field' = 'body' THEN
      new_body := head + (batch->>'step_count')::integer;
    ELSE
      new_title := head + (batch->>'step_count')::integer;
    END IF;
  END LOOP;

  FOR batch IN SELECT value FROM jsonb_array_elements(p_batches) LOOP
    INSERT INTO public.page_collaboration_batches (
      page_id, field, base_revision, step_count, project_id, batch_id,
      client_id, author_id, author_kind, author_api_key_id, authored, steps,
      encrypted_content, encryption_version
    ) VALUES (
      p_page_id,
      batch->>'field',
      (batch->>'base_revision')::bigint,
      (batch->>'step_count')::integer,
      page_row.project_id,
      (batch->>'batch_id')::uuid,
      batch->>'client_id',
      NULLIF(batch->>'author_id', '')::uuid,
      batch->>'author_kind',
      NULLIF(batch->>'author_api_key_id', '')::uuid,
      COALESCE((batch->>'authored')::boolean, true),
      NULLIF(batch->'steps', 'null'::jsonb),
      batch->>'encrypted_content',
      COALESCE((batch->>'encryption_version')::integer, 0)
    );
    UPDATE public.page_collaboration_heads
    SET revision = CASE field WHEN 'body' THEN new_body ELSE new_title END,
        pending_since = COALESCE(pending_since, pg_catalog.now())
    WHERE page_id = p_page_id AND field = batch->>'field';
  END LOOP;

  SELECT min(pending_since) INTO oldest
  FROM public.page_collaboration_heads WHERE page_id = p_page_id;

  RETURN jsonb_build_object('status', 'accepted',
    'body_revision', new_body,
    'title_revision', new_title,
    'pending', (new_body - page_row.body_revision) + (new_title - page_row.title_revision),
    'pending_ms', COALESCE(
      (EXTRACT(EPOCH FROM pg_catalog.now() - oldest) * 1000)::bigint, 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.append_page_collaboration(uuid, uuid, bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_page_collaboration(uuid, uuid, bigint, jsonb)
  TO service_role;

-- The columns a projection write may set. Shared by the two writers below so
-- they stay identical.
CREATE FUNCTION public.write_page_collaboration_projection(
  p_page_id uuid,
  p_values jsonb,
  p_body_revision bigint,
  p_title_revision bigint
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_catalog.set_config('minddy.page_collaboration_commit', 'on', true);
  UPDATE public.pages SET
    title = CASE WHEN p_values ? 'title' THEN p_values->>'title' ELSE title END,
    icon = CASE WHEN p_values ? 'icon' THEN p_values->>'icon' ELSE icon END,
    content = CASE WHEN p_values ? 'content'
      THEN NULLIF(p_values->'content', 'null'::jsonb) ELSE content END,
    database_schema = CASE WHEN p_values ? 'database_schema'
      THEN NULLIF(p_values->'database_schema', 'null'::jsonb) ELSE database_schema END,
    database_title_name = CASE WHEN p_values ? 'database_title_name'
      THEN p_values->>'database_title_name' ELSE database_title_name END,
    property_values = CASE WHEN p_values ? 'property_values'
      THEN NULLIF(p_values->'property_values', 'null'::jsonb) ELSE property_values END,
    search_text = CASE WHEN p_values ? 'search_text'
      THEN p_values->>'search_text' ELSE search_text END,
    encrypted_content = CASE WHEN p_values ? 'encrypted_content'
      THEN p_values->>'encrypted_content' ELSE encrypted_content END,
    encryption_version = CASE WHEN p_values ? 'encryption_version'
      THEN (p_values->>'encryption_version')::integer ELSE encryption_version END,
    page_is_blank = CASE WHEN p_values ? 'page_is_blank'
      THEN (p_values->>'page_is_blank')::boolean ELSE page_is_blank END,
    page_is_database = CASE WHEN p_values ? 'page_is_database'
      THEN (p_values->>'page_is_database')::boolean ELSE page_is_database END,
    page_has_values = CASE WHEN p_values ? 'page_has_values'
      THEN (p_values->>'page_has_values')::boolean ELSE page_has_values END,
    version = CASE WHEN p_values ? 'version'
      THEN (p_values->>'version')::integer ELSE version END,
    updated_by = CASE WHEN p_values ? 'updated_by'
      THEN (p_values->>'updated_by')::uuid ELSE updated_by END,
    updated_kind = CASE WHEN p_values ? 'updated_kind'
      THEN p_values->>'updated_kind' ELSE updated_kind END,
    updated_api_key_id = CASE WHEN p_values ? 'updated_kind'
      THEN NULLIF(p_values->>'updated_api_key_id', '')::uuid ELSE updated_api_key_id END,
    favorite = CASE WHEN p_values ? 'favorite'
      THEN (p_values->>'favorite')::boolean ELSE favorite END,
    parent_id = CASE WHEN p_values ? 'parent_id'
      THEN NULLIF(p_values->>'parent_id', '')::uuid ELSE parent_id END,
    position = CASE WHEN p_values ? 'position'
      THEN p_values->>'position' ELSE position END,
    body_revision = p_body_revision,
    title_revision = p_title_revision
  WHERE id = p_page_id;
  PERFORM pg_catalog.set_config('minddy.page_collaboration_commit', 'off', true);

  -- Pending since the first step the row does not reflect yet, if any.
  UPDATE public.page_collaboration_heads AS h
  SET pending_since = CASE
    WHEN h.revision <= CASE h.field WHEN 'body' THEN p_body_revision ELSE p_title_revision END
      THEN NULL
    ELSE (
      SELECT min(b.created_at) FROM public.page_collaboration_batches AS b
      WHERE b.page_id = p_page_id AND b.field = h.field
        AND b.base_revision >= CASE h.field
          WHEN 'body' THEN p_body_revision ELSE p_title_revision END
    )
  END
  WHERE h.page_id = p_page_id;

  -- Bounded retention, never below the materialized revision: keep the last
  -- 2,000 revisions of each stream for at most seven days. A client older
  -- than the retained suffix receives a reset instead of a rebase.
  DELETE FROM public.page_collaboration_batches AS b
  USING public.page_collaboration_heads AS h
  WHERE b.page_id = p_page_id
    AND h.page_id = b.page_id AND h.field = b.field
    AND b.base_revision + b.step_count <= CASE b.field
      WHEN 'body' THEN p_body_revision ELSE p_title_revision END
    AND (b.base_revision + b.step_count <= h.revision - 2000
      OR b.created_at < pg_catalog.now() - interval '7 days');
END;
$function$;

REVOKE ALL ON FUNCTION public.write_page_collaboration_projection(uuid, jsonb, bigint, bigint)
  FROM PUBLIC, anon, authenticated;

-- Writes the projection of the pending steps up to the given revisions,
-- computed by the server from the stored page. Outcomes: `materialized`,
-- `unchanged` (nothing to do at these revisions), `retry` (the envelope or a
-- materialized revision moved: read again), `missing`.
CREATE FUNCTION public.materialize_page_collaboration(
  p_page_id uuid,
  p_expected_content_revision bigint,
  p_values jsonb,
  p_body_revision bigint,
  p_title_revision bigint
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  page_row record;
  heads record;
BEGIN
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'page_collaboration_invalid_request' USING ERRCODE = '22023';
  END IF;
  SELECT id, deleted_at, content_revision, body_revision, title_revision
  INTO page_row FROM public.pages WHERE id = p_page_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF page_row.content_revision IS DISTINCT FROM p_expected_content_revision THEN
    RETURN jsonb_build_object('status', 'retry');
  END IF;

  SELECT
    max(h.revision) FILTER (WHERE h.field = 'body') AS body,
    max(h.revision) FILTER (WHERE h.field = 'title') AS title
  INTO heads
  FROM (
    SELECT field, revision FROM public.page_collaboration_heads
    WHERE page_id = p_page_id ORDER BY field FOR UPDATE
  ) AS h;
  IF p_body_revision NOT BETWEEN page_row.body_revision AND heads.body
     OR p_title_revision NOT BETWEEN page_row.title_revision AND heads.title THEN
    RETURN jsonb_build_object('status', 'retry');
  END IF;
  IF p_body_revision = page_row.body_revision AND p_title_revision = page_row.title_revision THEN
    RETURN jsonb_build_object('status', 'unchanged');
  END IF;

  PERFORM public.write_page_collaboration_projection(
    p_page_id, p_values, p_body_revision, p_title_revision);
  RETURN jsonb_build_object('status', 'materialized',
    'body_revision', p_body_revision, 'title_revision', p_title_revision,
    'pending', (heads.body - p_body_revision) + (heads.title - p_title_revision));
END;
$function$;

REVOKE ALL ON FUNCTION public.materialize_page_collaboration(uuid, bigint, jsonb, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_page_collaboration(uuid, bigint, jsonb, bigint, bigint)
  TO service_role;

-- Whole-document writers, agent edits and the canonical initialization:
-- journal the batches AND write the projection at the new heads in one
-- transaction. `p_materialized` gives, for a stream without a batch here, the
-- revision the written projection reflects (a sealed envelope carries both
-- streams; a plaintext write leaves the other column alone).
DROP FUNCTION public.commit_page_collaboration(uuid, bigint, jsonb, jsonb);

CREATE FUNCTION public.commit_page_collaboration(
  p_page_id uuid,
  p_expected_content_revision bigint,
  p_values jsonb,
  p_batches jsonb,
  p_materialized jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  page_row record;
  batch jsonb;
  existing record;
  heads record;
  head bigint;
  new_body bigint;
  new_title bigint;
  materialized_body bigint;
  materialized_title bigint;
BEGIN
  IF jsonb_typeof(p_batches) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_batches) NOT BETWEEN 1 AND 2
     OR jsonb_typeof(p_values) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_materialized) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'page_collaboration_invalid_request' USING ERRCODE = '22023';
  END IF;

  SELECT id, project_id, deleted_at, content_revision, encryption_version,
    body_revision, title_revision
  INTO page_row FROM public.pages WHERE id = p_page_id FOR NO KEY UPDATE;
  IF NOT FOUND OR page_row.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;

  SELECT
    max(h.revision) FILTER (WHERE h.field = 'body') AS body,
    max(h.revision) FILTER (WHERE h.field = 'title') AS title
  INTO heads
  FROM (
    SELECT field, revision FROM public.page_collaboration_heads
    WHERE page_id = p_page_id ORDER BY field FOR UPDATE
  ) AS h;
  IF heads.body IS NULL OR heads.title IS NULL THEN
    RAISE EXCEPTION 'page_collaboration_heads_missing' USING ERRCODE = '23514';
  END IF;

  FOR batch IN SELECT value FROM jsonb_array_elements(p_batches) LOOP
    SELECT b.field, b.base_revision, b.step_count INTO existing
    FROM public.page_collaboration_batches AS b
    WHERE b.page_id = p_page_id
      AND b.batch_id = (batch->>'batch_id')::uuid;
    IF FOUND THEN
      IF existing.field IS DISTINCT FROM batch->>'field'
         OR existing.base_revision IS DISTINCT FROM (batch->>'base_revision')::bigint
         OR existing.step_count IS DISTINCT FROM (batch->>'step_count')::integer THEN
        RETURN jsonb_build_object('status', 'batch_reused');
      END IF;
      RETURN jsonb_build_object('status', 'duplicate',
        'body_revision', heads.body, 'title_revision', heads.title);
    END IF;
  END LOOP;

  new_body := heads.body;
  new_title := heads.title;
  materialized_body := (p_materialized->>'body')::bigint;
  materialized_title := (p_materialized->>'title')::bigint;
  FOR batch IN SELECT value FROM jsonb_array_elements(p_batches) LOOP
    head := CASE batch->>'field' WHEN 'body' THEN heads.body WHEN 'title' THEN heads.title END;
    IF head IS NULL OR (batch->>'step_count')::integer IS NULL
       OR (batch->>'step_count')::integer < 1 THEN
      RAISE EXCEPTION 'page_collaboration_invalid_request' USING ERRCODE = '22023';
    END IF;
    IF head <> (batch->>'base_revision')::bigint THEN
      RETURN jsonb_build_object('status', 'behind', 'field', batch->>'field', 'head', head);
    END IF;
    IF batch->>'field' = 'body' THEN
      new_body := head + (batch->>'step_count')::integer;
      materialized_body := new_body;
    ELSE
      new_title := head + (batch->>'step_count')::integer;
      materialized_title := new_title;
    END IF;
  END LOOP;

  IF page_row.content_revision IS DISTINCT FROM p_expected_content_revision THEN
    RETURN jsonb_build_object('status', 'retry');
  END IF;
  IF materialized_body IS NULL OR materialized_title IS NULL
     OR materialized_body NOT BETWEEN page_row.body_revision AND new_body
     OR materialized_title NOT BETWEEN page_row.title_revision AND new_title THEN
    RETURN jsonb_build_object('status', 'retry');
  END IF;

  FOR batch IN SELECT value FROM jsonb_array_elements(p_batches) LOOP
    -- A sealed page (or one sealed by this write) never journals plaintext.
    IF COALESCE((p_values->>'encryption_version')::integer, page_row.encryption_version) > 0
       AND COALESCE((batch->>'encryption_version')::integer, 0) = 0 THEN
      RAISE EXCEPTION 'page_collaboration_plaintext_refused' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.page_collaboration_batches (
      page_id, field, base_revision, step_count, project_id, batch_id,
      client_id, author_id, author_kind, author_api_key_id, authored, steps,
      encrypted_content, encryption_version
    ) VALUES (
      p_page_id,
      batch->>'field',
      (batch->>'base_revision')::bigint,
      (batch->>'step_count')::integer,
      page_row.project_id,
      (batch->>'batch_id')::uuid,
      batch->>'client_id',
      NULLIF(batch->>'author_id', '')::uuid,
      batch->>'author_kind',
      NULLIF(batch->>'author_api_key_id', '')::uuid,
      COALESCE((batch->>'authored')::boolean, true),
      NULLIF(batch->'steps', 'null'::jsonb),
      batch->>'encrypted_content',
      COALESCE((batch->>'encryption_version')::integer, 0)
    );
  END LOOP;

  UPDATE public.page_collaboration_heads
  SET revision = CASE field WHEN 'body' THEN new_body ELSE new_title END
  WHERE page_id = p_page_id
    AND revision IS DISTINCT FROM CASE field WHEN 'body' THEN new_body ELSE new_title END;

  PERFORM public.write_page_collaboration_projection(
    p_page_id, p_values, materialized_body, materialized_title);

  RETURN jsonb_build_object('status', 'accepted',
    'body_revision', new_body,
    'title_revision', new_title);
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_page_collaboration(uuid, bigint, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_page_collaboration(uuid, bigint, jsonb, jsonb, jsonb)
  TO service_role;

-- A content-replacing writer that cannot express its change as steps (a
-- database import into an existing root): both streams jump past every
-- accepted step, pending ones included, and the row reflects the new heads.
CREATE OR REPLACE FUNCTION public.reset_page_collaboration(p_page_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  page_row record;
BEGIN
  SELECT id, body_revision, title_revision INTO page_row
  FROM public.pages WHERE id = p_page_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  PERFORM pg_catalog.set_config('minddy.page_collaboration_commit', 'on', true);
  UPDATE public.pages
  SET body_revision = public.open_page_collaboration_gap(p_page_id, 'body', page_row.body_revision),
      title_revision = public.open_page_collaboration_gap(p_page_id, 'title', page_row.title_revision)
  WHERE id = p_page_id;
  PERFORM pg_catalog.set_config('minddy.page_collaboration_commit', 'off', true);
END;
$function$;

-- Expired journal rows of idle pages, never one still pending.
CREATE OR REPLACE FUNCTION public.prune_page_collaboration_batches(p_limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  removed integer;
BEGIN
  WITH expired AS (
    SELECT b.page_id, b.field, b.base_revision
    FROM public.page_collaboration_batches AS b
    JOIN public.pages AS page ON page.id = b.page_id
    WHERE b.created_at < pg_catalog.now() - interval '7 days'
      AND b.base_revision + b.step_count <= CASE b.field
        WHEN 'body' THEN page.body_revision ELSE page.title_revision END
    ORDER BY b.created_at
    LIMIT GREATEST(1, LEAST(p_limit, 50000))
  )
  DELETE FROM public.page_collaboration_batches AS b
  USING expired
  WHERE b.page_id = expired.page_id
    AND b.field = expired.field
    AND b.base_revision = expired.base_revision;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$function$;

-- Pages whose oldest pending step is older than the given age: the cron
-- safety net materializes them when no request did.
CREATE FUNCTION public.pending_page_collaborations(p_older_than_ms integer, p_limit integer)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT h.page_id
  FROM public.page_collaboration_heads AS h
  WHERE h.pending_since <= pg_catalog.now()
    - pg_catalog.make_interval(secs => GREATEST(p_older_than_ms, 0) / 1000.0)
  GROUP BY h.page_id
  ORDER BY min(h.pending_since)
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$function$;

REVOKE ALL ON FUNCTION public.pending_page_collaborations(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_page_collaborations(integer, integer) TO service_role;

-- A blank page with pending typing is not blank. The head rows are share
-- locked after the page row (the usual order), so a batch being journaled
-- finishes first and is seen here.
CREATE OR REPLACE FUNCTION public.discard_blank_page_guarded(p_page_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_page public.pages%ROWTYPE;
  v_blocks jsonb;
  v_blank boolean;
  v_pending boolean;
BEGIN
  SELECT * INTO v_page
  FROM public.pages
  WHERE id = p_page_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_page.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;

  SELECT COALESCE(bool_or(h.revision > CASE h.field
      WHEN 'body' THEN v_page.body_revision ELSE v_page.title_revision END), false)
  INTO v_pending
  FROM (
    SELECT field, revision FROM public.page_collaboration_heads
    WHERE page_id = v_page.id ORDER BY field FOR SHARE
  ) AS h;
  IF v_pending THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_empty');
  END IF;

  IF v_page.encryption_version > 0 THEN
    IF NOT v_page.page_is_blank OR
       EXISTS(SELECT 1 FROM public.pages WHERE id=v_page.parent_id AND page_is_database) OR
       EXISTS(SELECT 1 FROM public.pages WHERE parent_id=v_page.id AND deleted_at IS NULL) THEN
      RETURN pg_catalog.jsonb_build_object('status','not_empty');
    END IF;
    DELETE FROM public.pages WHERE id=v_page.id;
    RETURN pg_catalog.jsonb_build_object('status','discarded','parent_id',v_page.parent_id);
  END IF;
  v_blocks := v_page.content->'content';
  v_blank := CASE
    WHEN v_blocks IS NULL THEN true
    WHEN pg_catalog.jsonb_typeof(v_blocks) <> 'array' THEN true
    WHEN pg_catalog.jsonb_array_length(v_blocks) = 0 THEN true
    WHEN pg_catalog.jsonb_array_length(v_blocks) <> 1 THEN false
    WHEN v_blocks->0->>'type' <> 'paragraph' THEN false
    WHEN v_blocks->0->'content' IS NULL THEN true
    WHEN pg_catalog.jsonb_typeof(v_blocks->0->'content') <> 'array' THEN true
    ELSE pg_catalog.jsonb_array_length(v_blocks->0->'content') = 0
  END;
  IF v_page.database_schema IS NOT NULL
     OR v_page.property_values <> '{}'::jsonb
     OR EXISTS (SELECT 1 FROM public.pages WHERE id = v_page.parent_id AND database_schema IS NOT NULL)
     OR pg_catalog.btrim(v_page.title) <> ''
     OR NULLIF(v_page.icon, '') IS NOT NULL
     OR NOT v_blank
     OR EXISTS (
       SELECT 1
       FROM public.pages AS child
       WHERE child.parent_id = v_page.id
         AND child.deleted_at IS NULL
     ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_empty');
  END IF;

  DELETE FROM public.pages WHERE id = v_page.id;
  RETURN pg_catalog.jsonb_build_object(
    'status', 'discarded',
    'parent_id', v_page.parent_id
  );
END;
$function$;

COMMIT;
