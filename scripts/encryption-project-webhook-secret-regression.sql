\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE owner uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  connection uuid:=gen_random_uuid(); link uuid:=gen_random_uuid();
  cipher text:='{"format":3,"keyVersion":1,"data":"opaque"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner);
  INSERT INTO public.projects(id,key,owner_id,name)
    VALUES(project,'HOOK',owner,'Private project');
  INSERT INTO public.git_connections(id,user_id,provider)
    VALUES(connection,owner,'gitlab');
  INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
    external_repo_id,webhook_secret_encrypted)
    VALUES(link,project,connection,'gitlab','42','not-json');
  IF public.activate_project_git_webhook_secrets() THEN
    RAISE EXCEPTION 'Malformed project hook secret activated';
  END IF;
  UPDATE public.project_git_links SET webhook_secret_encrypted=
    '{"__encrypted":true}' WHERE id=link;
  IF public.activate_project_git_webhook_secrets() THEN
    RAISE EXCEPTION 'Legacy project hook secret activated';
  END IF;
  UPDATE public.project_git_links SET webhook_secret_encrypted=cipher
    WHERE id=link;
  IF NOT public.activate_project_git_webhook_secrets() THEN
    RAISE EXCEPTION 'Verified project hook secret refused activation';
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_git_links
      WHERE id=link AND (webhook_secret_encrypted LIKE '%Private project%'
        OR webhook_secret_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'Project hook source retained plaintext';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.project_git_links SET webhook_secret_encrypted=
      '{"__encrypted":true}' WHERE id=link;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old hook writer accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.project_git_links SET webhook_secret_encrypted=NULL
      WHERE id=link;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Secret downgrade to null accepted'; END IF;
  UPDATE public.project_git_links SET issue_sync_enabled=true WHERE id=link;
  IF NOT EXISTS(SELECT 1 FROM public.project_git_links WHERE id=link
      AND issue_sync_enabled AND webhook_secret_encrypted=cipher) THEN
    RAISE EXCEPTION 'Metadata update changed encrypted hook secret';
  END IF;
  IF has_function_privilege('authenticated',
      'public.activate_project_git_webhook_secrets()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate project hook secrets';
  END IF;
END;
$test$;
ROLLBACK;
