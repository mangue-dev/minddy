-- Keep every encryption marker visible to the writer that crosses it.
BEGIN;

CREATE FUNCTION public.require_encryption_read_committed()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'encryption_requires_read_committed' USING ERRCODE='25001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.require_encryption_read_committed()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_encryption_snapshot_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id text;
  lock_name text := TG_ARGV[0];
BEGIN
  PERFORM public.require_encryption_read_committed();
  IF TG_ARGV[1]='project' THEN
    owner_id:=to_jsonb(NEW)->>'project_id';
    IF owner_id IS NULL AND TG_TABLE_NAME='issue_events' THEN
      SELECT project_id::text INTO owner_id FROM public.issues
        WHERE id=NEW.issue_id;
    END IF;
    IF owner_id IS NULL AND TG_TABLE_NAME='comments' THEN
      SELECT COALESCE(
        (SELECT project_id::text FROM public.issues WHERE id=NEW.issue_id),
        (SELECT project_id::text FROM public.objectives WHERE id=NEW.objective_id),
        (SELECT project_id::text FROM public.feedback_posts
          WHERE id=NEW.feedback_post_id)) INTO owner_id;
    END IF;
    IF owner_id IS NULL THEN
      RAISE EXCEPTION 'encryption_project_scope_missing' USING ERRCODE='23514';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'envelope-key:project:' || owner_id || ':content',0));
  ELSIF TG_ARGV[1]='user' THEN
    owner_id:=to_jsonb(NEW)->>'user_id';
    IF owner_id IS NULL THEN
      RAISE EXCEPTION 'encryption_user_scope_missing' USING ERRCODE='23514';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'envelope-key:user:' || owner_id || ':content',0));
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('encryption-marker:' || lock_name,591));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_encryption_snapshot_write()
  FROM PUBLIC, anon, authenticated;

-- The content-key insertion itself is the activation marker for six row
-- families. Direct service-role inserts must share the same lock as the
-- supported key registry functions and protected row writers.
CREATE FUNCTION public.guard_envelope_key_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.require_encryption_read_committed();
  IF NEW.purpose='content' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('envelope-key:' || NEW.scope_kind || ':' ||
        NEW.scope_id::text || ':content',0));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a_min591_envelope_key_activation
  BEFORE INSERT OR UPDATE ON public.envelope_data_keys
  FOR EACH ROW EXECUTE FUNCTION public.guard_envelope_key_activation();
REVOKE ALL ON FUNCTION public.guard_envelope_key_activation()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_attachment_object_snapshot_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='attachment_object_encryption_scope' THEN
    PERFORM public.require_encryption_read_committed();
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'encryption-marker:attachment_object_encryption_scope',591));
  ELSIF TG_TABLE_NAME='objects' THEN
    IF NEW.bucket_id='attachments' THEN
      PERFORM public.require_encryption_read_committed();
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'encryption-marker:attachment_object_encryption_scope',591));
    ELSIF TG_OP='UPDATE' THEN
      IF OLD.bucket_id='attachments' THEN
        PERFORM public.require_encryption_read_committed();
        PERFORM pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            'encryption-marker:attachment_object_encryption_scope',591));
        RAISE EXCEPTION 'attachment_bucket_immutable' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.bucket_id='attachments' AND
        EXISTS(SELECT 1 FROM public.attachment_object_encryption_scope) AND
        NEW.user_metadata->>'minddy_logical_size' IS NULL THEN
      RAISE EXCEPTION 'attachment_object_requires_encryption'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a_min591_attachment_object_snapshot_write
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.guard_attachment_object_snapshot_write();
CREATE TRIGGER a_min591_attachment_scope_activation
  BEFORE INSERT OR UPDATE ON public.attachment_object_encryption_scope
  FOR EACH ROW EXECUTE FUNCTION public.guard_attachment_object_snapshot_write();
REVOKE ALL ON FUNCTION public.guard_attachment_object_snapshot_write()
  FROM PUBLIC, anon, authenticated;

-- Install the fence before every encryption guard. The marker name comes from
-- the guard definition, so tables sharing one scope also share one lock.
DO $migration$
DECLARE item record;
  marker text;
  markers text[];
  lock_kind text;
  source text;
