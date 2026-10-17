-- MIN-693: project roles. The owner stays `projects.owner_id`; every other
-- person with access is a `member` (the unchanged baseline) or a `reader`
-- (read-only, optionally allowed to comment). See docs/security/project-roles.md.

-- 1. Membership and invitation shape. Existing rows are all 'member', so every
-- current member keeps exactly their access.
UPDATE public.project_members SET role = 'member' WHERE role IS DISTINCT FROM 'member';

ALTER TABLE public.project_members
  ADD COLUMN can_comment boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT project_members_role_ck CHECK (role IN ('member', 'reader')),
  ADD CONSTRAINT project_members_comment_ck CHECK (role = 'reader' OR can_comment = false);

ALTER TABLE public.project_invitations
  ADD COLUMN role text NOT NULL DEFAULT 'member',
  ADD COLUMN can_comment boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT project_invitations_role_ck CHECK (role IN ('member', 'reader')),
  ADD CONSTRAINT project_invitations_comment_ck CHECK (role = 'reader' OR can_comment = false);

-- 2. Permission audit. Written only by the transition functions below.
CREATE TABLE public.project_permission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('role_changed', 'ownership_transferred')),
  old_role text,
  new_role text,
  old_can_comment boolean,
  new_can_comment boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_permission_events_project
  ON public.project_permission_events (project_id, created_at DESC);
ALTER TABLE public.project_permission_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_permission_events FROM anon, authenticated;
GRANT ALL ON public.project_permission_events TO service_role;

-- 3. Role-aware helpers. `can_access_project` stays the READ rule.
CREATE OR REPLACE FUNCTION public.project_role(p_project_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE
    WHEN p.owner_id = p_user_id THEN 'owner'
    ELSE (SELECT m.role FROM public.project_members AS m
          WHERE m.project_id = p_project_id AND m.user_id = p_user_id)
  END
  FROM public.projects AS p
  WHERE p.id = p_project_id;
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(project_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_project_owner(project_uuid) OR EXISTS (
    SELECT 1 FROM public.project_members AS m
    WHERE m.project_id = project_uuid
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'member'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_comment_project(project_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_project_owner(project_uuid) OR EXISTS (
    SELECT 1 FROM public.project_members AS m
    WHERE m.project_id = project_uuid
      AND m.user_id = (SELECT auth.uid())
      AND (m.role = 'member' OR m.can_comment)
  );
$$;

-- A public comment on a feedback post is a team reply on the public board:
-- it needs write access, not the reader comment option.
CREATE OR REPLACE FUNCTION public.can_comment_on_parent(
  issue_uuid uuid, objective_uuid uuid, feedback_post_uuid uuid, is_public boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.issues AS i
    WHERE i.id = issue_uuid AND public.can_comment_project(i.project_id)
  ) OR EXISTS (
    SELECT 1 FROM public.objectives AS o
    WHERE o.id = objective_uuid AND public.can_comment_project(o.project_id)
  ) OR EXISTS (
    SELECT 1 FROM public.feedback_posts AS f
    WHERE f.id = feedback_post_uuid AND CASE
      WHEN is_public THEN public.can_write_project(f.project_id)
      ELSE public.can_comment_project(f.project_id)
    END
  );
$$;

REVOKE ALL ON FUNCTION public.project_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_role(uuid, uuid) TO service_role;
-- Policies call these helpers as the authenticated role; without EXECUTE the
-- whole policy raises instead of denying.
REVOKE ALL ON FUNCTION public.can_write_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_comment_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_comment_on_parent(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_comment_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_comment_on_parent(uuid, uuid, uuid, boolean)
  TO authenticated, service_role;

-- 4. Guarded RPC predicates. Non-owner mode of `guard_project_actor` serves
-- objective and category writes; `lock_live_project_actor_access` is only
-- called by page-content writes. Both now require write access.
CREATE OR REPLACE FUNCTION public.guard_project_actor(
  p_project_id uuid,
  p_actor_id uuid,
  p_owner_only boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id
  INTO v_owner_id
  FROM public.projects
  WHERE id = p_project_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_guard_forbidden' USING ERRCODE = '42501';
  END IF;

  -- Unchanged except for the role: a reader row does not grant writes.
  IF v_owner_id <> p_actor_id
     AND (
       p_owner_only
       OR NOT EXISTS (
         SELECT 1
         FROM public.project_members
         WHERE project_id = p_project_id
           AND user_id = p_actor_id
           AND role = 'member'
       )
     ) THEN
    RAISE EXCEPTION 'tenant_guard_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN v_owner_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lock_live_project_actor_access(
  p_project_id uuid, p_actor_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_project public.projects%ROWTYPE;
BEGIN
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO target_project
  FROM public.projects
  WHERE id = p_project_id
    AND deleted_at IS NULL
  FOR SHARE;

  IF target_project.id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'project-authority:' || p_project_id::text,
      5400
    )
  );

  RETURN target_project.owner_id = p_actor_id OR EXISTS (
    SELECT 1
    FROM public.project_members AS member
    WHERE member.project_id = p_project_id
      AND member.user_id = p_actor_id
      AND member.role = 'member'
  );
END;
$$;

-- 5. Write policies: content needs write access, comments the comment
-- capability. Read policies are unchanged.
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
CREATE POLICY "categories_insert" ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));
DROP POLICY IF EXISTS "categories_update" ON public.categories;
CREATE POLICY "categories_update" ON public.categories FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));
DROP POLICY IF EXISTS "categories_delete" ON public.categories;
CREATE POLICY "categories_delete" ON public.categories FOR DELETE TO authenticated
  USING (public.can_write_project(project_id));

