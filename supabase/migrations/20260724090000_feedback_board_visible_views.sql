-- minddy — MIN-37 : le couplage board ⇄ vues partagées se fait vue par vue.
-- visible_view_ids = les vues (views.id) affichées en onglets sur le board
-- quand show_views est actif. Vide = aucune (chaque vue est opt-in).
-- Idempotent — safe to re-run.

alter table public.feedback_boards
  add column if not exists visible_view_ids uuid[] not null default '{}';
