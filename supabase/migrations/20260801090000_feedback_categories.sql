-- minddy — MIN-52 : catégories sur les feedbacks
-- Les posts réutilisent les catégories du projet (public.categories, celles des
-- issues) via une table de jonction N–N, miroir d'issue_categories. Deny-all
-- RLS comme toutes les tables feedback : service-role uniquement, les checks
-- d'accès vivent dans lib/server/feedback/*. Un flag board (opt-in, off par
-- défaut) décide si les catégories sont exposées sur le board public — sinon
-- elles ne servent qu'au dashboard équipe.
-- Idempotent — safe to re-run.

-- ── post ↔ category (N–N) ────────────────────────────────────────────────────
create table if not exists public.feedback_post_categories (
  post_id     uuid not null references public.feedback_posts(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (post_id, category_id)
);

create index if not exists idx_feedback_post_categories_category
  on public.feedback_post_categories(category_id);

alter table public.feedback_post_categories enable row level security;
-- Deny-all: no policies. Service-role only.

-- ── Affichage public opt-in ──────────────────────────────────────────────────
-- false (défaut) : les catégories restent internes (dashboard équipe). true :
-- elles s'affichent sur le board public.
alter table public.feedback_boards
  add column if not exists show_categories boolean not null default false;