DROP POLICY IF EXISTS "issues_insert" ON public.issues;
CREATE POLICY "issues_insert" ON public.issues FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id)
    AND created_by = (SELECT auth.uid()));
DROP POLICY IF EXISTS "issues_update" ON public.issues;
CREATE POLICY "issues_update" ON public.issues FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

DROP POLICY IF EXISTS "objectives_insert" ON public.objectives;
CREATE POLICY "objectives_insert" ON public.objectives FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));
DROP POLICY IF EXISTS "objectives_update" ON public.objectives;
CREATE POLICY "objectives_update" ON public.objectives FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

DROP POLICY IF EXISTS "pages_insert" ON public.pages;
CREATE POLICY "pages_insert" ON public.pages FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));
DROP POLICY IF EXISTS "pages_update" ON public.pages;
CREATE POLICY "pages_update" ON public.pages FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

DROP POLICY IF EXISTS "issue_relations_insert" ON public.issue_relations;
CREATE POLICY "issue_relations_insert" ON public.issue_relations FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id)
    AND created_by = (SELECT auth.uid()));
DROP POLICY IF EXISTS "issue_relations_delete" ON public.issue_relations;
CREATE POLICY "issue_relations_delete" ON public.issue_relations FOR DELETE TO authenticated
  USING (public.can_write_project(project_id));

DROP POLICY IF EXISTS "issue_categories_insert" ON public.issue_categories;
CREATE POLICY "issue_categories_insert" ON public.issue_categories FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.issues AS i
    WHERE i.id = issue_categories.issue_id AND public.can_write_project(i.project_id)));
DROP POLICY IF EXISTS "issue_categories_delete" ON public.issue_categories;
CREATE POLICY "issue_categories_delete" ON public.issue_categories FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.issues AS i
    WHERE i.id = issue_categories.issue_id AND public.can_write_project(i.project_id)));

-- A personal view inside a project stays available to readers; shared views
-- (user_id IS NULL) are project content.
DROP POLICY IF EXISTS "views_insert" ON public.views;
CREATE POLICY "views_insert" ON public.views FOR INSERT TO authenticated
  WITH CHECK (kind = 'custom' AND (
    (project_id IS NULL AND user_id = auth.uid())
    OR (project_id IS NOT NULL AND (
      (user_id = auth.uid() AND public.can_access_project(project_id))
      OR (user_id IS NULL AND public.can_write_project(project_id))))));
