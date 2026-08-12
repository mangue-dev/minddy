-- minddy — opencode devient LE moteur, sans drapeau (MIN-286).
--
-- Le défaut de la colonne suit la décision : plus de liste de projets dans
-- `app_config`, plus de bascule à faire — tout run neuf part sur opencode, et
-- `createRun` l'écrit de toute façon explicitement. Ce défaut-ci est donc le
-- filet : une ligne insérée par un autre chemin (une passe de rattrapage, du SQL
-- à la main) ne repart pas sur un harness qu'on est en train de retirer.
--
-- Les lignes EXISTANTES ne sont pas touchées, et c'est le point : un run déjà en
-- vol garde le moteur qui a écrit son checkpoint. Les deux moteurs gardent leur
-- mémoire dans deux champs différents (`checkpoint.messages` contre
-- `checkpoint.opencode`) — le rebasculer lui ferait perdre sa conversation, pas
-- un réglage.
alter table public.agent_runs
  alter column agent_engine set default 'opencode';

comment on column public.agent_runs.agent_engine is
  'Le harness qui joue ce run : ''opencode'' (serveur headless piloté par notre superviseur, MIN-286) pour tout run neuf, ''loop'' pour les runs antérieurs à la bascule. Écrit à la création et jamais relu ailleurs : chaque moteur relit SA mémoire dans le checkpoint, donc une conversation ne change jamais de moteur en cours de vie.';
