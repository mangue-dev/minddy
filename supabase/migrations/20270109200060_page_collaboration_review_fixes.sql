-- Live page collaboration review fixes (MIN-688).
--
-- 1. Journal size. `page_collaboration_batches.size_bytes` records each
--    batch's stored size. Retention also keeps at most 8 MB of materialized
--    steps per stream, `append_page_collaboration` answers `backlog` past
--    16 MB of pending steps (the server materializes, then appends), and
--    `read_page_collaboration_journal` bounds a catch-up read by bytes.
-- 2. Sealing a page no longer deletes plaintext journal rows that the row
--    does not reflect yet: the sealing write fails with 40001
--    (`page_collaboration_plaintext_pending`) and its writer materializes
--    first.
-- 3. A materialization whose last author (account or API key) was deleted
--    writes NULL instead of failing on the foreign key forever.
-- 4. The append share-locks the project's membership generation and refuses
--    a trashed project.
-- 5. Indexes on `project_id` for the journal and the heads: a project
--    deletion cascades without scanning them.
-- 6. Caret Broadcast: only writers of the page's project may send; readers
--    still receive.
-- 7. `import_encrypted_page_database` opens the root's collaboration gap in
--    its own transaction.

BEGIN;

ALTER TABLE public.page_collaboration_batches
  ADD COLUMN size_bytes integer NOT NULL DEFAULT 0 CHECK (size_bytes >= 0);
UPDATE public.page_collaboration_batches
SET size_bytes = COALESCE(pg_catalog.octet_length(encrypted_content),
  pg_catalog.octet_length(steps::text), 0);

CREATE INDEX page_collaboration_batches_project_idx
  ON public.page_collaboration_batches (project_id);
CREATE INDEX page_collaboration_heads_project_idx
  ON public.page_collaboration_heads (project_id);

CREATE OR REPLACE FUNCTION public.guard_page_collaboration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- A page being sealed loses its plaintext journal rows, but only once the
  -- row reflects them: plaintext steps still pending are acknowledged typing.
  -- The sealing writer materializes first and tries again.
  IF NEW.encryption_version > 0 AND OLD.encryption_version = 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.page_collaboration_batches AS batch
      WHERE batch.page_id = OLD.id
        AND batch.encryption_version = 0
        AND batch.base_revision + batch.step_count > CASE batch.field
          WHEN 'body' THEN NEW.body_revision ELSE NEW.title_revision END
    ) THEN
      RAISE EXCEPTION 'page_collaboration_plaintext_pending' USING ERRCODE = '40001';
    END IF;
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

