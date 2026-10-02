-- MIN-591: stable opaque forge repository identity and recoverable name registry.
BEGIN;
CREATE TABLE public.forge_repository_names (
  provider text NOT NULL CHECK(provider IN ('github','gitlab')),
  token text NOT NULL CHECK(token ~ '^mdyr1:[0-9a-f]{64}$'),
  full_name_ciphertext text NOT NULL,
  encryption_version integer NOT NULL CHECK(encryption_version>0),
  encryption_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,token)
);
ALTER TABLE public.forge_repository_names ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_repository_names FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.forge_repository_names TO service_role;

CREATE TABLE public.forge_repository_name_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_repository_name_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_repository_name_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.forge_repository_name_scope TO service_role;

ALTER TABLE public.project_git_links ADD COLUMN repo_name_checked_at timestamptz;
ALTER TABLE public.pull_requests ADD COLUMN repo_name_checked_at timestamptz;
ALTER TABLE public.pull_request_syncs ADD COLUMN repo_name_checked_at timestamptz;
ALTER TABLE public.pr_comment_edits ADD COLUMN repo_name_checked_at timestamptz;
ALTER TABLE public.forge_relay_link_mirror ADD COLUMN repo_name_checked_at timestamptz;
ALTER TABLE public.forge_relay_claims ADD COLUMN repo_name_checked_at timestamptz;

CREATE FUNCTION public.guard_forge_repository_name_registry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payload jsonb;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.provider IS DISTINCT FROM OLD.provider OR
      NEW.token IS DISTINCT FROM OLD.token OR
      NEW.created_at IS DISTINCT FROM OLD.created_at OR
      NEW.encryption_version<OLD.encryption_version) THEN
    RAISE EXCEPTION 'forge_repository_name_binding_immutable' USING ERRCODE='23514';
  END IF;
  BEGIN payload:=NEW.full_name_ciphertext::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'forge_repository_name_ciphertext_invalid' USING ERRCODE='23514';
  END;
  IF COALESCE((payload->>'format')::integer=3,false) IS FALSE OR
     COALESCE((payload->>'keyVersion')::integer=NEW.encryption_version,false) IS FALSE THEN
    RAISE EXCEPTION 'forge_repository_name_ciphertext_invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_repository_name_registry_guard BEFORE INSERT OR UPDATE
  ON public.forge_repository_names FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_repository_name_registry();
REVOKE ALL ON FUNCTION public.guard_forge_repository_name_registry()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_forge_repository_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE name_value text; name_provider text; alias_name text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-repository-name-activation',591));
  IF NOT EXISTS(SELECT 1 FROM public.forge_repository_name_scope) THEN
    RETURN NEW;
  END IF;
  name_value:=COALESCE(to_jsonb(NEW)->>'repo_full_name',
    to_jsonb(NEW)->>'repository_full_name');
  name_provider:=COALESCE(to_jsonb(NEW)->>'provider','github');
  IF name_value IS NOT NULL AND name_value !~ '^mdyr1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'forge_repository_name_requires_index' USING ERRCODE='23514';
  END IF;
  IF name_value IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.forge_repository_names n
      WHERE n.provider=name_provider AND n.token=name_value) THEN
    RAISE EXCEPTION 'forge_repository_name_registry_missing' USING ERRCODE='23503';
  END IF;
  IF TG_TABLE_NAME='project_git_links' THEN
    IF NEW.repo_owner IS NOT NULL OR NEW.repo_name IS NOT NULL THEN
      RAISE EXCEPTION 'forge_repository_name_duplicate_clear' USING ERRCODE='23514';
    END IF;
    FOR alias_name IN SELECT unnest(NEW.repo_previous_names) LOOP
      IF alias_name !~ '^mdyr1:[0-9a-f]{64}$' OR NOT EXISTS(
          SELECT 1 FROM public.forge_repository_names n
          WHERE n.provider=name_provider AND n.token=alias_name) THEN
        RAISE EXCEPTION 'forge_repository_alias_requires_index' USING ERRCODE='23514';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_git_links_repository_identity_guard
  BEFORE INSERT OR UPDATE ON public.project_git_links FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_repository_identity();
CREATE TRIGGER pull_requests_repository_identity_guard
  BEFORE INSERT OR UPDATE ON public.pull_requests FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_repository_identity();
CREATE TRIGGER pull_request_syncs_repository_identity_guard
  BEFORE INSERT OR UPDATE ON public.pull_request_syncs FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_repository_identity();
CREATE TRIGGER pr_comment_edits_repository_identity_guard
  BEFORE INSERT OR UPDATE ON public.pr_comment_edits FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_repository_identity();
CREATE TRIGGER forge_relay_link_mirror_repository_identity_guard
  BEFORE INSERT OR UPDATE ON public.forge_relay_link_mirror FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_repository_identity();
