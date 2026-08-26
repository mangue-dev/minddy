-- A thread delete must capture the attachment rows that its cascade will
-- remove. Locking every comment in the thread first makes the capture order
-- with concurrent reply and attachment inserts through their foreign keys.

CREATE OR REPLACE FUNCTION public.delete_comment_thread_atomic(
  p_comment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_root_id uuid;
  v_target public.comments%ROWTYPE;
  v_deleted_id uuid;
  v_paths text[] := ARRAY[]::text[];
BEGIN
  IF p_comment_id IS NULL
     OR (v_actor_id IS NULL AND auth.role() IS DISTINCT FROM 'service_role') THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'storage_paths', pg_catalog.to_jsonb(v_paths)
    );
  END IF;

  -- Resolve without locking, then always acquire the root first. Stable lock
  -- order prevents two reply/root deletions from deadlocking each other.
  SELECT COALESCE(c.parent_id, c.id)
  INTO v_root_id
  FROM public.comments AS c
  WHERE c.id = p_comment_id;

  IF v_root_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'storage_paths', pg_catalog.to_jsonb(v_paths)
    );
  END IF;

  PERFORM c.id
  FROM public.comments AS c
  WHERE c.id = v_root_id
  FOR UPDATE;

  -- The target may have disappeared while the root lock was pending.
  v_target := NULL;
  SELECT c.*
  INTO v_target
  FROM public.comments AS c
  WHERE c.id = p_comment_id
    AND COALESCE(c.parent_id, c.id) = v_root_id;

  IF v_target.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'storage_paths', pg_catalog.to_jsonb(v_paths)
    );
  END IF;

  -- Authenticated calls retain the route's author-only/RLS semantics. The
  -- service role is used only by explicitly guarded feedback moderation.
  IF v_actor_id IS NOT NULL AND (
    v_target.author_id IS DISTINCT FROM v_actor_id
    OR v_target.via_assistant
    OR NOT public.can_access_comment_parent(
      v_target.issue_id,
      v_target.objective_id,
      v_target.feedback_post_id
    )
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'storage_paths', pg_catalog.to_jsonb(v_paths)
    );
  END IF;

  IF p_comment_id = v_root_id THEN
    PERFORM c.id
    FROM public.comments AS c
    WHERE c.id = v_root_id OR c.parent_id = v_root_id
    ORDER BY c.id
    FOR UPDATE;
  ELSE
    PERFORM c.id
    FROM public.comments AS c
    WHERE c.id = p_comment_id
    FOR UPDATE;
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT attachment.storage_path ORDER BY attachment.storage_path),
    ARRAY[]::text[]
  )
  INTO v_paths
  FROM public.attachments AS attachment
  WHERE attachment.storage_path IS NOT NULL
    AND (
      attachment.comment_id = p_comment_id
      OR (
        p_comment_id = v_root_id
        AND attachment.comment_id IN (
          SELECT reply.id
          FROM public.comments AS reply
          WHERE reply.parent_id = v_root_id
        )
      )
    );

  DELETE FROM public.comments
  WHERE id = p_comment_id
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'storage_paths', pg_catalog.to_jsonb(ARRAY[]::text[])
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'deleted',
    'storage_paths', pg_catalog.to_jsonb(v_paths)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_comment_thread_atomic(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_comment_thread_atomic(uuid)
  TO authenticated, service_role;