CREATE OR REPLACE FUNCTION public.append_page_collaboration(
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
  current_generation bigint;
  backlog bigint;
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

  -- The generation row is share locked: a membership change (which rotates
  -- it) waits for this batch, or this batch sees the new generation. A
  -- trashed project accepts nothing.
  SELECT generation.generation INTO current_generation
  FROM public.project_realtime_generations AS generation
  JOIN public.projects AS project ON project.id = generation.project_id
  WHERE generation.project_id = p_project_id
    AND project.deleted_at IS NULL
  FOR SHARE OF generation;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF p_generation IS DISTINCT FROM current_generation THEN
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

  -- Bounded pending journal: past 16 MB of steps not yet in the row, the
  -- caller materializes before more is accepted.
  SELECT COALESCE(sum(b.size_bytes), 0) INTO backlog
  FROM public.page_collaboration_batches AS b
  WHERE b.page_id = p_page_id
    AND b.base_revision >= CASE b.field
      WHEN 'body' THEN page_row.body_revision ELSE page_row.title_revision END;
  IF backlog > 16777216 THEN
    RETURN jsonb_build_object('status', 'backlog');
  END IF;

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
      encrypted_content, encryption_version, size_bytes
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
      COALESCE((batch->>'encryption_version')::integer, 0),
      COALESCE(pg_catalog.octet_length(batch->>'encrypted_content'),
        pg_catalog.octet_length((batch->'steps')::text), 0)
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

CREATE OR REPLACE FUNCTION public.write_page_collaboration_projection(
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
    -- An author whose account (or API key) was deleted since their batch:
    -- the reference becomes NULL, as ON DELETE SET NULL would have made it.
    updated_by = CASE WHEN p_values ? 'updated_by'
      THEN (SELECT account.id FROM auth.users AS account
        WHERE account.id = NULLIF(p_values->>'updated_by', '')::uuid)
      ELSE updated_by END,
    updated_kind = CASE WHEN p_values ? 'updated_kind'
      THEN p_values->>'updated_kind' ELSE updated_kind END,
    updated_api_key_id = CASE WHEN p_values ? 'updated_kind'
      THEN (SELECT api_key.id FROM public.api_keys AS api_key
        WHERE api_key.id = NULLIF(p_values->>'updated_api_key_id', '')::uuid)
      ELSE updated_api_key_id END,
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

  -- And at most 8 MB of materialized steps per stream: a writer alternating
  -- large insertions and deletions cannot make the journal grow without end.
  DELETE FROM public.page_collaboration_batches AS b
  USING (
    SELECT r.field, r.base_revision,
      sum(r.size_bytes) OVER (PARTITION BY r.field ORDER BY r.base_revision DESC) AS newer_bytes
    FROM public.page_collaboration_batches AS r
    WHERE r.page_id = p_page_id
  ) AS ranked
  WHERE b.page_id = p_page_id
    AND b.field = ranked.field AND b.base_revision = ranked.base_revision
    AND ranked.newer_bytes > 8388608
    AND b.base_revision + b.step_count <= CASE b.field
      WHEN 'body' THEN p_body_revision ELSE p_title_revision END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_page_collaboration(
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
      encrypted_content, encryption_version, size_bytes
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
      COALESCE((batch->>'encryption_version')::integer, 0),
      COALESCE(pg_catalog.octet_length(batch->>'encrypted_content'),
        pg_catalog.octet_length((batch->'steps')::text), 0)
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

-- A catch-up page of the journal, bounded by rows and by stored bytes: rows
-- are returned in revision order while the bytes BEFORE each row stay under
-- `p_max_bytes`, so at least one row always comes back.
CREATE FUNCTION public.read_page_collaboration_journal(
  p_page_id uuid,
  p_project_id uuid,
  p_field text,
  p_since bigint,
  p_max_rows integer,
  p_max_bytes bigint
)
 RETURNS TABLE (
  page_id uuid, project_id uuid, field text, base_revision bigint, step_count integer,
  client_id text, author_id uuid, author_kind text, author_api_key_id uuid,
  authored boolean, created_at timestamp with time zone, steps jsonb,
  encrypted_content text, encryption_version integer
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT r.page_id, r.project_id, r.field, r.base_revision, r.step_count, r.client_id,
    r.author_id, r.author_kind, r.author_api_key_id, r.authored, r.created_at, r.steps,
    r.encrypted_content, r.encryption_version
  FROM (
    SELECT b.*, COALESCE(sum(b.size_bytes) OVER (ORDER BY b.base_revision
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS bytes_before
    FROM public.page_collaboration_batches AS b
    WHERE b.page_id = p_page_id
      AND b.project_id = p_project_id
      AND b.field = p_field
      AND b.base_revision >= p_since
    ORDER BY b.base_revision
    LIMIT GREATEST(1, LEAST(p_max_rows, 500))
  ) AS r
  WHERE r.bytes_before < GREATEST(p_max_bytes, 1)
  ORDER BY r.base_revision;
$function$;

REVOKE ALL ON FUNCTION public.read_page_collaboration_journal(uuid, uuid, text, bigint, integer, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_page_collaboration_journal(uuid, uuid, text, bigint, integer, bigint)
  TO service_role;

DROP POLICY IF EXISTS members_send_page_collaboration_carets ON realtime.messages;
CREATE POLICY members_send_page_collaboration_carets ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND realtime.topic() LIKE 'page-collaboration:%'
  AND EXISTS (
    SELECT 1 FROM public.pages AS page
    WHERE page.id = public.topic_uuid(realtime.topic())
      AND page.deleted_at IS NULL
      AND public.can_write_project(page.project_id)
  )
  AND public.realtime_topic_is_current(realtime.topic())
);

CREATE OR REPLACE FUNCTION public.import_encrypted_page_database(p_project uuid, p_page uuid, p_actor uuid, p_request uuid, p_revision integer, p_content_revision bigint, p_pages jsonb, p_files jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE target public.pages%ROWTYPE;
  previous public.page_database_imports%ROWTYPE;
  item jsonb;
  root jsonb;
  seen uuid[] := '{}';
BEGIN
  IF NOT public.lock_live_project_actor_access(p_project,p_actor) THEN
    RAISE EXCEPTION 'Project access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO target FROM public.pages WHERE id=p_page AND
    project_id=p_project AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Page not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO previous FROM public.page_database_imports WHERE id=p_request;
  IF FOUND THEN
    IF previous.page_id<>p_page OR previous.created_by<>p_actor THEN
      RAISE EXCEPTION 'Import request belongs to another target' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_build_object('count',previous.page_count,'replayed',true);
  END IF;
  IF target.encryption_version<1 OR NOT target.page_is_database OR
      target.database_revision<>p_revision OR
      target.content_revision<>p_content_revision OR
      EXISTS(SELECT 1 FROM public.pages WHERE parent_id=p_page) OR
      jsonb_typeof(p_pages) IS DISTINCT FROM 'array' OR
      jsonb_array_length(p_pages) NOT BETWEEN 1 AND 1000 OR
      jsonb_typeof(p_files) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Import requires an unchanged empty database' USING ERRCODE='40001';
  END IF;
  root:=p_pages->0;
  IF root->>'id' IS DISTINCT FROM p_page::text OR
      root->>'parent_id' IS NOT NULL OR
      (root->>'page_is_database')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid database root' USING ERRCODE='22023';
  END IF;
  UPDATE public.pages SET
    encrypted_content=root->>'encrypted_content',
    encryption_version=(root->>'encryption_version')::integer,
    title=NULL, icon=NULL, content=NULL, database_schema=NULL,
    database_title_name=NULL, property_values=NULL, search_text=NULL,
    page_is_database=(root->>'page_is_database')::boolean,
    page_has_values=(root->>'page_has_values')::boolean,
    page_is_blank=(root->>'page_is_blank')::boolean,
    database_revision=target.database_revision+1,
    created_at=coalesce((root->>'created_at')::timestamptz,target.created_at),
    updated_by=p_actor, updated_kind='human', updated_api_key_id=NULL
  WHERE id=p_page;
  seen:=array_append(seen,p_page);
  FOR item IN SELECT value FROM jsonb_array_elements(p_pages)
    WITH ORDINALITY AS rows(value,n) WHERE n>1 ORDER BY n LOOP
    IF (item->>'parent_id')::uuid <> ALL(seen) OR
        (item->>'id')::uuid = ANY(seen) OR
        (item->>'encryption_version')::integer<1 OR
        item->>'encrypted_content' IS NULL THEN
      RAISE EXCEPTION 'Invalid encrypted import child' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.pages(id,project_id,parent_id,title,icon,content,
      database_schema,database_title_name,property_values,position,created_at,
      created_by,updated_by,updated_kind,encrypted_content,encryption_version,
      page_is_database,page_has_values,page_is_blank,search_text)
    VALUES((item->>'id')::uuid,p_project,(item->>'parent_id')::uuid,
      NULL,NULL,NULL,NULL,NULL,NULL,item->>'position',
      coalesce((item->>'created_at')::timestamptz,now()),p_actor,p_actor,'human',
      item->>'encrypted_content',(item->>'encryption_version')::integer,
      (item->>'page_is_database')::boolean,
      (item->>'page_has_values')::boolean,
      (item->>'page_is_blank')::boolean,NULL);
    seen:=array_append(seen,(item->>'id')::uuid);
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    IF (item->>'page_id')::uuid = ANY(seen) THEN
      INSERT INTO public.page_files(id,project_id,page_id,storage_path,
        file_name,mime_type,size_bytes,created_by)
      VALUES((item->>'id')::uuid,p_project,(item->>'page_id')::uuid,
        item->>'storage_path',item->>'file_name',item->>'mime_type',
        (item->>'size_bytes')::bigint,p_actor);
    ELSE
      RAISE EXCEPTION 'File outside import' USING ERRCODE='22023';
    END IF;
  END LOOP;
  INSERT INTO public.page_database_imports(id,project_id,page_id,created_by,page_count)
    VALUES(p_request,p_project,p_page,p_actor,jsonb_array_length(p_pages)-1);
  -- The root's body was replaced without steps: open the collaboration gap
  -- in the same transaction (MIN-688), so no committed import can leave live
  -- editors rebasing onto a document they never received.
  PERFORM public.reset_page_collaboration(p_page);
  RETURN jsonb_build_object('count',jsonb_array_length(p_pages)-1,'replayed',false);
END;
$function$;

COMMIT;
