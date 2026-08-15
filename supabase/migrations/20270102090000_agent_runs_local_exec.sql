-- minddy — Le run qui s'exécute sur la machine de l'utilisateur (MIN-355).
--
-- Deux colonnes, et elles ne disent pas la même chose.
--
-- 1. `local_exec` est un MODE D'EXÉCUTION, frère de `loop_in_vm` et
--    d'`agent_engine` : écrit à la création, figé pour la vie du run. Même
--    doctrine, et pour la même raison — chaque environnement relit SA mémoire
--    dans le checkpoint, et le dépôt sur lequel un tour a travaillé n'est pas
--    celui du tour suivant s'il change de machine en cours de route.
--
-- 2. `local_exec_gen` est la GÉNÉRATION DU BAIL. Sans firewall pour signer, la
--    machine prouve son identité par un jeton HS256 auto-porteur `{rid, gen, exp}`
--    (lib/server/agent/local-exec-token.ts) : rien à interroger, donc rien à
--    révoquer — sauf ici. Le claim `gen` est opposé à cette colonne partout où la
--    ligne du run est DÉJÀ lue, c'est-à-dire sur toutes les surfaces du plan de
--    contrôle sauf le direct, qui délibérément ne la lit pas (~4 appels/s).
--    Émettre un jeton l'incrémente : le bail passe à la machine qui vient de le
--    demander, et tout jeton émis avant meurt à l'instant. Une machine par run,
--    par construction plutôt que par convention.
--
-- Un run cloud garde `false`/`0` et ne lit jamais ni l'une ni l'autre.
--
-- Idempotent. RLS inchangée : les colonnes suivent les policies de `agent_runs`,
-- et aucune lecture cliente ne les nomme (le jeton, lui, ne vit nulle part en
-- base — il est auto-porteur).

alter table public.agent_runs
  add column if not exists local_exec boolean not null default false,
  add column if not exists local_exec_gen integer not null default 0;

comment on column public.agent_runs.local_exec is
  'Ce run s''exécute sur la machine de l''utilisateur (MIN-355), pas dans une microVM. Écrit à la création et jamais relu ailleurs, comme loop_in_vm et agent_engine : une conversation ne change pas d''environnement en cours de vie.';

comment on column public.agent_runs.local_exec_gen is
  'Génération du bail d''exécution locale (MIN-355). Le jeton du harness porte ce nombre en claim ; émettre un jeton l''incrémente, ce qui tue tous les précédents. C''est la seule révocation possible d''un jeton auto-porteur, et elle est gratuite : elle se paie là où la ligne du run est déjà lue.';
