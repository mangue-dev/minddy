BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users (id,email) VALUES ('49990000-0000-4000-8000-000000000001','database-import@example.test');
INSERT INTO public.projects (id,owner_id,name,key) VALUES ('49990000-0000-4000-8000-000000000002','49990000-0000-4000-8000-000000000001','Import tests','IMPD');
INSERT INTO public.pages (id,project_id,position,database_schema) VALUES ('49990000-0000-4000-8000-000000000003','49990000-0000-4000-8000-000000000002','a','[]');
CREATE TEMP TABLE payload AS SELECT '[
 {"id":"49990000-0000-4000-8000-000000000003","parent_id":null,"title":"Journal","icon":null,"content":null,"database_schema":[{"id":"49990000-0000-4000-8000-000000000010","name":"Count","type":"number"}],"database_title_name":"Record","property_values":{},"position":"a"},
 {"id":"49990000-0000-4000-8000-000000000004","parent_id":"49990000-0000-4000-8000-000000000003","title":"Entry","icon":null,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Original body"}]}]},"database_schema":null,"database_title_name":null,"property_values":{"49990000-0000-4000-8000-000000000010":12},"position":"a","created_at":"2025-01-02T03:04:05Z"}
]'::jsonb AS pages;
CREATE FUNCTION pg_temp.import_rows(rows jsonb, actor uuid DEFAULT '49990000-0000-4000-8000-000000000001', request uuid DEFAULT '49990000-0000-4000-8000-000000000090') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.import_page_database('49990000-0000-4000-8000-000000000002','49990000-0000-4000-8000-000000000003',actor,request,0,rows,'[]');
$$;
SELECT throws_ok($$SELECT pg_temp.import_rows((SELECT pages FROM payload),'49990000-0000-4000-8000-000000000099')$$,'42501','Project access required','non-members cannot import');
SELECT throws_ok($$SELECT pg_temp.import_rows(jsonb_set((SELECT pages FROM payload),'{1,property_values,49990000-0000-4000-8000-000000000010}','"invalid"'))$$,'22023',NULL,'invalid cells reject the entire import');
SELECT is((SELECT database_schema FROM public.pages WHERE id='49990000-0000-4000-8000-000000000003'),'[]'::jsonb,'failed import rolls back the root schema');
SELECT is((SELECT count(*)::int FROM public.pages WHERE parent_id='49990000-0000-4000-8000-000000000003'),0,'failed import creates no entries');
SELECT is(pg_temp.import_rows((SELECT pages FROM payload))->>'count','1','imports one complete entry');
SELECT is((SELECT database_title_name FROM public.pages WHERE id='49990000-0000-4000-8000-000000000003'),'Record','preserves the title column name');
SELECT is((SELECT property_values->>'49990000-0000-4000-8000-000000000010' FROM public.pages WHERE id='49990000-0000-4000-8000-000000000004'),'12','preserves typed values');
SELECT is((SELECT created_at FROM public.pages WHERE id='49990000-0000-4000-8000-000000000004'),'2025-01-02T03:04:05Z'::timestamptz,'preserves original creation time');
SELECT is((SELECT content#>>'{content,0,content,0,text}' FROM public.pages WHERE id='49990000-0000-4000-8000-000000000004'),'Original body','preserves entry content');
SELECT is(pg_temp.import_rows((SELECT pages FROM payload))->>'replayed','true','retry returns the original result');
SELECT is((SELECT count(*)::int FROM public.pages WHERE parent_id='49990000-0000-4000-8000-000000000003'),1,'retry does not duplicate entries');
SELECT throws_ok($$SELECT pg_temp.import_rows((SELECT pages FROM payload),'49990000-0000-4000-8000-000000000001','49990000-0000-4000-8000-000000000091')$$,'40001','Import requires an unchanged empty database','new imports cannot overwrite existing data');
SELECT ok(NOT has_function_privilege('authenticated','public.import_page_database(uuid,uuid,uuid,uuid,integer,jsonb,jsonb)','EXECUTE'),'authenticated clients cannot bypass server validation');
SELECT * FROM finish();
ROLLBACK;
