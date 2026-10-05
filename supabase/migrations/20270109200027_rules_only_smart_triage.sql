-- MIN-642: retire AI triage and normalize every existing project to rules.
-- Keep the column for older clients, but prevent reactivation of retired modes.
BEGIN;

UPDATE public.projects
SET smart_triage_mode = 'rules'
WHERE smart_triage_mode IS DISTINCT FROM 'rules';

ALTER TABLE public.projects
  ALTER COLUMN smart_triage_mode SET DEFAULT 'rules',
  DROP CONSTRAINT IF EXISTS projects_smart_triage_mode_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_smart_triage_mode_check
  CHECK (smart_triage_mode = 'rules');

COMMIT;
