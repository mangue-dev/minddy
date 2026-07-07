-- minddy — réponses aux commentaires (threads à 1 niveau, modèle Linear).
-- parent_id référence toujours la RACINE du fil ; profondeur ≤ 1 résolue
-- côté serveur dans POST /api/issues/[id]/comments (idem cohérence
-- parent/issue). Les policies RLS existantes couvrent les réponses
-- (mêmes issue_id/author_id). Idempotent — safe to re-run.

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists idx_comments_parent
  on public.comments(parent_id) where parent_id is not null;
