BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users (id,email) VALUES ('49930000-0000-4000-8000-000000000001','database-agent@example.test');
INSERT INTO public.api_keys (id,user_id,name,key_hash,key_prefix) VALUES
('49930000-0000-4000-8000-000000000002','49930000-0000-4000-8000-000000000001','Database MCP','database-agent-test-hash','test');
INSERT INTO public.projects (id,owner_id,name,key) VALUES
('49930000-0000-4000-8000-000000000003','49930000-0000-4000-8000-000000000001','Agent database','DAG');
INSERT INTO public.pages (id,project_id,position,database_schema) VALUES
('49930000-0000-4000-8000-000000000004','49930000-0000-4000-8000-000000000003','a','[{"id":"49930000-0000-4000-8000-000000000010","name":"Amount","type":"number"}]');
INSERT INTO public.pages (id,project_id,parent_id,position,property_values) VALUES
('49930000-0000-4000-8000-000000000005','49930000-0000-4000-8000-000000000003','49930000-0000-4000-8000-000000000004','a','{}'),
('49930000-0000-4000-8000-000000000006','49930000-0000-4000-8000-000000000003','49930000-0000-4000-8000-000000000004','b','{"49930000-0000-4000-8000-000000000010":20}');
UPDATE public.pages SET deleted_at=now() WHERE id='49930000-0000-4000-8000-000000000006';
CREATE FUNCTION pg_temp.edit(target uuid, input jsonb) RETURNS text LANGUAGE sql AS $$
 SELECT public.update_page_database_guarded('49930000-0000-4000-8000-000000000003',target,'49930000-0000-4000-8000-000000000001',input)->>'status';
$$;
SELECT is(pg_temp.edit('49930000-0000-4000-8000-000000000005','{"operation":"value","propertyId":"49930000-0000-4000-8000-000000000010","value":12,"expected":null,"kind":"agent","mcpKeyId":"49930000-0000-4000-8000-000000000002"}'),'updated','MCP edits a cell');
SELECT is((SELECT updated_api_key_id::text FROM public.pages WHERE id='49930000-0000-4000-8000-000000000005'),'49930000-0000-4000-8000-000000000002','cell retains the MCP key');
SELECT is((SELECT updated_kind FROM public.pages WHERE id='49930000-0000-4000-8000-000000000005'),'agent','cell retains agent attribution');
SELECT is(pg_temp.edit('49930000-0000-4000-8000-000000000005','{"operation":"value","propertyId":"49930000-0000-4000-8000-000000000010","value":13,"expected":12,"kind":"agent"}'),'updated','Numo edits the cell');
SELECT is((SELECT updated_api_key_id FROM public.pages WHERE id='49930000-0000-4000-8000-000000000005'),NULL::uuid,'Numo clears previous MCP attribution');
CREATE FUNCTION pg_temp.convert(input jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.convert_page_database_guarded('49930000-0000-4000-8000-000000000003','49930000-0000-4000-8000-000000000004','49930000-0000-4000-8000-000000000001',jsonb_build_object('operation','convert','propertyId','49930000-0000-4000-8000-000000000010','targetType','text','revision',0,'kind','agent','mcpKeyId','49930000-0000-4000-8000-000000000002') || input);
$$;
CREATE TEMP TABLE preview AS SELECT pg_temp.convert('{"preview":true}') AS data;
SELECT is((SELECT data->>'status' FROM preview),'preview','MCP previews a conversion');
SELECT is((SELECT updated_api_key_id FROM public.pages WHERE id='49930000-0000-4000-8000-000000000004'),NULL::uuid,'preview does not attribute an edit');
SELECT is(pg_temp.convert(jsonb_build_object('preview',false,'token',(SELECT data->>'token' FROM preview)))->>'status','updated','MCP applies a conversion');
SELECT is((SELECT count(*)::int FROM public.pages WHERE project_id='49930000-0000-4000-8000-000000000003' AND updated_api_key_id='49930000-0000-4000-8000-000000000002' AND updated_kind='agent'),3,'conversion attributes the database and all live/trashed entries');
SELECT is(pg_temp.edit('49930000-0000-4000-8000-000000000004',jsonb_build_object('operation','schema','schema','[]'::jsonb,'revision',(SELECT database_revision FROM public.pages WHERE id='49930000-0000-4000-8000-000000000004'),'kind','agent')),'updated','Numo removes the column');
SELECT is((SELECT count(*)::int FROM public.pages WHERE project_id='49930000-0000-4000-8000-000000000003' AND updated_api_key_id IS NULL AND updated_kind='agent'),3,'schema cleanup clears prior MCP attribution on every entry');
SELECT * FROM finish();
ROLLBACK;
