-- minddy — « Feedback : journal d'activité » (MIN-57)
-- Parité complète avec l'activité des tickets et des objectifs. Plutôt qu'une
-- table feedback_events parallèle, on prolonge le polymorphisme déjà en place
-- sur issue_events (issue OU objectif) avec un TROISIÈME parent : le post de
-- feedback. Les rows sont écrites/lues côté service-role (le feedback reste RLS
-- deny-all — les checks d'accès vivent dans lib/server/feedback/*), donc la
-- policy de select n'a pas besoin d'une branche feedback. Pas de realtime :
-- l'onglet équipe refetch/invalide (même note que le reste du feedback).
-- Idempotent — safe to re-run.

alter table public.issue_events alter column issue_id drop not null;
alter table public.issue_events
  add column if not exists feedback_post_id uuid
    references public.feedback_posts(id) on delete cascade;

create index if not exists idx_issue_events_feedback
  on public.issue_events(feedback_post_id, created_at)
  where feedback_post_id is not null;

-- Exactement-un-parent, maintenant sur trois colonnes (les rows existantes ont
-- toutes issue_id OU objective_id → num_nonnulls = 1 tient déjà).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'issue_events_parent_ck') then
    alter table public.issue_events drop constraint issue_events_parent_ck;
  end if;
  alter table public.issue_events
    add constraint issue_events_parent_ck
    check (num_nonnulls(issue_id, objective_id, feedback_post_id) = 1);
end $$;
