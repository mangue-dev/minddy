BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users (id,email) VALUES ('49996000-0000-4000-8000-000000000001','database-lifecycle@example.test');
INSERT INTO public.projects (id,owner_id,name,key) VALUES ('49996000-0000-4000-8000-000000000002','49996000-0000-4000-8000-000000000001','Lifecycle tests','LIFD');
INSERT INTO public.pages (id,project_id,position,database_schema) VALUES
 ('49996000-0000-4000-8000-000000000003','49996000-0000-4000-8000-000000000002','a','[{"id":"49996000-0000-4000-8000-000000000010","name":"Amount","type":"number"}]'),
 ('49996000-0000-4000-8000-000000000007','49996000-0000-4000-8000-000000000002','b',NULL),
 ('49996000-0000-4000-8000-000000000008','49996000-0000-4000-8000-000000000002','c','[{"id":"49996000-0000-4000-8000-000000000010","name":"Amount","type":"number"}]');
INSERT INTO public.pages (id,project_id,parent_id,position,title) VALUES
 ('49996000-0000-4000-8000-000000000004','49996000-0000-4000-8000-000000000002','49996000-0000-4000-8000-000000000003','a','Entry'),
 ('49996000-0000-4000-8000-000000000005','49996000-0000-4000-8000-000000000002','49996000-0000-4000-8000-000000000004','a','Notes'),
 ('49996000-0000-4000-8000-000000000006','49996000-0000-4000-8000-000000000002','49996000-0000-4000-8000-000000000003','b','Empty entry');
CREATE FUNCTION pg_temp.restore(id uuid, actor uuid DEFAULT '49996000-0000-4000-8000-000000000001') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.restore_page_guarded('49996000-0000-4000-8000-000000000002',id,actor,'z');
$$;

-- The server reads an empty entry; a collaborator writes a value before its move.
SELECT is((SELECT property_values FROM public.pages WHERE id='49996000-0000-4000-8000-000000000004'),'{}'::jsonb,'preflight sees an empty entry');
SELECT public.update_page_database_guarded('49996000-0000-4000-8000-000000000002','49996000-0000-4000-8000-000000000004','49996000-0000-4000-8000-000000000001',
 '{"propertyId":"49996000-0000-4000-8000-000000000010","operation":"value","value":42,"expected":null}');
SELECT throws_ok($$UPDATE public.pages SET parent_id=NULL,title='Changed' WHERE id='49996000-0000-4000-8000-000000000004'$$,'23514','Database entries with values cannot change parent','a stale move to root cannot strand a newly saved cell');
SELECT throws_ok($$UPDATE public.pages SET parent_id='49996000-0000-4000-8000-000000000007' WHERE id='49996000-0000-4000-8000-000000000004'$$,'23514','Database entries with values cannot change parent','a move under a document preserves database context');
SELECT throws_ok($$UPDATE public.pages SET parent_id='49996000-0000-4000-8000-000000000008' WHERE id='49996000-0000-4000-8000-000000000004'$$,'23514','Database entries with values cannot change parent','a populated entry cannot switch databases even with matching column IDs');
SELECT is((SELECT title FROM public.pages WHERE id='49996000-0000-4000-8000-000000000004'),'Entry','rejected moves do not partially rename the entry');
SELECT is((SELECT property_values->>'49996000-0000-4000-8000-000000000010' FROM public.pages WHERE id='49996000-0000-4000-8000-000000000004'),'42','the collaborator cell survives rejected moves');
SELECT lives_ok($$UPDATE public.pages SET parent_id=parent_id,position='c' WHERE id='49996000-0000-4000-8000-000000000004'$$,'populated entries can reorder within their database');
SELECT lives_ok($$UPDATE public.pages SET parent_id=NULL WHERE id='49996000-0000-4000-8000-000000000006'$$,'empty entries can move to root');
SELECT lives_ok($$UPDATE public.pages SET parent_id='49996000-0000-4000-8000-000000000003' WHERE id='49996000-0000-4000-8000-000000000006'$$,'empty entries can return to their database');

-- The entries are trashed separately, before the database is trashed.
UPDATE public.pages SET deleted_at=now(),deleted_by='49996000-0000-4000-8000-000000000001' WHERE id IN
 ('49996000-0000-4000-8000-000000000003','49996000-0000-4000-8000-000000000004','49996000-0000-4000-8000-000000000005','49996000-0000-4000-8000-000000000006');
UPDATE public.pages SET deleted_root_id='49996000-0000-4000-8000-000000000004' WHERE id='49996000-0000-4000-8000-000000000005';
SELECT is(pg_temp.restore('49996000-0000-4000-8000-000000000004')->>'status','parent_required','restoring a populated entry first requires its database');
SELECT is(pg_temp.restore('49996000-0000-4000-8000-000000000006')->>'status','parent_required','empty entries also retain their database membership');
SELECT ok((SELECT bool_and(deleted_at IS NOT NULL) FROM public.pages WHERE id IN ('49996000-0000-4000-8000-000000000004','49996000-0000-4000-8000-000000000005')),'a refused restore leaves the entire family trashed');
SELECT is((SELECT parent_id::text FROM public.pages WHERE id='49996000-0000-4000-8000-000000000004'),'49996000-0000-4000-8000-000000000003','a refused restore keeps the database parent');
SELECT is(pg_temp.restore('49996000-0000-4000-8000-000000000003','49996000-0000-4000-8000-000000000099')->>'status','not_found','non-members cannot restore pages');
SELECT is(pg_temp.restore('49996000-0000-4000-8000-000000000003')->>'restored','1','restoring the database leaves independently trashed entries untouched');
SELECT is(pg_temp.restore('49996000-0000-4000-8000-000000000004')->>'restored','2','the entry and its family can then be restored together');
SELECT is((SELECT property_values->>'49996000-0000-4000-8000-000000000010' FROM public.pages WHERE id='49996000-0000-4000-8000-000000000004'),'42','restoring preserves stored values');
SELECT is(pg_temp.restore('49996000-0000-4000-8000-000000000004')->>'status','not_found','already restored pages are not restored twice');

