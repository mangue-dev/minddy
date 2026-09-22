-- MIN-591: additive invitation email migration. Legacy rows have version 0.
-- The application backfills them before the plaintext column is removed.

ALTER TABLE public.project_invitations
  ALTER COLUMN invited_email DROP NOT NULL,
  ADD COLUMN invited_email_ciphertext text,
  ADD COLUMN invited_email_blind_index text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0;

ALTER TABLE public.project_invitations
  ADD CONSTRAINT project_invitations_email_encryption_state CHECK (
    (encryption_version = 0 AND invited_email IS NOT NULL
      AND invited_email_ciphertext IS NULL AND invited_email_blind_index IS NULL)
    OR
    (encryption_version > 0 AND invited_email IS NULL
      AND invited_email_ciphertext IS NOT NULL
      AND invited_email_blind_index IS NOT NULL)
    OR
    (status <> 'pending' AND invited_email IS NULL
      AND invited_email_ciphertext IS NULL
      AND invited_email_blind_index IS NULL)
  );

CREATE UNIQUE INDEX project_invitations_pending_email_blind_unique
  ON public.project_invitations (project_id, invited_email_blind_index)
  WHERE status = 'pending' AND invited_email_blind_index IS NOT NULL;

CREATE INDEX project_invitations_unclaimed_email_blind
  ON public.project_invitations (invited_email_blind_index)
  WHERE invited_user_id IS NULL AND status = 'pending';

CREATE FUNCTION public.create_project_invitation_encrypted_guarded(
  p_id uuid,
  p_project_id uuid,
  p_actor_id uuid,
  p_legacy_email text,
  p_email_ciphertext text,
  p_email_blind_index text,
  p_encryption_version integer,
  p_token_digest text,
  p_invited_user_id uuid DEFAULT NULL,
  p_member_limit integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid;
  v_used integer;
  v_invitation public.project_invitations%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_project_id IS NULL OR p_actor_id IS NULL
     OR p_encryption_version IS NULL OR p_encryption_version < 1
     OR length(p_email_ciphertext) < 1
     OR length(p_email_blind_index) <> 64
     OR p_token_digest IS NULL
     OR p_token_digest !~ '^sha256:[0-9a-f]{64}$'
     OR p_member_limit < 0 THEN
    RAISE EXCEPTION 'invalid_invitation_input' USING ERRCODE = '22023';
  END IF;

  v_owner_id := public.guard_project_actor(p_project_id, p_actor_id, true);

  IF p_invited_user_id = v_owner_id THEN
    RAISE EXCEPTION 'invitation_already_owner' USING ERRCODE = '23505';
  END IF;

  IF p_invited_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_invited_user_id
  ) THEN
    RAISE EXCEPTION 'invitation_already_member' USING ERRCODE = '23505';
  END IF;

  DELETE FROM public.project_invitations
  WHERE project_id = p_project_id
    AND status = 'pending' AND expires_at <= now()
    AND (invited_email_blind_index = p_email_blind_index
      OR (p_legacy_email IS NOT NULL AND invited_email = p_legacy_email));

  IF EXISTS (
    SELECT 1 FROM public.project_invitations
    WHERE project_id = p_project_id AND status = 'pending'
      AND (invited_email_blind_index = p_email_blind_index
        OR (p_legacy_email IS NOT NULL AND invited_email = p_legacy_email))
  ) THEN
    RAISE EXCEPTION 'invitation_already_pending' USING ERRCODE = '23505';
  END IF;

  IF p_member_limit IS NOT NULL THEN
    SELECT
      (SELECT count(*) FROM public.project_members WHERE project_id = p_project_id)
      +
      (SELECT count(*) FROM public.project_invitations
       WHERE project_id = p_project_id AND status = 'pending'
         AND expires_at > now())
    INTO v_used;

    IF v_used >= p_member_limit THEN
      RAISE EXCEPTION 'member_limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.project_invitations (
    id, project_id, invited_email, invited_email_ciphertext,
    invited_email_blind_index, encryption_version,
    invited_user_id, invited_by, status, token
  ) VALUES (
    p_id, p_project_id, NULL, p_email_ciphertext,
    p_email_blind_index, p_encryption_version,
    p_invited_user_id, p_actor_id, 'pending', p_token_digest
  ) RETURNING * INTO v_invitation;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_invitation.id,
    'project_id', v_invitation.project_id,
    'status', v_invitation.status,
    'created_at', v_invitation.created_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_project_invitation_encrypted_guarded(
  uuid, uuid, uuid, text, text, text, integer, text, uuid, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_invitation_encrypted_guarded(
  uuid, uuid, uuid, text, text, text, integer, text, uuid, integer
) TO service_role;

REVOKE ALL ON public.project_invitations FROM anon, authenticated;

-- Realtime is a separate disclosure path: the previous trigger broadcast the
-- complete row, including plaintext email and the bearer invitation token.
CREATE OR REPLACE FUNCTION public.broadcast_invitations_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitee uuid;
  v_project_id uuid;
  v_new public.project_invitations%ROWTYPE;
  v_old public.project_invitations%ROWTYPE;
BEGIN
  IF tg_op = 'DELETE' THEN
    v_invitee := old.invited_user_id;
    v_project_id := old.project_id;
    v_old := old;
  ELSE
    v_invitee := new.invited_user_id;
    v_project_id := new.project_id;
    v_new := new;
    IF tg_op = 'UPDATE' THEN
      v_old := old;
    END IF;
  END IF;
  v_new.invited_email := NULL;
  v_new.invited_email_ciphertext := NULL;
  v_new.invited_email_blind_index := NULL;
  v_new.invited_user_id := NULL;
  v_new.token := NULL;
  v_old.invited_email := NULL;
  v_old.invited_email_ciphertext := NULL;
  v_old.invited_email_blind_index := NULL;
  v_old.invited_user_id := NULL;
  v_old.token := NULL;
  PERFORM realtime.broadcast_changes(
    'project:' || v_project_id, tg_op, tg_op, tg_table_name, tg_table_schema,
    v_new, v_old
  );
  IF v_invitee IS NOT NULL THEN
    PERFORM realtime.broadcast_changes(
      'user:' || v_invitee, tg_op, tg_op, tg_table_name, tg_table_schema,
      v_new, v_old
    );
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.broadcast_invitations_row()
  FROM PUBLIC, anon, authenticated;
