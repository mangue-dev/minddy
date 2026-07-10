-- minddy — MIN-37 : le couplage board ⇄ vues partagées devient opt-in.
-- show_views=false (défaut) : le board public n'affiche pas d'onglets et les
-- vues partagées ne pointent pas vers le board. À activer dans les settings.
-- Idempotent — safe to re-run.

alter table public.feedback_boards
  add column if not exists show_views boolean not null default false;
