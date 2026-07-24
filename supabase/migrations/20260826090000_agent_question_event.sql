-- minddy — MIN-86 : événement `question` de l'agent de code (ask_user)
--
-- Quand l'agent pose des questions structurées (tool ask_user), la boucle émet un
-- event `question` qui clôt le tour dans le feed et affiche la carte de questions
-- à la place du composer. On étend le CHECK de agent_run_events.type — sans lui,
-- l'INSERT est rejeté et `appendEvent` (best-effort) l'avale en silence : le run
-- repose en `awaiting_input` mais la conversation ne montre JAMAIS la question.
-- Idempotent — safe to re-run.

alter table public.agent_run_events drop constraint if exists agent_run_events_type_check;
alter table public.agent_run_events add constraint agent_run_events_type_check
  check (type in ('status','thinking','tool_call','tool_result',
                  'commit','pr_opened','error','summary','user_message','plan_update',
                  'files_changed','question'));
