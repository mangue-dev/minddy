-- Run on an isolated PostgreSQL database after the default-branch migration.
BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  connection uuid:=gen_random_uuid(); link uuid:=gen_random_uuid();
  old_branch text:='private/issue-591';
  cipher text:='mdyg3:2:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjJ9';
  rejected boolean;
BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Branch fixture','FBR');
  INSERT INTO public.git_connections(id,user_id,provider)
    VALUES(connection,actor,'github');
  INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
    external_repo_id,default_branch)
    VALUES(link,project,connection,'github','91717',old_branch);
  IF public.activate_forge_default_branches() THEN
    RAISE EXCEPTION 'Activation accepted a clear default branch';
  END IF;
  IF public.migrate_forge_default_branch(project,'stale',cipher) OR
     NOT public.migrate_forge_default_branch(project,old_branch,cipher) OR
     public.migrate_forge_default_branch(project,old_branch,cipher) THEN
    RAISE EXCEPTION 'Default branch CAS failed';
  END IF;
  IF NOT public.activate_forge_default_branches() THEN
    RAISE EXCEPTION 'Protected default branch activation failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_git_links WHERE id=link AND
      (default_branch LIKE '%private/issue%' OR
       default_branch_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'Default branch source or projection remained clear';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.project_git_links SET default_branch=old_branch WHERE id=link;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old branch writer accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.project_git_links(project_id,connection_id,provider,
      external_repo_id,default_branch)
      VALUES(gen_random_uuid(),connection,'github','91718',old_branch);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old branch insert accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_forge_default_branch(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Default branch migration has client execute privilege';
  END IF;
END;
$$;
ROLLBACK;
