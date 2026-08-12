-- minddy — quel HARNESS joue ce run (MIN-286).
--
-- `agent_engine` est le drapeau de la bascule vers opencode headless, figé au
-- lancement : lu une fois sur la liste de projets d'`app_config`
-- (`agent_opencode_projects`) et écrit ici, comme `loop_in_vm` (MIN-224), `model`
-- et `reasoning_level` le sont déjà.
--
-- Pourquoi ce gel-ci coûte plus cher que les autres à oublier : les deux moteurs
-- ne gardent pas leur mémoire au même endroit. La boucle maison porte sa
-- conversation dans `checkpoint.messages` ; opencode la porte dans un journal
-- d'événements rejouable, sous `checkpoint.opencode`. Un run qui changerait de
-- moteur en cours de vie ne perdrait pas un réglage, il perdrait la conversation.
-- Les deux champs COEXISTENT dans le checkpoint pour cette raison, et c'est cette
-- colonne qui dit lequel relire — ce qui rend le drapeau réversible sans aucune
-- migration de données.
--
-- Une colonne texte contrainte plutôt qu'un booléen de plus : un troisième moteur
-- n'ajouterait qu'une valeur, là où deux booléens ouvriraient un état absurde
-- ('les deux à la fois').
alter table public.agent_runs
  add column if not exists agent_engine text not null default 'loop';

alter table public.agent_runs
  drop constraint if exists agent_runs_agent_engine_check;

alter table public.agent_runs
  add constraint agent_runs_agent_engine_check
  check (agent_engine in ('loop', 'opencode'));

comment on column public.agent_runs.agent_engine is
  'Le harness qui joue ce run : ''loop'' (boucle maison) ou ''opencode'' (serveur headless piloté par notre superviseur, MIN-286). Figé au lancement depuis app_config.agent_opencode_projects — chaque moteur relit SA mémoire dans le checkpoint, donc une conversation ne change jamais de moteur en cours de vie.';
