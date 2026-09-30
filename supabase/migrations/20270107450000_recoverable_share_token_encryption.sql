BEGIN;

ALTER TABLE public.view_shares
  ADD COLUMN token_lookup text,
  ADD COLUMN content_encryption_checked_at timestamptz;
CREATE UNIQUE INDEX view_shares_token_lookup_unique
  ON public.view_shares(token_lookup) WHERE token_lookup IS NOT NULL;
CREATE INDEX view_shares_token_content_queue ON public.view_shares
  (content_encryption_checked_at NULLS FIRST,id);
CREATE TABLE public.view_share_token_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.view_share_token_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.view_share_token_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.view_share_token_encryption_scope TO service_role;

CREATE FUNCTION public.guard_view_share_token()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; old_version integer; new_version integer;
BEGIN
  IF TG_OP='UPDATE' AND
      (NEW.view_id IS DISTINCT FROM OLD.view_id OR
       NEW.page_id IS DISTINCT FROM OLD.page_id) THEN
    RAISE EXCEPTION 'share_target_immutable' USING ERRCODE='23514';
  END IF;
  active := EXISTS (SELECT 1 FROM public.view_share_token_encryption_scope)
    OR NEW.token LIKE 'mdys3:%';
  IF NEW.token LIKE 'mdys3:%' THEN
    IF NEW.token !~ '^mdys3:[1-9][0-9]*:[A-Za-z0-9_-]+$' OR
        NEW.token_lookup IS NULL OR
        NEW.token_lookup !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'share_token_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := split_part(NEW.token,':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.token LIKE 'mdys3:%' THEN
      old_version := split_part(OLD.token,':',2)::integer;
      IF new_version<old_version THEN
        RAISE EXCEPTION 'share_token_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.view_share_token_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF active AND (TG_OP='INSERT' OR NEW.token IS DISTINCT FROM OLD.token) THEN
    RAISE EXCEPTION 'share_token_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER view_share_token_guard
  BEFORE INSERT OR UPDATE ON public.view_shares FOR EACH ROW
  EXECUTE FUNCTION public.guard_view_share_token();
REVOKE ALL ON FUNCTION public.guard_view_share_token()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_view_share_token(
  p_id uuid,p_old_token text,p_new_token text,p_token_lookup text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.view_shares;
BEGIN
  SELECT * INTO row FROM public.view_shares WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.token IS DISTINCT FROM p_old_token THEN RETURN false; END IF;
  UPDATE public.view_shares SET token=p_new_token,
    token_lookup=p_token_lookup,
    content_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_view_share_token(uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_view_share_token(uuid,text,text,text)
  TO service_role;

-- Preserve the original row lock and password-update contract. The application
-- supplies a stable UUID so ciphertext is bound to the eventual inserted row.
CREATE FUNCTION public.upsert_view_share_guarded_protected(
  p_id uuid,p_view_id uuid,p_level text,p_token_cipher text,
  p_token_lookup text,p_password_salt text,p_password_hash text,
  p_created_by uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_share public.view_shares%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_view_id IS NULL OR
      p_level NOT IN ('password','public') OR
      p_token_cipher !~ '^mdys3:[1-9][0-9]*:[A-Za-z0-9_-]+$' OR
      p_token_lookup !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'view_share_values_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('view-share:'||p_view_id::text,462));
  SELECT * INTO v_share FROM public.view_shares WHERE view_id=p_view_id FOR UPDATE;
  IF p_level='password' THEN
    IF p_password_salt IS NOT NULL AND p_password_hash IS NOT NULL THEN
      v_share.password_salt := p_password_salt;
      v_share.password_hash := p_password_hash;
    ELSIF v_share.id IS NULL OR v_share.password_salt IS NULL OR
        v_share.password_hash IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('status','password_required');
    END IF;
  ELSE
    v_share.password_salt := NULL;
    v_share.password_hash := NULL;
  END IF;
  IF v_share.id IS NULL THEN
    INSERT INTO public.view_shares(id,view_id,level,token,token_lookup,
      password_salt,password_hash,created_by)
    VALUES(p_id,p_view_id,p_level,p_token_cipher,p_token_lookup,
      v_share.password_salt,v_share.password_hash,p_created_by)
    RETURNING * INTO v_share;
  ELSE
    UPDATE public.view_shares SET level=p_level,
      password_salt=v_share.password_salt,password_hash=v_share.password_hash
    WHERE id=v_share.id RETURNING * INTO v_share;
  END IF;
  RETURN pg_catalog.jsonb_build_object('status','ok',
    'share',pg_catalog.to_jsonb(v_share));
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_view_share_guarded_protected(
  uuid,uuid,text,text,text,text,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_view_share_guarded_protected(
  uuid,uuid,text,text,text,text,text,uuid) TO service_role;

COMMIT;