CREATE TRIGGER forge_relay_claims_repository_identity_guard
  BEFORE INSERT OR UPDATE ON public.forge_relay_claims FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_repository_identity();
REVOKE ALL ON FUNCTION public.guard_forge_repository_identity()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_forge_repository_names()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-repository-name-activation',591));
  IF EXISTS(SELECT 1 FROM public.forge_repository_names
      WHERE encryption_checked_at IS NULL) THEN
    RETURN false;
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_git_links l WHERE
      l.repo_full_name IS NOT NULL AND l.repo_full_name !~ '^mdyr1:[0-9a-f]{64}$'
      OR l.repo_owner IS NOT NULL OR l.repo_name IS NOT NULL OR
      EXISTS(SELECT 1 FROM unnest(l.repo_previous_names) a
        WHERE a !~ '^mdyr1:[0-9a-f]{64}$')) OR
     EXISTS(SELECT 1 FROM public.pull_requests
       WHERE repo_full_name !~ '^mdyr1:[0-9a-f]{64}$') OR
     EXISTS(SELECT 1 FROM public.pull_request_syncs
       WHERE repo_full_name !~ '^mdyr1:[0-9a-f]{64}$') OR
     EXISTS(SELECT 1 FROM public.pr_comment_edits
       WHERE repo_full_name !~ '^mdyr1:[0-9a-f]{64}$') OR
     EXISTS(SELECT 1 FROM public.forge_relay_link_mirror
       WHERE repo_full_name !~ '^mdyr1:[0-9a-f]{64}$') OR
     EXISTS(SELECT 1 FROM public.forge_relay_claims WHERE
       repository_full_name IS NOT NULL AND
       repository_full_name !~ '^mdyr1:[0-9a-f]{64}$') THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT provider, repo_full_name AS token FROM public.project_git_links
      UNION ALL SELECT l.provider, aliases.token FROM public.project_git_links l,
        LATERAL unnest(l.repo_previous_names) AS aliases(token)
      UNION ALL SELECT provider, repo_full_name FROM public.pull_requests
      UNION ALL SELECT provider, repo_full_name FROM public.pull_request_syncs
      UNION ALL SELECT provider, repo_full_name FROM public.pr_comment_edits
      UNION ALL SELECT provider, repo_full_name FROM public.forge_relay_link_mirror
      UNION ALL SELECT 'github', repository_full_name FROM public.forge_relay_claims
    ) identities WHERE identities.token IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.forge_repository_names n WHERE
        n.provider=identities.provider AND n.token=identities.token
    )
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.forge_repository_name_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_forge_repository_names()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_forge_repository_names()
  TO service_role;

