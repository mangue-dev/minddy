-- minddy — événement `quota_exhausted` de l'agent de code
--
-- Le budget d'usage mensuel n'était vérifié qu'au LANCEMENT (`checkAgentQuota`
-- dans launch.ts) : un run démarré avec quelques centimes de reste allait au bout,
-- chunk après chunk, sans plafond. La boucle s'arrête désormais à la frontière de
-- round quand le budget tombe à zéro, et pose cet événement — le fil le rend en
-- carte (« Vous avez atteint la limite d'usage » + les issues possibles).
--
-- On étend le CHECK de agent_run_events.type ; sans lui l'INSERT est rejeté et
-- `appendEvent` (best-effort) l'avale en silence : le run reposerait sans que la
-- conversation dise JAMAIS pourquoi (même piège que MIN-86 avec `question`).
-- Idempotent — safe to re-run.

alter table public.agent_run_events drop constraint if exists agent_run_events_type_check;
alter table public.agent_run_events add constraint agent_run_events_type_check
  check (type in ('status','thinking','tool_call','tool_result',
                  'commit','pr_opened','error','summary','user_message','plan_update',
                  'files_changed','question','quota_exhausted'));
