-- minddy — Réglages projet de la revue Numo du feedback.
--
-- Deux interrupteurs, sur `projects` (à côté de smart_assign_enabled /
-- auto_assign_enabled — même famille : une capacité IA que le owner arme ou
-- désarme). PAS sur `feedback_boards` : la revue s'applique aux TROIS canaux
-- (board public, API, saisie interne), et un projet qui n'utilise que l'API n'a
-- pas de ligne board du tout.
--
--   feedback_review_enabled          — true (défaut) : chaque retour passe par
--     la revue Numo avant publication (catégorisation, junk, contenu sensible).
--     false : les retours sont publiés tels quels, sans catégorie ni modération.
--
--   feedback_review_skip_over_budget — que faire quand la revue est armée mais
--     que le budget IA du owner est épuisé. false (défaut) : le retour attend
--     (fail-closed — rien de non modéré ne part sur un board public) ; true :
--     il est publié sans revue, comme si elle était désactivée.
--
-- Les deux options sont donc « off » par défaut : revue active, pas de bascule
-- automatique. Le kill-switch d'instance `app_config.feedback_classify_enabled`
-- reste au-dessus des deux (admin, tous projets confondus).
-- Idempotent — safe to re-run.

alter table public.projects
  add column if not exists feedback_review_enabled boolean not null default true,
  add column if not exists feedback_review_skip_over_budget boolean not null default false;