CREATE FUNCTION public.migrate_forge_repository_name(
  p_table text, p_id uuid, p_provider text, p_old text, p_new text,
  p_old_aliases text[] DEFAULT NULL, p_new_aliases text[] DEFAULT NULL,
  p_old_owner text DEFAULT NULL, p_old_repo text DEFAULT NULL,
  p_external_repo_id text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
  IF p_provider NOT IN ('github','gitlab') OR
     p_new IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.forge_repository_names WHERE provider=p_provider
         AND token=p_new) OR
     p_new_aliases IS NOT NULL AND EXISTS (
       SELECT 1 FROM unnest(p_new_aliases) AS names(token) WHERE NOT EXISTS (
         SELECT 1 FROM public.forge_repository_names n WHERE
           n.provider=p_provider AND n.token=names.token)) THEN
    RAISE EXCEPTION 'forge_repository_name_registry_missing' USING ERRCODE='23503';
  END IF;
  IF p_table='project_git_links' THEN
    UPDATE public.project_git_links SET repo_full_name=p_new,
      repo_owner=NULL,repo_name=NULL,repo_previous_names=p_new_aliases,
      repo_name_checked_at=clock_timestamp()
    WHERE id=p_id AND provider=p_provider AND repo_full_name IS NOT DISTINCT FROM p_old
      AND repo_owner IS NOT DISTINCT FROM p_old_owner
      AND repo_name IS NOT DISTINCT FROM p_old_repo
      AND repo_previous_names IS NOT DISTINCT FROM p_old_aliases;
  ELSIF p_table='pull_requests' THEN
    UPDATE public.pull_requests SET repo_full_name=p_new,
      repo_name_checked_at=clock_timestamp()
    WHERE id=p_id AND provider=p_provider AND repo_full_name=p_old;
  ELSIF p_table='pull_request_syncs' THEN
    UPDATE public.pull_request_syncs SET repo_full_name=p_new,
      repo_name_checked_at=clock_timestamp()
    WHERE provider=p_provider AND repo_full_name=p_old;
  ELSIF p_table='pr_comment_edits' THEN
    UPDATE public.pr_comment_edits SET repo_full_name=p_new,
      repo_name_checked_at=clock_timestamp()
    WHERE id=p_id AND provider=p_provider AND repo_full_name=p_old;
  ELSIF p_table='forge_relay_link_mirror' THEN
    UPDATE public.forge_relay_link_mirror SET repo_full_name=p_new,
      repo_name_checked_at=clock_timestamp()
    WHERE instance_id=p_id AND provider=p_provider AND
      external_repo_id=p_external_repo_id AND repo_full_name=p_old;
  ELSIF p_table='forge_relay_claims' THEN
    UPDATE public.forge_relay_claims SET repository_full_name=p_new,
      repo_name_checked_at=clock_timestamp()
    WHERE id=p_id AND repository_full_name IS NOT DISTINCT FROM p_old;
  ELSE
    RAISE EXCEPTION 'forge_repository_name_table_invalid' USING ERRCODE='22023';
  END IF;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_forge_repository_name(
  text,uuid,text,text,text,text[],text[],text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_forge_repository_name(
  text,uuid,text,text,text,text[],text[],text,text,text)
  TO service_role;

CREATE FUNCTION public.reconcile_forge_repository_name(
  p_provider text, p_external_repo_id text, p_new text, p_links jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE link_item jsonb; old_name text; alias_name text;
  old_pr record; twin_id uuid; twin_issue uuid; changed integer;
BEGIN
  IF p_provider NOT IN ('github','gitlab') OR p_external_repo_id IS NULL OR
     p_links IS NULL OR jsonb_typeof(p_links)<>'array' OR
     jsonb_array_length(p_links)=0 OR NOT EXISTS (
       SELECT 1 FROM public.forge_repository_names WHERE provider=p_provider
         AND token=p_new) THEN
    RAISE EXCEPTION 'forge_repository_rename_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider||':'||p_external_repo_id,591));
  FOR link_item IN SELECT value FROM jsonb_array_elements(p_links) LOOP
    old_name:=link_item->>'old';
    IF old_name IS NULL OR old_name=p_new THEN
      RAISE EXCEPTION 'forge_repository_rename_stale' USING ERRCODE='40001';
    END IF;
    FOR alias_name IN SELECT jsonb_array_elements_text(link_item->'aliases') LOOP
      IF NOT EXISTS(SELECT 1 FROM public.forge_repository_names WHERE
          provider=p_provider AND token=alias_name) THEN
        RAISE EXCEPTION 'forge_repository_alias_missing' USING ERRCODE='23503';
      END IF;
    END LOOP;
    PERFORM 1 FROM public.project_git_links WHERE id=(link_item->>'id')::uuid
      AND provider=p_provider AND external_repo_id=p_external_repo_id
      AND repo_full_name=old_name FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'forge_repository_rename_stale' USING ERRCODE='40001';
    END IF;
  END LOOP;
  FOR old_name IN SELECT DISTINCT value->>'old' FROM jsonb_array_elements(p_links) LOOP
    FOR old_pr IN SELECT id,number,issue_id FROM public.pull_requests WHERE
        provider=p_provider AND repo_full_name=old_name FOR UPDATE LOOP
      SELECT id,issue_id INTO twin_id,twin_issue FROM public.pull_requests
        WHERE provider=p_provider AND repo_full_name=p_new
          AND number=old_pr.number FOR UPDATE;
      IF twin_id IS NULL THEN
        UPDATE public.pull_requests SET repo_full_name=p_new WHERE id=old_pr.id;
      ELSE
        IF twin_issue IS NULL AND old_pr.issue_id IS NOT NULL THEN
          UPDATE public.pull_requests SET issue_id=old_pr.issue_id
            WHERE id=twin_id;
        END IF;
        DELETE FROM public.pull_requests WHERE id=old_pr.id;
      END IF;
      twin_id:=NULL;
    END LOOP;
    UPDATE public.pr_comment_edits SET repo_full_name=p_new WHERE
      provider=p_provider AND repo_full_name=old_name;
    DELETE FROM public.pull_request_syncs WHERE provider=p_provider AND
      repo_full_name=old_name;
  END LOOP;
  FOR link_item IN SELECT value FROM jsonb_array_elements(p_links) LOOP
    UPDATE public.project_git_links SET repo_full_name=p_new,
      repo_previous_names=ARRAY(SELECT jsonb_array_elements_text(
        link_item->'aliases')),repo_owner=NULL,repo_name=NULL,
      updated_at=clock_timestamp()
    WHERE id=(link_item->>'id')::uuid AND provider=p_provider
      AND external_repo_id=p_external_repo_id
      AND repo_full_name=(link_item->>'old');
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN
      RAISE EXCEPTION 'forge_repository_rename_stale' USING ERRCODE='40001';
    END IF;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_forge_repository_name(
  text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_forge_repository_name(
  text,text,text,jsonb) TO service_role;

-- The activation marker is inserted only after all old rows and copies have
-- passed the bounded conversion and a full plaintext-count verification.
COMMIT;
