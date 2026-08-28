-- Restore the guarded mutations from migration 20270106350000. The production
-- migration ledger contained that version while its database objects were
-- absent, so this forward-only migration reconciles the schema safely.

CREATE OR REPLACE FUNCTION public.purge_feedback_junk_guarded(
  p_ids uuid[],
  p_cutoff timestamptz
) RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_post public.feedback_posts%ROWTYPE;
BEGIN
  IF p_cutoff IS NULL THEN
    RETURN;
  END IF;

  -- Lock candidates in a stable order. A vote, issue link, or merged child
  -- that already holds a key/row lock finishes first; the following checks run
  -- in later statements and therefore observe its committed protection.
  FOR v_id IN
    SELECT DISTINCT candidate
    FROM pg_catalog.unnest(COALESCE(p_ids, ARRAY[]::uuid[])) AS candidate
    ORDER BY candidate
  LOOP
    v_post := NULL;
    SELECT * INTO v_post
    FROM public.feedback_posts
    WHERE id = v_id
    FOR UPDATE;

    IF v_post.id IS NULL
       OR v_post.deleted_at IS NOT NULL
       OR v_post.status <> 'spam'
       OR v_post.issue_id IS NOT NULL
       OR v_post.merged_into_id IS NOT NULL
       OR v_post.vote_count > 1
       OR v_post.created_at >= p_cutoff
       OR EXISTS (
      SELECT 1
      FROM public.feedback_posts AS merged
      WHERE merged.deleted_at IS NULL
          AND merged.merged_into_id = v_post.id
       ) THEN
      CONTINUE;
    END IF;

    DELETE FROM public.feedback_posts WHERE id = v_post.id;
    RETURN NEXT v_post.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_feedback_junk_guarded(uuid[], timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_feedback_junk_guarded(uuid[], timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.discard_blank_page_guarded(
  p_page_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_page public.pages%ROWTYPE;
  v_blocks jsonb;
  v_blank boolean;
BEGIN
  SELECT * INTO v_page
  FROM public.pages
  WHERE id = p_page_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_page.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
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
  IF pg_catalog.btrim(v_page.title) <> ''
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
$$;

REVOKE ALL ON FUNCTION public.discard_blank_page_guarded(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_blank_page_guarded(uuid)
  TO service_role;

-- Comment writes lock their page row. This makes them order with soft deletion:
-- a write that starts after deletion observes a non-live page and is refused;
-- a write that wins the lock finishes before the page enters the trash.
CREATE OR REPLACE FUNCTION public.guard_live_page_comment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_page_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.page_id ELSE NEW.page_id END;
  v_live boolean;
BEGIN
  -- A page hard-delete invokes this trigger through its cascading foreign key.
  -- The parent row is already being removed, so the cascade must pass through.
  IF TG_OP = 'DELETE' AND pg_catalog.pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  SELECT deleted_at IS NULL INTO v_live
  FROM public.pages
  WHERE id = v_page_id
  FOR UPDATE;

  IF v_live IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'page_not_live' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS page_comments_guard_live_page ON public.page_comments;
CREATE TRIGGER page_comments_guard_live_page
  BEFORE INSERT OR UPDATE OR DELETE ON public.page_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_live_page_comment_mutation();

DROP POLICY IF EXISTS page_comments_insert ON public.page_comments;
CREATE POLICY page_comments_insert ON public.page_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_project(project_id)
    AND author_id = (SELECT auth.uid())
    AND via_assistant = false
    AND via_mcp = false
    AND EXISTS (
      SELECT 1 FROM public.pages AS page
      WHERE page.id = page_comments.page_id
        AND page.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS page_comments_update ON public.page_comments;
CREATE POLICY page_comments_update ON public.page_comments
  FOR UPDATE TO authenticated
  USING (
    public.can_access_project(project_id)
    AND author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pages AS page
      WHERE page.id = page_comments.page_id
        AND page.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.can_access_project(project_id)
    AND author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pages AS page
      WHERE page.id = page_comments.page_id
        AND page.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS page_comments_delete ON public.page_comments;
CREATE POLICY page_comments_delete ON public.page_comments
  FOR DELETE TO authenticated
  USING (
    public.can_access_project(project_id)
    AND author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pages AS page
      WHERE page.id = page_comments.page_id
        AND page.deleted_at IS NULL
    )
  );

CREATE OR REPLACE FUNCTION public.upsert_view_share_guarded(
  p_view_id uuid,
  p_level text,
  p_token text,
  p_password_salt text,
  p_password_hash text,
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_share public.view_shares%ROWTYPE;
BEGIN
  IF p_view_id IS NULL
     OR p_level NOT IN ('password', 'public')
     OR NULLIF(p_token, '') IS NULL THEN
    RAISE EXCEPTION 'view_share_values_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('view-share:' || p_view_id::text, 462)
  );
  SELECT * INTO v_share
  FROM public.view_shares
  WHERE view_id = p_view_id
  FOR UPDATE;

  IF p_level = 'password' THEN
    IF p_password_salt IS NOT NULL AND p_password_hash IS NOT NULL THEN
      v_share.password_salt := p_password_salt;
      v_share.password_hash := p_password_hash;
    ELSIF v_share.id IS NULL
       OR v_share.password_salt IS NULL
       OR v_share.password_hash IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('status', 'password_required');
    END IF;
  ELSE
    v_share.password_salt := NULL;
    v_share.password_hash := NULL;
  END IF;

  IF v_share.id IS NULL THEN
    INSERT INTO public.view_shares (
      view_id, level, token, password_salt, password_hash, created_by
    ) VALUES (
      p_view_id, p_level, p_token,
      v_share.password_salt, v_share.password_hash, p_created_by
    )
    RETURNING * INTO v_share;
  ELSE
    UPDATE public.view_shares
    SET level = p_level,
        password_salt = v_share.password_salt,
        password_hash = v_share.password_hash
    WHERE id = v_share.id
    RETURNING * INTO v_share;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'ok',
    'share', pg_catalog.to_jsonb(v_share)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_view_share_guarded(
  uuid, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_view_share_guarded(
  uuid, text, text, text, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_view_share_guarded(
  p_view_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_share public.view_shares%ROWTYPE;
  v_domain public.custom_domains%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('view-share:' || p_view_id::text, 462)
  );
  SELECT * INTO v_share
  FROM public.view_shares
  WHERE view_id = p_view_id
  FOR UPDATE;

  IF v_share.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'absent');
  END IF;

  SELECT * INTO v_domain
  FROM public.custom_domains
  WHERE share_id = v_share.id
  FOR UPDATE;

  DELETE FROM public.view_shares WHERE id = v_share.id;
  RETURN pg_catalog.jsonb_build_object(
    'status', 'revoked',
    'share_id', v_share.id,
    'domain', CASE
      WHEN v_domain.id IS NULL THEN NULL
      ELSE pg_catalog.to_jsonb(v_domain)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_view_share_guarded(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_view_share_guarded(uuid)
  TO service_role;

-- Provider cleanup is always compare-and-delete. If another transaction has
-- already replaced the row, cleanup cannot remove the retained mapping.
CREATE OR REPLACE FUNCTION public.delete_custom_domain_if_current(
  p_id uuid,
  p_domain text
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH removed AS (
    DELETE FROM public.custom_domains
    WHERE id = p_id
      AND lower(domain) = lower(p_domain)
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM removed);
$$;

REVOKE ALL ON FUNCTION public.delete_custom_domain_if_current(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_custom_domain_if_current(uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
