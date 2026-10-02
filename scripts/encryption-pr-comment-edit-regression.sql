\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE legacy uuid := gen_random_uuid(); newer uuid := gen_random_uuid();
  old_body text := 'Private issue-derived PR comment';
  cipher text := 'mdye3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  rejected boolean;
BEGIN
  INSERT INTO public.pr_comment_edits(id,provider,repo_full_name,pr_number,
    comment_id,body) VALUES(legacy,'github','private/repo',1,77,old_body);
  IF NOT public.migrate_pr_comment_edit_body(legacy,old_body,cipher) OR
     public.migrate_pr_comment_edit_body(legacy,old_body,cipher) THEN
    RAISE EXCEPTION 'PR comment edit CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pr_comment_edits WHERE id=legacy AND
      body LIKE '%Private issue%') THEN
    RAISE EXCEPTION 'PR comment edit source remains clear';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.pr_comment_edits(provider,repo_full_name,pr_number,
      comment_id,body) VALUES('github','private/repo',1,78,old_body);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete comment edit insert accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.pr_comment_edits SET body=old_body WHERE id=legacy;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete comment edit update accepted'; END IF;
  INSERT INTO public.pr_comment_edits(id,provider,repo_full_name,pr_number,
    comment_id,body) VALUES(newer,'github','private/repo',1,79,cipher);
  IF (SELECT body FROM public.pr_comment_edits WHERE id=newer)
      IS DISTINCT FROM cipher THEN
    RAISE EXCEPTION 'New protected comment edit was altered';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_pr_comment_edit_body(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'PR comment edit migration has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