DROP POLICY IF EXISTS "views_update" ON public.views;
CREATE POLICY "views_update" ON public.views FOR UPDATE TO authenticated
  USING (kind <> 'my' AND (
    (project_id IS NULL AND user_id = auth.uid())
    OR (project_id IS NOT NULL AND (
      (user_id = auth.uid() AND public.can_access_project(project_id))
      OR (user_id IS NULL AND public.can_write_project(project_id))))))
  WITH CHECK (kind <> 'my' AND (
    (project_id IS NULL AND user_id = auth.uid())
    OR (project_id IS NOT NULL AND (
      (user_id = auth.uid() AND public.can_access_project(project_id))
      OR (user_id IS NULL AND public.can_write_project(project_id))))));
DROP POLICY IF EXISTS "views_delete" ON public.views;
CREATE POLICY "views_delete" ON public.views FOR DELETE TO authenticated
  USING (kind <> 'my' AND (
    (project_id IS NULL AND user_id = auth.uid())
    OR (project_id IS NOT NULL AND (
      (user_id = auth.uid() AND public.can_access_project(project_id))
      OR (user_id IS NULL AND public.can_write_project(project_id))))));

DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND via_assistant = false AND via_mcp = false
    AND public.can_comment_on_parent(issue_id, objective_id, feedback_post_id,
      visibility = 'public'));
DROP POLICY IF EXISTS "comments_update" ON public.comments;
CREATE POLICY "comments_update" ON public.comments FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid()) AND via_assistant = false
    AND public.can_comment_on_parent(issue_id, objective_id, feedback_post_id,
      visibility = 'public'))
  WITH CHECK (author_id = (SELECT auth.uid()) AND via_assistant = false
    AND public.can_comment_on_parent(issue_id, objective_id, feedback_post_id,
      visibility = 'public'));
DROP POLICY IF EXISTS "comments_delete" ON public.comments;
CREATE POLICY "comments_delete" ON public.comments FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid()) AND via_assistant = false
    AND public.can_comment_on_parent(issue_id, objective_id, feedback_post_id,
      visibility = 'public'));

DROP POLICY IF EXISTS page_comments_insert ON public.page_comments;
CREATE POLICY page_comments_insert ON public.page_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_comment_project(project_id)
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
  public.can_comment_project(project_id)
  AND author_id = (SELECT auth.uid())
  AND via_assistant = false
  AND EXISTS (
    SELECT 1 FROM public.pages AS page
    WHERE page.id = page_comments.page_id
      AND page.deleted_at IS NULL
  )
)
WITH CHECK (
  public.can_comment_project(project_id)
  AND author_id = (SELECT auth.uid())
  AND via_assistant = false
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
    public.can_comment_project(project_id)
    AND author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pages AS page
      WHERE page.id = page_comments.page_id
        AND page.deleted_at IS NULL
    )
  );

-- Comment attachments are the only upload a reader may make, so project
-- uploads require the comment capability (members and owners always have it).
DROP POLICY IF EXISTS "attachments insert" ON storage.objects;
CREATE POLICY "attachments insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attachments' AND
CASE (storage.foldername(name))[1]
  WHEN 'projects' THEN
    CASE
      WHEN ((storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND COALESCE((storage.foldername(name))[3], '') <> 'pages')
      THEN (public.can_comment_project(((storage.foldername(name))[2])::uuid)
        AND public.project_storage_quota_ok(((storage.foldername(name))[2])::uuid))
      ELSE false
    END
  WHEN 'chat' THEN
    CASE
      WHEN (storage.foldername(name))[2] = (SELECT (auth.uid())::text)
      THEN public.storage_quota_ok((SELECT auth.uid()))
      ELSE false
    END
  ELSE false
END);

