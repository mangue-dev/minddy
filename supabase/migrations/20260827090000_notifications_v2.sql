-- minddy — MIN-82 « Audit et revamp du système d'inbox »
-- Nouveaux déclencheurs : l'agent de code (question / fin de tour / échec) et
-- l'arrivée d'un feedback public. Le CHECK inline de notifications.type est
-- auto-nommé <table>_<col>_check (même mécanique que agent_run_events).

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assigned','mention','comment',
                  'agent_done','agent_question','agent_failed',
                  'feedback_new'));
