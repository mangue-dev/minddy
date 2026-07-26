-- minddy — les catégories par défaut passent côté application
--
-- `default_categories()` renvoyait six noms écrits en dur EN FRANÇAIS, et le
-- trigger `projects_seed_categories` les posait sur chaque projet créé : un
-- utilisateur anglais héritait de « Fonctionnalité », « Amélioration » et
-- « Technique ». Postgres ne connaît pas la langue de l'appelant ; l'app, si.
--
-- POST /api/projects sème désormais le même jeu, traduit
-- (`Categories.defaults` dans messages/*.json, ordre et couleurs dans
-- lib/default-categories.ts), exactement comme il le fait déjà pour les vues
-- par défaut (`ensureBaselineViews`). Le semis n'a lieu que si le projet n'a
-- aucune catégorie : rejouable, et sans doublon possible.
--
-- Aucune catégorie existante n'est touchée : ce sont des données que les
-- équipes ont pu renommer, recolorer ou supprimer depuis longtemps.
-- Idempotent — safe to re-run.

drop trigger if exists projects_seed_categories on public.projects;
drop function if exists public.seed_default_categories();
drop function if exists public.default_categories();
