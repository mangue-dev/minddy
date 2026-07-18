-- minddy — MIN-46 : événement files_changed de l'agent de code
--
-- En fin de chaque tour, l'agent émet un event `files_changed` (payload = liste des
-- fichiers créés/modifiés/supprimés, calculée par git dans la sandbox) rendu en bloc
-- de diff par tour dans le feed, et qui pilote le bouton « créer une pull request ».
-- On étend donc le CHECK de agent_run_events.type. Sans lui, l'INSERT est rejeté et
-- `appendEvent` (best-effort) l'avale en silence → le bloc settled et le bouton PR ne
-- reçoivent jamais l'event. Idempotent — safe to re-run.

alter table public.agent_run_events drop constraint if exists agent_run_events_type_check;
alter table public.agent_run_events add constraint agent_run_events_type_check
  check (type in ('status','thinking','tool_call','tool_result',
                  'commit','pr_opened','error','summary','user_message','plan_update',
                  'files_changed'));