-- 6. Invitations carry their role. Wrappers keep the existing creation
-- guards and set the role in the same transaction.
CREATE FUNCTION public.create_project_invitation_role_guarded(
  p_project_id uuid,
  p_actor_id uuid,
  p_invited_email text,
  p_invited_user_id uuid,
  p_member_limit integer,
  p_role text,
  p_can_comment boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_invitation jsonb;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('member', 'reader') THEN
    RAISE EXCEPTION 'invalid_invitation_role' USING ERRCODE = '22023';
  END IF;
  v_invitation := public.create_project_invitation_guarded(
    p_project_id, p_actor_id, p_invited_email, p_invited_user_id, p_member_limit);
  UPDATE public.project_invitations
  SET role = p_role, can_comment = p_role = 'reader' AND COALESCE(p_can_comment, false)
  WHERE id = (v_invitation->>'id')::uuid;
  RETURN v_invitation || pg_catalog.jsonb_build_object(
    'role', p_role,
    'can_comment', p_role = 'reader' AND COALESCE(p_can_comment, false));
END;
$$;

CREATE FUNCTION public.create_project_invitation_encrypted_role_guarded(
  p_id uuid,
  p_project_id uuid,
  p_actor_id uuid,
  p_legacy_email text,
  p_email_ciphertext text,
  p_email_blind_index text,
  p_encryption_version integer,
  p_token_digest text,
  p_invited_user_id uuid,
  p_member_limit integer,
  p_role text,
  p_can_comment boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_invitation jsonb;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('member', 'reader') THEN
    RAISE EXCEPTION 'invalid_invitation_role' USING ERRCODE = '22023';
  END IF;
  v_invitation := public.create_project_invitation_encrypted_guarded(
    p_id, p_project_id, p_actor_id, p_legacy_email, p_email_ciphertext,
    p_email_blind_index, p_encryption_version, p_token_digest,
    p_invited_user_id, p_member_limit);
  UPDATE public.project_invitations
  SET role = p_role, can_comment = p_role = 'reader' AND COALESCE(p_can_comment, false)
  WHERE id = p_id;
  RETURN v_invitation || pg_catalog.jsonb_build_object(
    'role', p_role,
    'can_comment', p_role = 'reader' AND COALESCE(p_can_comment, false));
END;
$$;

-- Change the role of a pending invitation (owner only).
CREATE FUNCTION public.update_project_invitation_role_guarded(
  p_project_id uuid,
  p_actor_id uuid,
  p_invitation_id uuid,
  p_role text,
  p_can_comment boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('member', 'reader') THEN
    RAISE EXCEPTION 'invalid_invitation_role' USING ERRCODE = '22023';
  END IF;
  PERFORM public.guard_project_actor(p_project_id, p_actor_id, true);
  UPDATE public.project_invitations
  SET role = p_role,
      can_comment = p_role = 'reader' AND COALESCE(p_can_comment, false),
      updated_at = now()
  WHERE id = p_invitation_id
    AND project_id = p_project_id
    AND status = 'pending'
    AND expires_at > now();
  RETURN FOUND;
END;
$$;

-- Acceptance applies the role stored on the invitation, under a row lock so
-- a concurrent role edit or cancellation cannot be bypassed, and never
-- overwrites an existing membership. The caller has already verified the
-- invited address against the session.
CREATE FUNCTION public.accept_project_invitation_guarded(
  p_invitation_id uuid,
  p_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_invitation public.project_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_invitation FROM public.project_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending'
     OR v_invitation.expires_at <= now()
     OR v_invitation.invited_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = v_invitation.project_id
      AND owner_id = v_invitation.invited_by
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'invitation_not_for_you' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.project_members (project_id, user_id, role, can_comment, added_by)
  VALUES (v_invitation.project_id, p_user_id, v_invitation.role,
    v_invitation.role = 'reader' AND v_invitation.can_comment, v_invitation.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  UPDATE public.project_invitations
  SET status = 'accepted', responded_at = now(), updated_at = now()
  WHERE id = p_invitation_id;

  RETURN v_invitation.project_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_project_invitation_guarded(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_project_invitation_guarded(uuid, uuid)
  TO service_role;

-- 7. Role change of an existing member (owner only). Demotion to reader
-- removes the person from assignments: they cannot work issues they cannot
-- edit, and cycle reads must never write to a project they can only read.
CREATE FUNCTION public.update_project_member_role_guarded(
  p_project_id uuid,
  p_actor_id uuid,
  p_user_id uuid,
  p_role text,
  p_can_comment boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
  v_member public.project_members%ROWTYPE;
  v_can_comment boolean;
  v_unassigned integer := 0;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('member', 'reader') THEN
    RAISE EXCEPTION 'invalid_member_role' USING ERRCODE = '22023';
  END IF;
  v_owner_id := public.guard_project_actor(p_project_id, p_actor_id, true);
  IF p_user_id = v_owner_id THEN
    RAISE EXCEPTION 'member_is_owner' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- The comment option is reader-only. Becoming a reader starts without it
  -- unless this change grants it; staying a reader keeps it unless changed.
  v_can_comment := CASE
    WHEN p_role <> 'reader' THEN false
    WHEN p_can_comment IS NOT NULL THEN p_can_comment
    WHEN v_member.role = 'reader' THEN v_member.can_comment
    ELSE false
  END;

  IF v_member.role = p_role AND v_member.can_comment = v_can_comment THEN
    RETURN pg_catalog.jsonb_build_object(
      'role', p_role, 'can_comment', v_can_comment, 'unassigned', 0);
  END IF;

  UPDATE public.project_members
  SET role = p_role, can_comment = v_can_comment
  WHERE project_id = p_project_id AND user_id = p_user_id;

  IF p_role = 'reader' AND v_member.role <> 'reader' THEN
    UPDATE public.issues
    SET assignee_id = NULL
    WHERE project_id = p_project_id
      AND assignee_id = p_user_id
      AND deleted_at IS NULL
      AND status IN ('triage', 'backlog', 'todo', 'in_progress', 'in_review');
    GET DIAGNOSTICS v_unassigned = ROW_COUNT;

    UPDATE public.objectives
    SET lead_user_id = NULL
    WHERE project_id = p_project_id
      AND lead_user_id = p_user_id;
  END IF;

  INSERT INTO public.project_permission_events (
    project_id, actor_id, target_user_id, kind,
    old_role, new_role, old_can_comment, new_can_comment
  ) VALUES (
    p_project_id, p_actor_id, p_user_id, 'role_changed',
    v_member.role, p_role, v_member.can_comment, v_can_comment
  );

  RETURN pg_catalog.jsonb_build_object(
    'role', p_role, 'can_comment', v_can_comment, 'unassigned', v_unassigned);
END;
$$;

-- 8. Ownership transfer. `owner_id` stays immutable except inside this
-- function, which sets a transaction-local marker the content guard accepts.
CREATE OR REPLACE FUNCTION public.guard_project_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean:=NEW.encryption_version>0 AND
  NEW.encrypted_content IS NOT NULL AND NEW.name IS NULL AND
  NEW.automations IS NULL AND NEW.smart_assign_rules IS NULL;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-content-activation',591));
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    IF NEW.id IS DISTINCT FROM OLD.id OR
        (NEW.owner_id IS DISTINCT FROM OLD.owner_id AND
          COALESCE(pg_catalog.current_setting('minddy.project_owner_transfer', true), '')
            <> OLD.id::text) THEN
      RAISE EXCEPTION 'project_content_scope_immutable'
        USING ERRCODE='23514';
    END IF;
    IF NEW.encryption_version<OLD.encryption_version OR
        OLD.encryption_version>0 AND NOT sealed THEN
      RAISE EXCEPTION 'project_content_downgrade' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      (NEW.encryption_version=0 AND NEW.encrypted_content IS NOT NULL) OR
      (NEW.encryption_version>0 AND NOT sealed) OR
      (sealed AND COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <>NEW.encryption_version,true)) THEN
    RAISE EXCEPTION 'project_content_state_invalid' USING ERRCODE='23514';
  END IF;
  IF sealed AND NEW.icon_url IS NOT NULL AND
      NEW.icon_url !~ ('^/api/projects/'||NEW.id::text||
        '/icon/content[?]v=[0-9]+$') THEN
    RAISE EXCEPTION 'project_content_external_icon_refused'
      USING ERRCODE='23514';
  END IF;
  IF NOT sealed AND EXISTS(
    SELECT 1 FROM public.project_content_encryption_scope) THEN
    RAISE EXCEPTION 'project_content_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.transfer_project_ownership_guarded(
  p_project_id uuid,
  p_actor_id uuid,
  p_new_owner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
  v_target public.project_members%ROWTYPE;
  v_disabled integer := 0;
BEGIN
  v_owner_id := public.guard_project_actor(p_project_id, p_actor_id, true);
  IF p_new_owner_id IS NULL OR p_new_owner_id = v_owner_id THEN
    RAISE EXCEPTION 'transfer_target_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_new_owner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.role <> 'member' THEN
    RAISE EXCEPTION 'transfer_target_not_member' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_new_owner_id;

  PERFORM pg_catalog.set_config('minddy.project_owner_transfer', p_project_id::text, true);
  -- The storage-owner trigger moves the project's bytes and refuses the
  -- transfer when the new owner's quota cannot hold them.
  UPDATE public.projects SET owner_id = p_new_owner_id WHERE id = p_project_id;
  PERFORM pg_catalog.set_config('minddy.project_owner_transfer', '', true);

  INSERT INTO public.project_members (project_id, user_id, role, can_comment, added_by)
  VALUES (p_project_id, v_owner_id, 'member', false, p_new_owner_id);

  -- Routines run as and are paid by their owner, who must be the project
  -- owner. The former owner's routines stop instead of moving spending.
  UPDATE public.agent_routines
  SET enabled = false
  WHERE project_id = p_project_id
    AND owner_id = v_owner_id
    AND enabled
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_disabled = ROW_COUNT;

  -- Acceptance requires the inviter to be the current owner; pending
  -- invitations stay valid under the new owner.
  UPDATE public.project_invitations
  SET invited_by = p_new_owner_id, updated_at = now()
  WHERE project_id = p_project_id AND status = 'pending';

  INSERT INTO public.project_permission_events (
    project_id, actor_id, target_user_id, kind, old_role, new_role
  ) VALUES (
    p_project_id, p_actor_id, p_new_owner_id, 'ownership_transferred', 'member', 'owner'
  );

  RETURN pg_catalog.jsonb_build_object(
    'owner_id', p_new_owner_id, 'disabled_routines', v_disabled);
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_invitation_role_guarded(
  uuid, uuid, text, uuid, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_invitation_role_guarded(
  uuid, uuid, text, uuid, integer, text, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.create_project_invitation_encrypted_role_guarded(
  uuid, uuid, uuid, text, text, text, integer, text, uuid, integer, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_invitation_encrypted_role_guarded(
  uuid, uuid, uuid, text, text, text, integer, text, uuid, integer, text, boolean)
  TO service_role;
REVOKE ALL ON FUNCTION public.update_project_invitation_role_guarded(
  uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_invitation_role_guarded(
  uuid, uuid, uuid, text, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.update_project_member_role_guarded(
  uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_member_role_guarded(
  uuid, uuid, uuid, text, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.transfer_project_ownership_guarded(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_project_ownership_guarded(uuid, uuid, uuid)
  TO service_role;

-- Direct role changes through PostgREST would skip the audit and the
-- unassignment above; members are changed only through these functions.
DROP POLICY IF EXISTS "project_members_update" ON public.project_members;
