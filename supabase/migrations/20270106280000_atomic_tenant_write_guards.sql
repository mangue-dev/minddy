-- Serialize tenant membership changes with service-role mutations that depend on
-- current membership. Project ownership changes already lock the projects row.
CREATE OR REPLACE FUNCTION public.lock_project_membership_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;

  PERFORM 1
  FROM public.projects
  WHERE id = v_project_id
  FOR UPDATE;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.lock_project_membership_scope()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS project_members_lock_project_scope ON public.project_members;
CREATE TRIGGER project_members_lock_project_scope
BEFORE INSERT OR UPDATE OR DELETE ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.lock_project_membership_scope();

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

  IF v_owner_id <> p_actor_id
     AND (
       p_owner_only
       OR NOT EXISTS (
         SELECT 1
         FROM public.project_members
         WHERE project_id = p_project_id
           AND user_id = p_actor_id
       )
     ) THEN
    RAISE EXCEPTION 'tenant_guard_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN v_owner_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_project_actor(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_objective_guarded(
  p_project_id uuid,
  p_actor_id uuid,
  p_values jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid;
  v_lead_user_id uuid;
  v_objective public.objectives%ROWTYPE;
BEGIN
  IF p_values IS NULL
     OR jsonb_typeof(p_values) <> 'object'
     OR p_values - ARRAY[
       'name', 'description', 'status', 'lead_user_id', 'target_date', 'color'
     ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'objective_values_invalid' USING ERRCODE = '22023';
  END IF;

  v_owner_id := public.guard_project_actor(p_project_id, p_actor_id, false);
  v_lead_user_id := NULLIF(p_values->>'lead_user_id', '')::uuid;

  IF v_lead_user_id IS NOT NULL
     AND v_lead_user_id <> v_owner_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.project_members
       WHERE project_id = p_project_id
         AND user_id = v_lead_user_id
     ) THEN
    RAISE EXCEPTION 'objective_lead_forbidden' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.objectives (
    project_id,
    name,
    description,
    status,
    lead_user_id,
    target_date,
    color
  )
  VALUES (
    p_project_id,
    p_values->>'name',
    p_values->>'description',
    COALESCE(p_values->>'status', 'planned'),
    v_lead_user_id,
    NULLIF(p_values->>'target_date', '')::timestamptz,
    p_values->>'color'
  )
  RETURNING * INTO v_objective;

  RETURN to_jsonb(v_objective);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_objective_guarded(
  p_objective_id uuid,
  p_actor_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_project_id uuid;
  v_owner_id uuid;
  v_lead_user_id uuid;
  v_before public.objectives%ROWTYPE;
  v_after public.objectives%ROWTYPE;
BEGIN
  IF p_updates IS NULL
     OR jsonb_typeof(p_updates) <> 'object'
     OR p_updates = '{}'::jsonb
     OR p_updates - ARRAY[
       'name', 'description', 'status', 'lead_user_id', 'target_date', 'color'
     ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'objective_values_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT project_id
  INTO v_project_id
  FROM public.objectives
  WHERE id = p_objective_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'objective_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_owner_id := public.guard_project_actor(v_project_id, p_actor_id, false);

  SELECT *
  INTO v_before
  FROM public.objectives
  WHERE id = p_objective_id
    AND project_id = v_project_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'objective_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_updates ? 'lead_user_id' THEN
    v_lead_user_id := NULLIF(p_updates->>'lead_user_id', '')::uuid;
    IF v_lead_user_id IS NOT NULL
       AND v_lead_user_id <> v_owner_id
       AND NOT EXISTS (
         SELECT 1
         FROM public.project_members
         WHERE project_id = v_project_id
           AND user_id = v_lead_user_id
       ) THEN
      RAISE EXCEPTION 'objective_lead_forbidden' USING ERRCODE = '23503';
    END IF;
  END IF;

  UPDATE public.objectives
  SET
    name = CASE WHEN p_updates ? 'name' THEN p_updates->>'name' ELSE name END,
    description = CASE
      WHEN p_updates ? 'description' THEN p_updates->>'description'
      ELSE description
    END,
    status = CASE WHEN p_updates ? 'status' THEN p_updates->>'status' ELSE status END,
    lead_user_id = CASE
      WHEN p_updates ? 'lead_user_id' THEN v_lead_user_id
      ELSE lead_user_id
    END,
    target_date = CASE
      WHEN p_updates ? 'target_date'
        THEN NULLIF(p_updates->>'target_date', '')::timestamptz
      ELSE target_date
    END,
    color = CASE WHEN p_updates ? 'color' THEN p_updates->>'color' ELSE color END
  WHERE id = p_objective_id
  RETURNING * INTO v_after;

  RETURN jsonb_build_object(
    'previous', to_jsonb(v_before),
    'objective', to_jsonb(v_after)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_objective_guarded(
  p_objective_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id
  INTO v_project_id
  FROM public.objectives
  WHERE id = p_objective_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'objective_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.guard_project_actor(v_project_id, p_actor_id, false);

  UPDATE public.objectives
  SET deleted_at = COALESCE(deleted_at, now()),
      deleted_by = CASE WHEN deleted_at IS NULL THEN p_actor_id ELSE deleted_by END
  WHERE id = p_objective_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_project_invitation_guarded(
  p_project_id uuid,
  p_actor_id uuid,
  p_invited_email text,
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
  IF p_member_limit IS NOT NULL AND p_member_limit < 0 THEN
    RAISE EXCEPTION 'member_limit_invalid' USING ERRCODE = '22023';
  END IF;

  v_owner_id := public.guard_project_actor(p_project_id, p_actor_id, true);

  IF p_invited_user_id = v_owner_id THEN
    RAISE EXCEPTION 'invitation_already_owner' USING ERRCODE = '23505';
  END IF;

  IF p_invited_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.project_members
       WHERE project_id = p_project_id
         AND user_id = p_invited_user_id
     ) THEN
    RAISE EXCEPTION 'invitation_already_member' USING ERRCODE = '23505';
  END IF;

  DELETE FROM public.project_invitations
  WHERE project_id = p_project_id
    AND invited_email = p_invited_email
    AND status = 'pending'
    AND expires_at <= now();

  IF p_member_limit IS NOT NULL THEN
    SELECT
      (SELECT count(*) FROM public.project_members WHERE project_id = p_project_id)
      +
      (SELECT count(*)
       FROM public.project_invitations
       WHERE project_id = p_project_id
         AND status = 'pending'
         AND expires_at > now())
    INTO v_used;

    IF v_used >= p_member_limit THEN
      RAISE EXCEPTION 'member_limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.project_invitations (
    project_id,
    invited_email,
    invited_user_id,
    invited_by,
    status
  )
  VALUES (
    p_project_id,
    p_invited_email,
    p_invited_user_id,
    p_actor_id,
    'pending'
  )
  RETURNING * INTO v_invitation;

  RETURN to_jsonb(v_invitation);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_objective_guarded(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_objective_guarded(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_objective_guarded(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_project_invitation_guarded(uuid, uuid, text, uuid, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_objective_guarded(uuid, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.update_objective_guarded(uuid, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_objective_guarded(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_project_invitation_guarded(uuid, uuid, text, uuid, integer)
  TO service_role;

-- Invitation insertion must go through the cap-aware server RPC. Reads and
-- owner/invitee response updates retain their existing RLS policies.
DROP POLICY IF EXISTS project_invitations_insert ON public.project_invitations;
REVOKE INSERT ON TABLE public.project_invitations FROM anon, authenticated;
