-- Run only on an isolated PostgreSQL database after the repository migration.
BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  connection uuid:=gen_random_uuid(); link uuid:=gen_random_uuid();
  pr uuid:=gen_random_uuid(); edit uuid:=gen_random_uuid();
  instance uuid:=gen_random_uuid(); claim uuid:=gen_random_uuid();
  clear_name text:='private/repository'; alias_name text:='private/previous';
  token text:='mdyr1:'||repeat('a',64);
  alias_token text:='mdyr1:'||repeat('b',64);
  renamed_token text:='mdyr1:'||repeat('c',64);
  cipher text:='{"format":3,"keyVersion":1,"payload":"YWJj"}';
  rejected boolean;
BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Forge identity fixture','FRI');
  INSERT INTO public.git_connections(id,user_id,provider)
    VALUES(connection,actor,'github');
  INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
    external_repo_id,repo_full_name,repo_owner,repo_name,repo_previous_names)
    VALUES(link,project,connection,'github','908172',clear_name,
      'private','repository',ARRAY[alias_name]);
  INSERT INTO public.pull_requests(id,provider,repo_full_name,number)
    VALUES(pr,'github',clear_name,91);
  INSERT INTO public.pull_request_syncs(provider,repo_full_name)
    VALUES('github',clear_name);
  INSERT INTO public.pr_comment_edits(id,provider,repo_full_name,pr_number,
    comment_id,body) VALUES(edit,'github',clear_name,91,1,cipher);
  INSERT INTO public.forge_relay_instances(id,name,public_key)
    VALUES(instance,'Forge identity fixture',gen_random_uuid()::text);
  INSERT INTO public.forge_relay_link_mirror(instance_id,provider,
    external_repo_id,repo_full_name)
    VALUES(instance,'github','908172',clear_name);
  INSERT INTO public.forge_relay_claims(id,instance_id,code_hash,status,
    installation_id,repository_full_name)
    VALUES(claim,instance,gen_random_uuid()::text,'claimed',908172,clear_name);
  IF public.activate_forge_repository_names() THEN
    RAISE EXCEPTION 'Activation accepted clear source and copies';
  END IF;
  INSERT INTO public.forge_repository_names(provider,token,
    full_name_ciphertext,encryption_version,encryption_checked_at)
    VALUES('github',token,cipher,1,now()),('github',alias_token,
      '{"format":3,"keyVersion":2,"payload":"YWJj"}',2,now());
  IF NOT public.migrate_forge_repository_name('project_git_links',link,
      'github',clear_name,token,ARRAY[alias_name],ARRAY[alias_token],
      'private','repository') OR
     public.migrate_forge_repository_name('project_git_links',link,
      'github',clear_name,token,ARRAY[alias_name],ARRAY[alias_token],
      'private','repository') THEN
    RAISE EXCEPTION 'Link name and alias CAS failed';
  END IF;
  IF NOT public.migrate_forge_repository_name('pull_requests',pr,
      'github',clear_name,token) OR
     NOT public.migrate_forge_repository_name('pull_request_syncs',NULL,
      'github',clear_name,token) OR
     NOT public.migrate_forge_repository_name('pr_comment_edits',edit,
      'github',clear_name,token) OR
     NOT public.migrate_forge_repository_name('forge_relay_link_mirror',instance,
      'github',clear_name,token,NULL,NULL,NULL,NULL,'908172') OR
     NOT public.migrate_forge_repository_name('forge_relay_claims',claim,
      'github',clear_name,token) THEN
    RAISE EXCEPTION 'Forge copy CAS failed';
  END IF;
  IF NOT public.activate_forge_repository_names() THEN
    RAISE EXCEPTION 'Complete forge identity conversion refused';
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_git_links WHERE id=link AND
      (repo_full_name<>token OR repo_owner IS NOT NULL OR repo_name IS NOT NULL
       OR repo_previous_names<>ARRAY[alias_token])) OR
     EXISTS(SELECT 1 FROM public.pull_requests WHERE id=pr AND
       repo_full_name<>token) OR
     EXISTS(SELECT 1 FROM public.pull_request_syncs WHERE provider='github' AND
       repo_full_name<>token) OR
     EXISTS(SELECT 1 FROM public.pr_comment_edits WHERE id=edit AND
       repo_full_name<>token) OR
     EXISTS(SELECT 1 FROM public.forge_relay_link_mirror
       WHERE instance_id=instance AND repo_full_name<>token) OR
     EXISTS(SELECT 1 FROM public.forge_relay_claims WHERE id=claim AND
       repository_full_name<>token) THEN
    RAISE EXCEPTION 'Forge identity source or copy remained clear';
  END IF;
  IF (SELECT count(*) FROM public.pull_requests p JOIN public.project_git_links l
      ON l.provider=p.provider AND l.repo_full_name=p.repo_full_name
      WHERE p.id=pr AND l.id=link)<>1 THEN
    RAISE EXCEPTION 'Opaque PR access projection lost its join';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.pull_requests SET repo_full_name=clear_name WHERE id=pr;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old PR writer accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.project_git_links SET repo_owner='private' WHERE id=link;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old link writer accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.pull_request_syncs SET repo_full_name=clear_name
      WHERE provider='github' AND repo_full_name=token;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old sync writer accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.pr_comment_edits SET repo_full_name=clear_name WHERE id=edit;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old PR history writer accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.forge_relay_link_mirror SET repo_full_name=clear_name
      WHERE instance_id=instance;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old relay mirror writer accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.forge_relay_claims SET repository_full_name=clear_name
      WHERE id=claim;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old relay claim writer accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.apply_forge_relay_link_sync(instance,1,
      '[{"event":"linked","provider":"github","repoId":"908172","repo":"private/repository"}]'::jsonb,
      NULL);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old relay RPC writer accepted'; END IF;
  INSERT INTO public.forge_repository_names(provider,token,
    full_name_ciphertext,encryption_version,encryption_checked_at)
    VALUES('github',renamed_token,cipher,1,now());
  IF NOT public.reconcile_forge_repository_name('github','908172',
      renamed_token,jsonb_build_array(jsonb_build_object('id',link,'old',token,
        'aliases',jsonb_build_array(alias_token,token)))) THEN
    RAISE EXCEPTION 'Atomic forge rename failed';
  END IF;
  IF (SELECT repo_full_name FROM public.project_git_links WHERE id=link)
       <>renamed_token OR
     (SELECT repo_full_name FROM public.pull_requests WHERE id=pr)
       <>renamed_token OR
     (SELECT repo_full_name FROM public.pr_comment_edits WHERE id=edit)
       <>renamed_token OR
     EXISTS(SELECT 1 FROM public.pull_request_syncs WHERE provider='github'
       AND repo_full_name=token) OR
     (SELECT count(*) FROM public.pull_requests p JOIN public.project_git_links l
       ON l.provider=p.provider AND l.repo_full_name=p.repo_full_name
       WHERE p.id=pr AND l.id=link)<>1 THEN
    RAISE EXCEPTION 'Atomic forge rename left a stale copy or projection';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_forge_repository_name(text,uuid,text,text,text,text[],text[],text,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Forge name migration has client execute privilege';
  END IF;
END;
$$;
ROLLBACK;