BEGIN
  FOR item IN
    SELECT t.tgrelid,
      t.tgrelid::regclass AS table_name,
      p.oid AS function_id,
      c.relname,
      pg_catalog.pg_get_functiondef(p.oid) AS definition
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
    JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal
      AND p.proname LIKE 'guard_%'
      AND (c.relname='forge_repository_names' OR
        pg_catalog.pg_get_functiondef(p.oid) ~
          'requires_encryption|encryption_scope|content_scope|envelope_data_keys|encrypted_content')
    ORDER BY t.tgrelid,t.tgname
  LOOP
    source:=item.definition;
    IF item.relname IN ('issue_events','page_versions','comments',
        'page_comments','objectives','categories','feedback_posts') THEN
      markers:=ARRAY['envelope-key']; lock_kind:='project';
    ELSIF item.relname='project_drafts' THEN
      markers:=ARRAY['envelope-key']; lock_kind:='user';
    ELSIF item.relname='forge_repository_names' THEN
      markers:=ARRAY['forge_repository_name_scope']; lock_kind:='global';
    ELSE
      SELECT pg_catalog.array_agg(DISTINCT match[2]) INTO markers
        FROM pg_catalog.regexp_matches(source,
          '(FROM|INTO|UPDATE|JOIN)[[:space:]]+public\.([a-z_]+_scope[s]?)','g') AS match;
      markers:=COALESCE(markers,ARRAY[item.relname]);
      lock_kind:='global';
    END IF;
    FOREACH marker IN ARRAY markers LOOP
      BEGIN
        EXECUTE pg_catalog.format(
          'CREATE TRIGGER a_min591_fence_%s BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.guard_encryption_snapshot_write(%L,%L)',
          pg_catalog.substr(pg_catalog.md5(marker),1,16),
          item.table_name,marker,lock_kind);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END LOOP;
  END LOOP;
END;
$migration$;

-- Direct service-role marker writes use the same fence as activation functions
-- and row guards. This also covers markers inserted from trigger functions.
CREATE FUNCTION public.guard_encryption_marker_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF pg_catalog.pg_trigger_depth()>1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'encryption_marker_immutable' USING ERRCODE='23514';
  END IF;
  PERFORM public.require_encryption_read_committed();
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'encryption-marker:' || TG_TABLE_NAME,591));
  IF TG_OP='UPDATE' AND
      ((to_jsonb(NEW)-ARRAY['activated_at']) IS DISTINCT FROM
        (to_jsonb(OLD)-ARRAY['activated_at']) OR
       ((to_jsonb(OLD)->>'activated_at') IS NOT NULL AND
        (to_jsonb(NEW)->>'activated_at') IS DISTINCT FROM
          (to_jsonb(OLD)->>'activated_at'))) THEN
    RAISE EXCEPTION 'encryption_marker_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_encryption_marker_change()
  FROM PUBLIC, anon, authenticated;
DO $migration$
DECLARE item record;
BEGIN
  FOR item IN SELECT c.oid::regclass AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND c.relname ~ '(_scope|_scopes)$'
  LOOP
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER a_min591_marker_change BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.guard_encryption_marker_change()',
      item.table_name);
    EXECUTE pg_catalog.format(
      'REVOKE DELETE, TRUNCATE ON %s FROM service_role',item.table_name);
  END LOOP;
END;
$migration$;

-- Activation must acquire the corresponding marker lock before its scan.
-- Recreate the installed functions in place so their existing grants remain.
DO $migration$
DECLARE item record;
  definition text;
  marker text;
  prologue text;
BEGIN
  FOR item IN SELECT p.oid, p.proname,
      pg_catalog.pg_get_functiondef(p.oid) AS definition
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND
      (p.proname LIKE 'activate_%' OR p.proname IN
        ('create_envelope_data_key_if_absent','rotate_envelope_data_key'))
  LOOP
    definition:=item.definition;
    marker:=(pg_catalog.regexp_match(definition,
      'INSERT INTO public\.([a-z_]+_scope[s]?)','i'))[1];
    prologue:='PERFORM public.require_encryption_read_committed();';
    IF marker IS NOT NULL THEN
      prologue:=prologue || pg_catalog.format(
        E'\n  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L,591));',
        'encryption-marker:'||marker);
    END IF;
    definition:=pg_catalog.regexp_replace(definition,
      E'\nBEGIN\n',E'\nBEGIN\n  '||prologue||E'\n');
    IF definition=item.definition THEN
      RAISE EXCEPTION 'cannot fence activation function %', item.proname;
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$migration$;

COMMIT;
