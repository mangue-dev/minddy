-- minddy — MIN-165 : affinité de déploiement d'un run d'agent.
--
-- `agent_runs` vit dans une base UNIQUE : preview et production partagent la même
-- file. Le drain claim n'importe quel run `queued`, et le cron ne tourne qu'en
-- prod — donc un run lancé depuis un preview repart, à la première frontière de
-- chunk, sur le code de la prod, avec le même checkpoint et la même microVM. Ce
-- n'est pas « l'ancien comportement » : c'est un chunk qui reprend un état qu'il
-- ne sait pas lire dès que la forme du checkpoint ou le jeu de tools a changé.
--
-- Cette colonne porte l'affinité : chaque drain ne claim que SON périmètre.
-- Le cron de prod, lui, devient répartiteur — il réveille les déploiements qui
-- ont du travail dû sans jamais l'exécuter, et le filet reste entier.
--
-- Pas de nouvel index : `idx_agent_runs_due` (not_before where status='queued')
-- couvre déjà le prédicat, `deployment_url` n'est qu'un recheck sur une file
-- courte. Purement additive — la version déployée l'ignore.
alter table public.agent_runs add column if not exists deployment_url text;

comment on column public.agent_runs.deployment_url is
  'Affinité de déploiement (MIN-165) : null = production ou local (drainé par le '
  'cron de prod), sinon le VERCEL_URL EXACT du déploiement preview qui a créé le '
  'run — seul ce déploiement le claim, sur toute sa durée. On stampe le '
  'déploiement et pas la branche : un run continue avec le code qui l''a lancé, '
  'même si on repousse la branche entre deux chunks.';
