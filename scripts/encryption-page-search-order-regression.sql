-- Verify equal-score pages have the same stable order in SQL and protected search.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid(); found uuid[];
  first_id uuid:='00000000-0000-4000-8000-000000000001';
  second_id uuid:='00000000-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Search fixture','PSO');
  INSERT INTO public.pages(id,project_id,title,content,property_values,position,created_by,search_text,updated_at)
    VALUES(second_id,project,'alpha','{"type":"doc","content":[]}','{}','a',actor,'alpha','2026-01-01'),
          (first_id,project,'alpha','{"type":"doc","content":[]}','{}','b',actor,'alpha','2026-01-01');
  SELECT array_agg(hit.id) INTO found FROM public.search_pages('alpha',project,50) hit;
  IF found IS DISTINCT FROM ARRAY[first_id,second_id] THEN
    RAISE EXCEPTION 'Equal-score page search order is unstable';
  END IF;
  SELECT array_agg(hit.id) INTO found FROM public.search_pages('alpha',project,1) hit;
  IF found IS DISTINCT FROM ARRAY[first_id] THEN
    RAISE EXCEPTION 'Equal-score page search limit chose a different page';
  END IF;
END;
$test$;
ROLLBACK;
