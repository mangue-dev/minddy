-- minddy — MIN-46 : événement plan_update de l'agent de code
--
-- Le tool `update_plan` fait maintenir à l'agent une checklist ordonnée de ses
-- étapes (modèle Codex / Claude Code TodoWrite), rendue en direct dans le feed du
-- run. Chaque appel émet un event `plan_update` (payload = plan complet). On étend
-- donc le CHECK de agent_run_events.type. Idempotent — safe to re-run.

alter table public.agent_run_events drop constraint if exists agent_run_events_type_check;
alter table public.agent_run_events add constraint agent_run_events_type_check
  check (type in ('status','thinking','tool_call','tool_result',
                  'commit','pr_opened','error','summary','user_message','plan_update'));
