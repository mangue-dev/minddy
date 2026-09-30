-- Progress-only writes must not invalidate the content CAS used by backfill.
-- PostgreSQL computes the generated page search_tsv after BEFORE triggers;
-- compare its source fields instead of its temporarily unset NEW value.
BEGIN;

DO $migration$
DECLARE target text; definition text; rewritten text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'guard_project_content', 'guard_page_content',
    'guard_view_content', 'guard_saved_view_bookmark'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(p.oid) INTO STRICT definition
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=target AND p.pronargs=0;
    rewritten := pg_catalog.regexp_replace(definition,
      'NEW[.]content_revision[[:space:]]*:=[[:space:]]*OLD[.]content_revision[[:space:]]*[+][[:space:]]*1;',
      $replacement$NEW.content_revision := CASE
        WHEN current_setting('minddy.encryption_maintenance',true)='on'
          AND (to_jsonb(NEW) - ARRAY['content_revision','updated_at',
            'encryption_attempted_at','encryption_checked_at',
            'icon_attempted_at','icon_checked_at','search_tsv']) IS NOT DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['content_revision','updated_at',
            'encryption_attempted_at','encryption_checked_at',
            'icon_attempted_at','icon_checked_at','search_tsv'])
        THEN OLD.content_revision ELSE OLD.content_revision+1 END;$replacement$);
    IF rewritten=definition THEN
      RAISE EXCEPTION 'Cannot preserve progress-only revisions for %',target;
    END IF;
    EXECUTE rewritten;
  END LOOP;
END;
$migration$;

COMMIT;
