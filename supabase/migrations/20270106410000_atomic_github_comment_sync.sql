-- Create or update a mirrored GitHub comment and its remote-identity sidecar
-- in one transaction, serialized by issue and remote comment identity.
CREATE OR REPLACE FUNCTION public.sync_github_issue_comment_atomic(
  p_issue_id uuid,
  p_remote_comment_id text,
  p_author_id uuid,
  p_body text,
  p_author_login text,
  p_author_association text,
  p_html_url text,
  p_created_at_remote timestamptz,
  p_updated_at_remote timestamptz,
  p_deleted_at_remote timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sync public.github_issue_comment_syncs%ROWTYPE;
  v_comment_id uuid;
BEGIN
  IF p_issue_id IS NULL OR p_remote_comment_id IS NULL OR p_remote_comment_id = ''
     OR p_author_id IS NULL OR p_body IS NULL THEN
    RAISE EXCEPTION 'github_comment_sync_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_issue_id::text || ':' || p_remote_comment_id,
      467
    )
  );
  SELECT * INTO v_sync
  FROM public.github_issue_comment_syncs
  WHERE issue_id = p_issue_id AND remote_comment_id = p_remote_comment_id
  FOR UPDATE;

  IF v_sync.comment_id IS NOT NULL
     AND v_sync.updated_at_remote IS NOT NULL
     AND p_updated_at_remote IS NOT NULL
     AND p_updated_at_remote < v_sync.updated_at_remote THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'stale', 'comment_id', v_sync.comment_id
    );
  END IF;

  IF v_sync.comment_id IS NULL THEN
    INSERT INTO public.comments (
      issue_id, author_id, body, created_at, updated_at
    ) VALUES (
      p_issue_id,
      p_author_id,
      p_body,
      COALESCE(p_created_at_remote, pg_catalog.clock_timestamp()),
      pg_catalog.clock_timestamp()
    ) RETURNING id INTO v_comment_id;
  ELSE
    v_comment_id := v_sync.comment_id;
    UPDATE public.comments
    SET body = p_body, updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_comment_id AND issue_id = p_issue_id;
  END IF;

  INSERT INTO public.github_issue_comment_syncs (
    remote_comment_id, issue_id, comment_id, author_login,
    author_association, html_url, created_at_remote, updated_at_remote,
    deleted_at_remote, synced_at
  ) VALUES (
    p_remote_comment_id, p_issue_id, v_comment_id, p_author_login,
    p_author_association, p_html_url, p_created_at_remote, p_updated_at_remote,
    p_deleted_at_remote, pg_catalog.clock_timestamp()
  )
  ON CONFLICT (remote_comment_id, issue_id) DO UPDATE
  SET author_login = EXCLUDED.author_login,
      author_association = EXCLUDED.author_association,
      html_url = EXCLUDED.html_url,
      created_at_remote = EXCLUDED.created_at_remote,
      updated_at_remote = EXCLUDED.updated_at_remote,
      deleted_at_remote = EXCLUDED.deleted_at_remote,
      synced_at = EXCLUDED.synced_at;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'synced', 'comment_id', v_comment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_github_issue_comment_atomic(
  uuid, text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_github_issue_comment_atomic(
  uuid, text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz
) TO service_role;
