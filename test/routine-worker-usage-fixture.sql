-- Run with psql -v ON_ERROR_STOP=1 -f test/routine-worker-usage-fixture.sql
-- against an empty disposable PostgreSQL database, never an application database.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.numo_routine_occurrences (conversation_id uuid PRIMARY KEY, routine_id uuid);
CREATE TABLE public.numo_assistant_turns (id uuid PRIMARY KEY, conversation_id uuid);
CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY, run_id uuid, parent_numo_turn_id uuid,
  parent_numo_conversation_id uuid, routine_id uuid
);
CREATE TABLE public.ai_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_id uuid,
  numo_turn_id uuid, conversation_id uuid, routine_id uuid,
  feature text, cost numeric(12,6), key_mode text, idempotency_key text UNIQUE
);
INSERT INTO public.numo_routine_occurrences VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000010');
INSERT INTO public.numo_assistant_turns VALUES
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000002');
INSERT INTO public.agent_runs VALUES
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000022',
   '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000010');
-- Parent, resumed parent, BYOK worker and a second occurrence of the same routine.
INSERT INTO public.ai_usage(run_id,numo_turn_id,feature,cost,key_mode,idempotency_key) VALUES
  (gen_random_uuid(),'00000000-0000-4000-8000-000000000011','numo_chat',0.2,'platform','parent'),
  (gen_random_uuid(),'00000000-0000-4000-8000-000000000012','numo_chat',0.1,'platform','resumed'),
  (gen_random_uuid(),'00000000-0000-4000-8000-000000000011','agent_code',0.5,'byok','byok'),
  (gen_random_uuid(),'00000000-0000-4000-8000-000000000013','numo_chat',7,'platform','other-occurrence');
-- 1,200 worker calls exceed PostgREST's usual per-query row ceiling.
INSERT INTO public.ai_usage(run_id,numo_turn_id,feature,cost,key_mode,idempotency_key)
SELECT '00000000-0000-4000-8000-000000000022'::uuid,
       '00000000-0000-4000-8000-000000000011'::uuid,
       'agent_code',0.001,'platform','worker:' || n
FROM generate_series(1,1200) AS n;
-- These legacy searches/compute lack any parent or routine attribution.
INSERT INTO public.ai_usage(run_id,feature,cost,key_mode,idempotency_key) VALUES
  ('00000000-0000-4000-8000-000000000022','web_search',0.03,'platform','search'),
  ('00000000-0000-4000-8000-000000000022','sandbox_compute',0.04,'platform','compute');
CREATE TEMP TABLE original_charges AS SELECT id,cost,idempotency_key FROM public.ai_usage;

\ir ../supabase/migrations/20270109200028_routine_worker_usage.sql
-- Repeat the migration to check that attribution repair never adds a charge.
\ir ../supabase/migrations/20270109200028_routine_worker_usage.sql

DO $$
DECLARE spend record;
BEGIN
  IF EXISTS (SELECT id,cost,idempotency_key FROM public.ai_usage
             EXCEPT SELECT id,cost,idempotency_key FROM original_charges)
     OR (SELECT COUNT(*) FROM public.ai_usage) <> (SELECT COUNT(*) FROM original_charges) THEN
    RAISE EXCEPTION 'Migration changed charges or deduplication identities';
  END IF;
  SELECT * INTO STRICT spend FROM public.get_numo_routine_occurrence_spend(
    ARRAY['00000000-0000-4000-8000-000000000001'::uuid]);
  IF spend.total_cost <> 2.07 OR spend.platform_cost <> 1.57 THEN
    RAISE EXCEPTION 'Wrong occurrence totals: %', row_to_json(spend);
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_usage WHERE routine_id IS NULL) THEN
    RAISE EXCEPTION 'Missing parent/worker attribution';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_usage WHERE feature NOT IN ('routine_code','routine_compute')) THEN
    RAISE EXCEPTION 'Routine-owned charge left in another segment';
  END IF;
  IF has_function_privilege('authenticated','public.get_numo_routine_occurrence_spend(uuid[])','EXECUTE')
     OR has_function_privilege('anon','public.get_numo_routine_occurrence_spend(uuid[])','EXECUTE')
     OR NOT has_function_privilege('service_role','public.get_numo_routine_occurrence_spend(uuid[])','EXECUTE') THEN
    RAISE EXCEPTION 'Occurrence aggregate is not service-only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_numo_routine_occurrence_spend(
      ARRAY[gen_random_uuid()])) THEN
    RAISE EXCEPTION 'Unknown conversation exposed usage';
  END IF;
END;
$$;
