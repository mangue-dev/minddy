\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
  b uuid:=gen_random_uuid(); old_revision bigint; changed integer;
  cipher text:='{"format":3,"keyVersion":1,"data":"opaque"}';
  index_a text:=repeat('a',64); index_b text:=repeat('b',64);
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.saved_views(id,user_id,name,href)
    VALUES(a,actor,'Private bookmark','/issues?q=secret');
  INSERT INTO public.saved_views(id,user_id,name,href)
    VALUES(b,actor,'Another bookmark','/projects/private');
  IF public.activate_saved_view_bookmarks() THEN
    RAISE EXCEPTION 'Legacy bookmarks activated';
  END IF;
  SELECT content_revision INTO old_revision FROM public.saved_views WHERE id=a;
  UPDATE public.saved_views SET name=NULL,href=NULL,name_index=index_a,
    encrypted_content=cipher,encryption_version=1 WHERE id=a
    AND content_revision=old_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Bookmark CAS failed'; END IF;
  UPDATE public.saved_views SET name=NULL,href=NULL,name_index=index_a,
    encrypted_content=cipher,encryption_version=1 WHERE id=a
    AND content_revision=old_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Stale bookmark CAS won'; END IF;
  UPDATE public.saved_views SET name=NULL,href=NULL,name_index=index_b,
    encrypted_content=cipher,encryption_version=1 WHERE id=b;
  IF EXISTS(SELECT 1 FROM public.saved_views WHERE id IN (a,b) AND
      (name IS NOT NULL OR href IS NOT NULL OR name_index IS NULL)) THEN
    RAISE EXCEPTION 'Bookmark source retains clear content';
  END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.saved_views(user_id,name_index,encrypted_content,
      encryption_version) VALUES(actor,index_a,cipher,1);
  EXCEPTION WHEN unique_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Protected name uniqueness lost'; END IF;
  IF NOT public.activate_saved_view_bookmarks() THEN
    RAISE EXCEPTION 'Verified bookmarks refused activation';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.saved_views SET name='Obsolete writer' WHERE id=a;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old update accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.saved_views(user_id,name,href)
      VALUES(actor,'Old insert','/issues?clear');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.saved_views SET user_id=gen_random_uuid() WHERE id=a;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Cipher owner changed'; END IF;
  IF has_function_privilege('authenticated',
      'public.activate_saved_view_bookmarks()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate bookmarks';
  END IF;
END;
$test$;
ROLLBACK;
