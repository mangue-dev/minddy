-- Le mode local peut utiliser un worktree par session. Le booléen ne contient
-- aucun chemin de machine : il fige seulement la décision d'isolation afin que
-- les tours suivants de la conversation retrouvent le même checkout.
alter table public.agent_runs
  add column if not exists local_worktree boolean not null default false;

comment on column public.agent_runs.local_worktree is
  'Le run local travaille dans un worktree isolé, créé sur la machine qui exécute le tour. Figé au lancement; le chemin reste local à cette machine.';
