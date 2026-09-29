\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;

DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  page uuid := gen_random_uuid(); view_id uuid := gen_random_uuid();
  bookmark uuid := gen_random_uuid(); target record; expected jsonb;
  revision bigint; after_revision bigint; changed integer; checked jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Revision fixture','CREV');
  INSERT INTO public.pages(id,project_id,title,content,property_values,position,created_by)
    VALUES(page,project,'Page fixture','{"type":"doc","content":[]}','{}','a',actor);
  INSERT INTO public.views(id,project_id,kind,name,filters,display)
    VALUES(view_id,project,'custom','View fixture','{}','{}');
  INSERT INTO public.saved_views(id,user_id,name,href)
    VALUES(bookmark,actor,'Bookmark fixture','/all');

  FOR target IN SELECT * FROM (VALUES
    ('projects',project,'name'),('pages',page,'title'),
    ('views',view_id,'name'),('saved_views',bookmark,'name')
  ) AS targets(table_name,row_id,content_column) LOOP
    EXECUTE format('SELECT jsonb_build_object(''id'',id,''content_revision'',content_revision,
      ''encrypted_content'',encrypted_content,''encryption_version'',encryption_version)
      FROM public.%I WHERE id=$1',target.table_name) INTO expected USING target.row_id;
    revision := (expected->>'content_revision')::bigint;
    IF NOT public.record_encryption_backfill_progress(target.table_name,
        'encryption_attempted_at',expected,false) THEN
      RAISE EXCEPTION 'Fresh attempt refused for %',target.table_name;
    END IF;
    EXECUTE format('SELECT content_revision,to_jsonb(encryption_checked_at)
      FROM public.%I WHERE id=$1',target.table_name)
      INTO after_revision,checked USING target.row_id;
    IF after_revision <> revision OR checked IS NOT NULL THEN
      RAISE EXCEPTION 'Attempt invalidated its own CAS or claimed proof for %',target.table_name;
    END IF;

    -- Even a maintenance caller must advance the revision for a real edit.
    PERFORM set_config('minddy.encryption_maintenance','on',true);
    EXECUTE format('UPDATE public.%I SET %I=''Changed content''
      WHERE id=$1 AND content_revision=$2',target.table_name,target.content_column)
      USING target.row_id,revision;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed <> 1 THEN RAISE EXCEPTION 'Fresh content CAS refused'; END IF;
    EXECUTE format('SELECT content_revision FROM public.%I WHERE id=$1',target.table_name)
      INTO after_revision USING target.row_id;
    IF after_revision <> revision+1 THEN RAISE EXCEPTION 'Content edit lost its revision'; END IF;
    PERFORM set_config('minddy.encryption_maintenance','',true);
    EXECUTE format('UPDATE public.%I SET %I=''Stale content''
      WHERE id=$1 AND content_revision=$2',target.table_name,target.content_column)
      USING target.row_id,revision;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Stale CAS overwrote a content edit'; END IF;
    IF public.record_encryption_backfill_progress(target.table_name,
        'encryption_attempted_at',expected,false) THEN
      RAISE EXCEPTION 'Stale attempt claimed a matching row';
    END IF;
    EXECUTE format('SELECT content_revision FROM public.%I WHERE id=$1',target.table_name)
      INTO after_revision USING target.row_id;
    IF after_revision <> revision+1 THEN RAISE EXCEPTION 'Stale retry changed content revision'; END IF;
  END LOOP;
END;
$test$;
ROLLBACK;
