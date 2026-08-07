-- minddy — la boucle d'agent tourne DANS la microVM (MIN-224).
--
-- Deux colonnes, et elles ne servent pas à la même chose.
--
-- `loop_in_vm` est le DRAPEAU DE MOTEUR, figé au lancement. Il est lu une fois,
-- sur la liste de projets d'`app_config` (`agent_loop_in_vm_projects`), et écrit
-- ici comme `model` et `reasoning_level` le sont déjà. Sans ce gel, un tour
-- lancé avant la bascule et repris après repartirait sur une boucle qui n'a
-- jamais vu son checkpoint — deux moteurs sur une même conversation.
--
-- `loop_command_id` est le CONSTAT DE VIE du process de boucle. La fonction
-- lance `node /vercel/sandbox/harness/main.js` en `detached: true` et rend la
-- main ; ce qui reste pour savoir si le tour vit encore, c'est cet identifiant
-- de commande, que `Sandbox.getCommand()` sait interroger. C'est ce qui remplace
-- `requeueStuckRuns` pour ces runs-là : plus un vol de claim sur un présumé
-- bloqué après vingt minutes de silence, un constat de décès — et il est exact,
-- parce que c'est la plateforme qui répond.
alter table public.agent_runs
  add column if not exists loop_in_vm boolean not null default false,
  add column if not exists loop_command_id text;

comment on column public.agent_runs.loop_in_vm is
  'La boucle de ce run tourne DANS la microVM (MIN-224). Figé au lancement depuis app_config.agent_loop_in_vm_projects : une conversation ne change jamais de moteur en cours de vie.';

comment on column public.agent_runs.loop_command_id is
  'Identifiant de la commande Vercel Sandbox qui porte la boucle (detached). Null hors loop_in_vm. Le chien de garde s''en sert pour constater qu''un process de boucle est mort.';

-- Le chien de garde balaie les runs `running` de la nouvelle forme, tous
-- déploiements confondus. Sans index, c'est un seq scan sur `agent_runs` toutes
-- les deux minutes ; partiel, il ne pèse que ce que la file pèse vraiment.
create index if not exists idx_agent_runs_loop_in_vm_running
  on public.agent_runs (started_at)
  where status = 'running' and loop_in_vm;
