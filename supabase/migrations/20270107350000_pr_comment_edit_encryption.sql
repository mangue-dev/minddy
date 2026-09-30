BEGIN;

ALTER TABLE public.pr_comment_edits ADD COLUMN body_encryption_checked_at timestamptz;
CREATE INDEX pr_comment_edit_encryption_queue ON public.pr_comment_edits
  (body_encryption_checked_at NULLS FIRST,id);
CREATE TABLE public.pr_comment_edit_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pr_comment_edit_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pr_comment_edit_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pr_comment_edit_encryption_scope TO service_role;

CREATE FUNCTION public.guard_pr_comment_edit_body()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_version integer; new_version integer;
BEGIN
  IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'pr_comment_edit_id_immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.body LIKE 'mdye3:%' THEN
    IF NEW.body !~ '^mdye3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'pr_comment_edit_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := split_part(NEW.body,':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.body LIKE 'mdye3:%' THEN
      old_version := split_part(OLD.body,':',2)::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'pr_comment_edit_key_version_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.pr_comment_edit_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.pr_comment_edit_encryption_scope) AND
      (TG_OP='INSERT' OR NEW.body IS DISTINCT FROM OLD.body) THEN
    RAISE EXCEPTION 'pr_comment_edit_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pr_comment_edit_body_guard
  BEFORE INSERT OR UPDATE ON public.pr_comment_edits
  FOR EACH ROW EXECUTE FUNCTION public.guard_pr_comment_edit_body();
REVOKE ALL ON FUNCTION public.guard_pr_comment_edit_body()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_pr_comment_edit_body(
  p_id uuid,p_old_body text,p_new_body text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.pr_comment_edits;
BEGIN
  SELECT * INTO row FROM public.pr_comment_edits WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.body IS DISTINCT FROM p_old_body THEN RETURN false; END IF;
  IF p_new_body IS NULL THEN
    UPDATE public.pr_comment_edits SET body_encryption_checked_at=clock_timestamp()
      WHERE id=p_id;
  ELSE
    UPDATE public.pr_comment_edits SET body=p_new_body,
      body_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_pr_comment_edit_body(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_pr_comment_edit_body(uuid,text,text)
  TO service_role;

COMMIT;
