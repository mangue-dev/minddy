-- Verify maintenance preserves edit metadata and authenticates progress without stale writes.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  page_id uuid:=gen_random_uuid(); view_id uuid:=gen_random_uuid(); bookmark_id uuid:=gen_random_uuid();
  table_name text; target_id uuid; before_row jsonb; after_row jsonb; expected jsonb; replacement jsonb;
  icon_path text; fixture_icon_url text;
  cipher text:='{"format":3,"keyVersion":1,"data":"opaque"}';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Fixture project','VCB');
  INSERT INTO public.pages(id,project_id,title,content,property_values,position,created_by)
    VALUES(page_id,project,'Fixture page','{"type":"doc","content":[]}','{}','a',actor);
  INSERT INTO public.views(id,project_id,user_id,kind,name,filters,display)
    VALUES(view_id,project,NULL,'custom','Fixture view','{}','{}');
  INSERT INTO public.saved_views(id,user_id,name,href) VALUES(bookmark_id,actor,'Fixture bookmark','/issues');
  FOREACH table_name IN ARRAY ARRAY['pages','views','saved_views','projects'] LOOP
    target_id:=CASE table_name WHEN 'projects' THEN project WHEN 'pages' THEN page_id
      WHEN 'views' THEN view_id ELSE bookmark_id END;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',table_name) INTO before_row USING target_id;
    expected:=jsonb_build_object('id',target_id,'content_revision',before_row->'content_revision',
      'encryption_version',before_row->'encryption_version','encrypted_content',before_row->'encrypted_content');
    replacement:=jsonb_build_object('encrypted_content',cipher,'encryption_version',1,'name',NULL);
    CASE table_name
      WHEN 'projects' THEN expected:=expected || jsonb_build_object('owner_id',actor);
        replacement:=replacement || jsonb_build_object('automations',NULL,'smart_assign_rules',NULL);
      WHEN 'pages' THEN expected:=expected || jsonb_build_object('project_id',project);
        replacement:=(replacement-'name') || jsonb_build_object('title',NULL,'icon',NULL,'content',NULL,
          'database_schema',NULL,'database_title_name',NULL,'property_values',NULL,'search_text',NULL,
          'page_is_database',false,'page_has_values',false,'page_is_blank',true);
      WHEN 'views' THEN expected:=expected || jsonb_build_object('project_id',project,'user_id',NULL);
        replacement:=replacement || jsonb_build_object('filters',NULL,'display',NULL);
      ELSE expected:=expected || jsonb_build_object('user_id',actor);
        replacement:=replacement || jsonb_build_object('href',NULL,'name_index',repeat('a',64));
    END CASE;
    IF NOT public.migrate_verified_content_backfill(table_name,expected,replacement) OR
        public.migrate_verified_content_backfill(table_name,expected,replacement) THEN
      RAISE EXCEPTION 'Verified content CAS failed for %',table_name;
    END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',table_name) INTO after_row USING target_id;
    IF after_row->'updated_at' IS DISTINCT FROM before_row->'updated_at' OR
       after_row->>'encryption_checked_at' IS NULL OR
       (after_row->>'content_revision')::bigint<>(before_row->>'content_revision')::bigint+1 THEN
      RAISE EXCEPTION 'Conversion altered edit metadata or lost proof for %',table_name;
    END IF;
    expected:=expected || jsonb_build_object('content_revision',after_row->'content_revision',
      'encryption_version',after_row->'encryption_version','encrypted_content',after_row->'encrypted_content');
    IF NOT public.migrate_verified_content_backfill(table_name,expected,'{}') THEN
      RAISE EXCEPTION 'Repeated verification failed for %',table_name;
    END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',table_name) INTO before_row USING target_id;
    IF before_row->'updated_at' IS DISTINCT FROM after_row->'updated_at' OR
       before_row->'content_revision' IS DISTINCT FROM after_row->'content_revision' THEN
      RAISE EXCEPTION 'Repeated verification altered edit metadata for %',table_name;
    END IF;
    BEGIN
      PERFORM public.migrate_verified_content_backfill(table_name,expected,replacement || '{"id":null}');
      RAISE EXCEPTION 'Unexpected identity write accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  icon_path:=project || '/' || gen_random_uuid() || '.enc';
  fixture_icon_url:='/api/projects/' || project || '/icon/content?v=1';
  INSERT INTO storage.objects(bucket_id,name) VALUES('project-icons',icon_path);
  INSERT INTO public.project_icon_encrypted_objects(path,project_id) VALUES(icon_path,project);
  UPDATE public.projects SET icon_storage_path=icon_path,icon_url=fixture_icon_url WHERE id=project;
  SELECT to_jsonb(p) INTO before_row FROM public.projects p WHERE id=project;
  IF NOT public.verify_project_icon(project,fixture_icon_url,icon_path) OR
      NOT public.verify_project_icon(project,fixture_icon_url,icon_path) THEN
    RAISE EXCEPTION 'Repeated icon verification failed';
  END IF;
  SELECT to_jsonb(p) INTO after_row FROM public.projects p WHERE id=project;
  IF after_row->'updated_at' IS DISTINCT FROM before_row->'updated_at' OR
      after_row->'content_revision' IS DISTINCT FROM before_row->'content_revision' THEN
    RAISE EXCEPTION 'Icon verification invalidated project-content CAS or edit metadata';
  END IF;
  IF has_function_privilege('authenticated','public.migrate_verified_content_backfill(text,jsonb,jsonb)','EXECUTE') OR
     has_function_privilege('anon','public.migrate_verified_content_backfill(text,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Client content maintenance privilege exposed';
  END IF;
END;
$test$;
ROLLBACK;
