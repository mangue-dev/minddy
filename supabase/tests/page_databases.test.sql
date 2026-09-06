BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(24);

INSERT INTO auth.users (id, email) VALUES
  ('49900000-0000-4000-8000-000000000001', 'database-owner@example.test'),
  ('49900000-0000-4000-8000-000000000002', 'database-outsider@example.test');
INSERT INTO public.projects (id, owner_id, name, key) VALUES
  ('49900000-0000-4000-8000-000000000003', '49900000-0000-4000-8000-000000000001', 'Database test', 'DBT');
INSERT INTO public.pages (id, project_id, position, database_schema) VALUES
  ('49900000-0000-4000-8000-000000000004', '49900000-0000-4000-8000-000000000003', 'a',
   '[{"id":"49900000-0000-4000-8000-000000000010","name":"Date","type":"date"},{"id":"49900000-0000-4000-8000-000000000011","name":"Done","type":"checkbox"},{"id":"49900000-0000-4000-8000-000000000012","name":"Owner","type":"people"}]');
INSERT INTO public.pages (id, project_id, parent_id, position) VALUES
  ('49900000-0000-4000-8000-000000000005', '49900000-0000-4000-8000-000000000003', '49900000-0000-4000-8000-000000000004', 'a');

CREATE FUNCTION pg_temp.edit_database(input jsonb, actor uuid DEFAULT '49900000-0000-4000-8000-000000000001', target uuid DEFAULT '49900000-0000-4000-8000-000000000005') RETURNS text LANGUAGE sql AS $$
  SELECT public.update_page_database_guarded('49900000-0000-4000-8000-000000000003', target, actor, input)->>'status';
$$;
SELECT ok(NOT has_function_privilege('authenticated', 'public.update_page_database_guarded(uuid,uuid,uuid,jsonb)', 'EXECUTE'), 'session callers cannot bypass the API guard');
SELECT is(pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000010","value":"2028-02-29","expected":null}'), 'updated', 'a valid calendar date is saved');
SELECT is(pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000011","value":true,"expected":null}'), 'updated', 'an independent cell merges without overwriting the date');
SELECT is((SELECT property_values->>'49900000-0000-4000-8000-000000000010' FROM public.pages WHERE id = '49900000-0000-4000-8000-000000000005'), '2028-02-29', 'the previous cell is preserved');
SELECT is(pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000010","value":"2028-03-01","expected":null}'), 'conflict', 'a stale edit to the same cell is refused');
SELECT is(pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000011","value":false,"expected":true}', '49900000-0000-4000-8000-000000000002'), 'not_found', 'a nonmember cannot edit a database');
SELECT throws_ok($$ SELECT pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000011","value":"true","expected":true}') $$, '22023', 'Invalid checkbox', 'checkboxes cannot store strings');
SELECT throws_ok($$ SELECT pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000012","value":["49900000-0000-4000-8000-000000000002"],"expected":null}') $$, '22023', 'Person is not a project member', 'assignment rejects outsiders');
SELECT is(pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000012","value":["49900000-0000-4000-8000-000000000001"],"expected":null}'), 'updated', 'the project owner can be assigned without a membership row');
SELECT throws_ok($$ INSERT INTO public.pages (project_id, parent_id, position, database_schema) VALUES ('49900000-0000-4000-8000-000000000003','49900000-0000-4000-8000-000000000004','b','[]') $$, '22023', 'Database entries must be documents', 'databases cannot be records inside another database');
SELECT is(public.discard_blank_page_guarded('49900000-0000-4000-8000-000000000004')->>'status', 'not_empty', 'an untitled database cannot be discarded');
INSERT INTO public.pages (id, project_id, parent_id, position) VALUES ('49900000-0000-4000-8000-000000000006','49900000-0000-4000-8000-000000000003','49900000-0000-4000-8000-000000000004','b');
SELECT is(public.discard_blank_page_guarded('49900000-0000-4000-8000-000000000006')->>'status', 'not_empty', 'an empty entry is an intentional record');
SELECT is(pg_temp.edit_database('{"operation":"schema","revision":0,"schema":[{"id":"49900000-0000-4000-8000-000000000010","name":"Delivery date","type":"date"}]}', '49900000-0000-4000-8000-000000000001','49900000-0000-4000-8000-000000000004'), 'updated', 'properties can be renamed and removed atomically');
SELECT ok((SELECT NOT (property_values ? '49900000-0000-4000-8000-000000000011') FROM public.pages WHERE id='49900000-0000-4000-8000-000000000005'), 'deleted properties cannot revive old values when an ID is reused');
SELECT is((SELECT database_revision FROM public.pages WHERE id='49900000-0000-4000-8000-000000000004'), 1, 'schema edits advance the schema revision');
SELECT is(pg_temp.edit_database('{"operation":"schema","revision":0,"schema":[]}', '49900000-0000-4000-8000-000000000001','49900000-0000-4000-8000-000000000004'), 'conflict', 'stale schema replacement is refused');
SELECT is(pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000011","value":false,"expected":true}'), 'conflict', 'an open editor cannot write a deleted property');
SELECT is(pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000010","value":null,"expected":"2028-02-29"}'), 'updated', 'remaining properties can be cleared after schema deletion');
SELECT is(pg_temp.edit_database('{"operation":"schema","revision":1,"titleName":"Report","schema":[{"id":"49900000-0000-4000-8000-000000000010","name":"Delivery date","type":"date"}]}', '49900000-0000-4000-8000-000000000001','49900000-0000-4000-8000-000000000004'), 'updated', 'the title column can be renamed without changing properties');
SELECT is((SELECT database_title_name FROM public.pages WHERE id='49900000-0000-4000-8000-000000000004'), 'Report', 'the title column name is persisted');
SELECT is((SELECT database_revision FROM public.pages WHERE id='49900000-0000-4000-8000-000000000004'), 2, 'title renaming advances the shared schema revision');
SELECT is(pg_temp.edit_database('{"operation":"schema","revision":1,"titleName":"Stale","schema":[]}', '49900000-0000-4000-8000-000000000001','49900000-0000-4000-8000-000000000004'), 'conflict', 'stale property edits cannot overwrite a title rename');
SELECT throws_ok($$ UPDATE public.pages SET database_title_name = ' ' WHERE id='49900000-0000-4000-8000-000000000004' $$, '22023', 'Invalid title column name', 'blank title column names are rejected');
UPDATE public.pages SET deleted_at = now() WHERE id = '49900000-0000-4000-8000-000000000004';
SELECT is(pg_temp.edit_database('{"operation":"value","propertyId":"49900000-0000-4000-8000-000000000010","value":"2028-03-01","expected":null}'), 'not_found', 'a trashed database cannot receive entry edits');
SELECT * FROM finish();
ROLLBACK;
