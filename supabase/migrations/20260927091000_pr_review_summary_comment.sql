-- minddy — la review de Numo retrouve son message de verdict.
--
-- `pr_review_runs.summary_comment_id` porte l'id du commentaire de fil qui
-- CONTIENT la synthèse, chez la forge. C'est lui qui relie la session à sa trace
-- visible : le déroulé de la passe (ce que Numo a lu, les points qu'il a posés)
-- s'affiche replié DANS ce message, et la carte de session en direct sait
-- s'effacer quand son message est arrivé — sans cet id, elle resterait à vie.
--
-- Migration à part, et non une retouche de `20260927090000_pr_review_runs` :
-- cette table-là est DÉJÀ créée en prod, et `create table if not exists` ne
-- touche pas une table existante. Ajouter la colonne dans le `create` d'une
-- migration déjà passée ne l'aurait donc jamais fait arriver — c'est exactement
-- ce qui s'est produit (« column pr_review_runs.summary_comment_id does not
-- exist » au premier clic après le re-push).
--
-- Idempotent — safe to re-run.

alter table public.pr_review_runs
  add column if not exists summary_comment_id bigint;
