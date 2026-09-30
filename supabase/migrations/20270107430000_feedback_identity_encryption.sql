BEGIN;

ALTER TABLE public.feedback_users
  ADD COLUMN email_lookup text,
  ADD COLUMN external_id_lookup text,
  ADD COLUMN content_encryption_checked_at timestamptz;
CREATE UNIQUE INDEX feedback_users_project_email_lookup
  ON public.feedback_users(project_id,email_lookup)
  WHERE email_lookup IS NOT NULL;
CREATE UNIQUE INDEX feedback_users_project_external_lookup
  ON public.feedback_users(project_id,external_id_lookup)
  WHERE external_id_lookup IS NOT NULL;
CREATE INDEX feedback_users_content_queue ON public.feedback_users
  (content_encryption_checked_at NULLS FIRST,id);

ALTER TABLE public.feedback_otp_codes
  ADD COLUMN email_lookup text,
  ADD COLUMN content_encryption_checked_at timestamptz;
CREATE INDEX feedback_otp_board_lookup ON public.feedback_otp_codes
  (board_id,email_lookup,created_at DESC);
CREATE INDEX feedback_otp_lookup_created ON public.feedback_otp_codes
  (email_lookup,created_at DESC);
CREATE INDEX feedback_otp_content_queue ON public.feedback_otp_codes
  (content_encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.feedback_identity_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_identity_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_identity_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.feedback_identity_encryption_scope TO service_role;

CREATE FUNCTION public.guard_feedback_private_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE field text; old_value text; new_value text; active boolean;
  old_version integer; new_version integer; lookup_value text;
BEGIN
  IF TG_TABLE_NAME='feedback_users' AND TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)->>'project_id') IS DISTINCT FROM
        (to_jsonb(OLD)->>'project_id') THEN
      RAISE EXCEPTION 'feedback_identity_project_immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  active := EXISTS (SELECT 1 FROM public.feedback_identity_encryption_scope)
    OR (to_jsonb(NEW)->>'email') LIKE 'mdyf3:'||'%'
    OR (TG_TABLE_NAME='feedback_users' AND
      ((to_jsonb(NEW)->>'name') LIKE 'mdyf3:'||'%' OR
       (to_jsonb(NEW)->>'external_id') LIKE 'mdyf3:'||'%'));
  FOREACH field IN ARRAY CASE WHEN TG_TABLE_NAME='feedback_users'
      THEN ARRAY['email','name','external_id'] ELSE ARRAY['email'] END LOOP
    new_value := to_jsonb(NEW)->>field;
    old_value := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>field ELSE NULL END;
    IF new_value LIKE 'mdyf3:%' THEN
      IF new_value !~ '^mdyf3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'feedback_identity_ciphertext_invalid' USING ERRCODE='23514';
      END IF;
      new_version := split_part(new_value,':',2)::integer;
      IF old_value LIKE 'mdyf3:%' THEN
        old_version := split_part(old_value,':',2)::integer;
        IF new_version<old_version THEN
          RAISE EXCEPTION 'feedback_identity_key_rollback' USING ERRCODE='23514';
        END IF;
      END IF;
    ELSIF new_value IS NOT NULL AND active AND
        (TG_OP='INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      RAISE EXCEPTION 'feedback_identity_requires_encryption' USING ERRCODE='23514';
    END IF;
    IF field IN ('email','external_id') AND new_value IS NOT NULL AND
        new_value LIKE 'mdyf3:%' THEN
      lookup_value := to_jsonb(NEW)->>(field||'_lookup');
      IF lookup_value IS NULL OR lookup_value !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'feedback_identity_lookup_required' USING ERRCODE='23514';
      END IF;
    END IF;
  END LOOP;
  IF (to_jsonb(NEW)->>'email') LIKE 'mdyf3:%' OR
      (TG_TABLE_NAME='feedback_users' AND
        ((to_jsonb(NEW)->>'name') LIKE 'mdyf3:%' OR
         (to_jsonb(NEW)->>'external_id') LIKE 'mdyf3:%')) THEN
    INSERT INTO public.feedback_identity_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_users_identity_guard
  BEFORE INSERT OR UPDATE ON public.feedback_users FOR EACH ROW
  EXECUTE FUNCTION public.guard_feedback_private_identity();
CREATE TRIGGER feedback_otp_identity_guard
  BEFORE INSERT OR UPDATE ON public.feedback_otp_codes FOR EACH ROW
  EXECUTE FUNCTION public.guard_feedback_private_identity();
REVOKE ALL ON FUNCTION public.guard_feedback_private_identity()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_feedback_user_identity(
  p_id uuid,p_old_email text,p_old_name text,p_old_external text,
  p_new_email text,p_new_name text,p_new_external text,
  p_email_lookup text,p_external_lookup text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.feedback_users;
BEGIN
  SELECT * INTO row FROM public.feedback_users WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.email IS DISTINCT FROM p_old_email OR
      row.name IS DISTINCT FROM p_old_name OR
      row.external_id IS DISTINCT FROM p_old_external THEN RETURN false; END IF;
  UPDATE public.feedback_users SET
    email=COALESCE(p_new_email,row.email),
    name=COALESCE(p_new_name,row.name),
    external_id=COALESCE(p_new_external,row.external_id),
    email_lookup=COALESCE(p_email_lookup,row.email_lookup),
    external_id_lookup=COALESCE(p_external_lookup,row.external_id_lookup),
    content_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_feedback_user_identity(
  uuid,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_feedback_user_identity(
  uuid,text,text,text,text,text,text,text,text) TO service_role;

CREATE FUNCTION public.migrate_feedback_otp_email(
  p_id uuid,p_old_email text,p_new_email text,p_email_lookup text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.feedback_otp_codes;
BEGIN
  SELECT * INTO row FROM public.feedback_otp_codes WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.email IS DISTINCT FROM p_old_email THEN RETURN false; END IF;
  UPDATE public.feedback_otp_codes SET email=p_new_email,
    email_lookup=p_email_lookup,
    content_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_feedback_otp_email(uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_feedback_otp_email(uuid,text,text,text)
  TO service_role;

COMMIT;
