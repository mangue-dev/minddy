-- minddy — dire POURQUOI une ligne d'usage est imputée à quelqu'un (MIN-131)
--
-- La règle produit est : chacun paye SON usage, jamais celui d'un autre membre
-- de son projet. Le ledger portait pourtant un repli muet — toute ligne arrivant
-- sans `user_id` était réimputée au owner du projet — et une fois écrite, cette
-- substitution était indistinguable d'une imputation légitime.
--
-- Le repli reste nécessaire pour les appels SANS déclencheur nommable (visiteur
-- anonyme du board public, passe de fond du cron) : le budget se compte par
-- `user_id` (`get_user_usage_since`), donc une ligne à `user_id` null n'entre
-- dans le compteur de personne, alors que ces appels-là sont autorisés par le
-- budget du owner (`ownerHasUsageBudget`). Ce qui change : le repli se DEMANDE
-- (`billTo: { projectOwner }` côté TS), il ne s'hérite plus, et il se voit ici.
--
--   'trigger'        — `user_id` EST le déclencheur de l'action (le cas normal)
--   'project_owner'  — pas de déclencheur nommable : le owner du projet paye
--   'unattributed'   — personne ne paye ; la ligne est comptée nulle part, et
--                      l'appel a journalisé l'anomalie côté serveur
--
-- Nullable et sans défaut : `null` = ligne écrite AVANT MIN-131, dont on ne sait
-- pas dire laquelle des trois elle était. Toute ligne écrite ensuite le porte.
-- Idempotent — safe to re-run.

alter table public.ai_usage
  add column if not exists billed_reason text
    check (billed_reason in ('trigger', 'project_owner', 'unattributed'));

comment on column public.ai_usage.billed_reason is
  'Pourquoi cette ligne est imputée à user_id (MIN-131). null = ligne antérieure à la colonne.';