-- A database and its entries deleted together remain a single restoration.
UPDATE public.pages SET deleted_at=now(),deleted_root_id=CASE WHEN id='49996000-0000-4000-8000-000000000003' THEN NULL ELSE '49996000-0000-4000-8000-000000000003'::uuid END
 WHERE id IN ('49996000-0000-4000-8000-000000000003','49996000-0000-4000-8000-000000000004','49996000-0000-4000-8000-000000000005');
SELECT is(pg_temp.restore('49996000-0000-4000-8000-000000000003')->>'restored','3','a whole database restores with its populated entries');

-- Ordinary documents still lift out of a trashed parent.
UPDATE public.pages SET parent_id='49996000-0000-4000-8000-000000000007',deleted_root_id=NULL,deleted_at=now(),parent_block_removed=true WHERE id='49996000-0000-4000-8000-000000000005';
UPDATE public.pages SET deleted_at=now() WHERE id='49996000-0000-4000-8000-000000000007';
SELECT is(pg_temp.restore('49996000-0000-4000-8000-000000000005')->>'status','restored','ordinary documents can restore without their trashed parent');
SELECT ok((SELECT parent_id IS NULL AND position='z' AND NOT parent_block_removed FROM public.pages WHERE id='49996000-0000-4000-8000-000000000005'),'lifted documents return to the end of the project root');

-- A failure on any family member rolls back the entire restoration.
UPDATE public.pages SET deleted_at=now(),deleted_root_id=CASE WHEN id='49996000-0000-4000-8000-000000000003' THEN NULL ELSE '49996000-0000-4000-8000-000000000003'::uuid END
 WHERE id IN ('49996000-0000-4000-8000-000000000003','49996000-0000-4000-8000-000000000004');
CREATE FUNCTION pg_temp.refuse_restore() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id='49996000-0000-4000-8000-000000000004' AND NEW.deleted_at IS NULL THEN RAISE EXCEPTION 'Injected restore failure'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER test_refuse_restore BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION pg_temp.refuse_restore();
SELECT throws_ok($$SELECT pg_temp.restore('49996000-0000-4000-8000-000000000003')$$,'P0001','Injected restore failure','a child failure rejects the restoration');
SELECT ok((SELECT bool_and(deleted_at IS NOT NULL) FROM public.pages WHERE id IN ('49996000-0000-4000-8000-000000000003','49996000-0000-4000-8000-000000000004')),'failed restoration does not leave a partially restored family');
DROP TRIGGER test_refuse_restore ON public.pages;
SELECT ok(NOT has_function_privilege('authenticated','public.restore_page_guarded(uuid,uuid,uuid,text)','EXECUTE'),'authenticated clients cannot bypass server restore authorization');
SELECT ok(NOT has_function_privilege('anon','public.restore_page_guarded(uuid,uuid,uuid,text)','EXECUTE'),'anonymous clients cannot restore pages');

-- Permanent deletion retains the existing foreign-key behavior, including separate trash roots.
UPDATE public.pages SET deleted_root_id=NULL WHERE id='49996000-0000-4000-8000-000000000004';
SELECT lives_ok($$DELETE FROM public.pages WHERE id='49996000-0000-4000-8000-000000000003'$$,'permanent parent deletion is not mistaken for a user move');
SELECT ok((SELECT parent_id IS NULL AND deleted_at IS NOT NULL FROM public.pages WHERE id='49996000-0000-4000-8000-000000000004'),'separately trashed entries survive permanent parent deletion as before');
INSERT INTO public.pages (id,project_id,parent_id,position,property_values) VALUES
 ('49996000-0000-4000-8000-000000000009','49996000-0000-4000-8000-000000000002','49996000-0000-4000-8000-000000000008','a','{"49996000-0000-4000-8000-000000000010":0}');
UPDATE public.pages SET deleted_at=now(),deleted_root_id=CASE WHEN id='49996000-0000-4000-8000-000000000008' THEN NULL ELSE '49996000-0000-4000-8000-000000000008'::uuid END
 WHERE id IN ('49996000-0000-4000-8000-000000000008','49996000-0000-4000-8000-000000000009');
SELECT lives_ok($$DELETE FROM public.pages WHERE (id='49996000-0000-4000-8000-000000000008' OR deleted_root_id='49996000-0000-4000-8000-000000000008') AND deleted_at IS NOT NULL$$,'a database deletion family can be purged together');
SELECT lives_ok($$DELETE FROM public.projects WHERE id='49996000-0000-4000-8000-000000000002'$$,'project deletion still cascades');
SELECT * FROM finish();
ROLLBACK;
