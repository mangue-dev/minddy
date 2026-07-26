/**
 * Le jeu de catégories posé sur chaque projet neuf.
 *
 * Il vivait dans la base (`public.default_categories()`, trigger
 * `projects_seed_categories`), avec des noms écrits en dur EN FRANÇAIS :
 * Postgres ne connaît pas la langue de celui qui crée le projet, donc un
 * utilisateur anglais héritait de « Fonctionnalité » et « Amélioration ».
 *
 * Les noms sont donc devenus des chaînes traduites (`Categories.defaults`),
 * et c'est l'application qui sème, dans la langue de la requête — le même
 * geste que pour les vues par défaut (`ensureBaselineViews`). Ici comme
 * là-bas, le nom est FIGÉ à la création : ce sont des données éditables
 * ensuite, pas des libellés d'interface. Changer de langue plus tard ne les
 * retraduit pas, et c'est voulu — sinon renommer une catégorie serait
 * impossible.
 *
 * L'ordre est celui de l'ancien trigger : il détermine l'ordre d'affichage
 * (les catégories se listent par `created_at`).
 */
export const DEFAULT_CATEGORIES = [
  { key: "bug", color: "#ef4444" },
  { key: "feature", color: "#3b82f6" },
  { key: "improvement", color: "#22c55e" },
  { key: "design", color: "#a855f7" },
  { key: "documentation", color: "#eab308" },
  { key: "technical", color: "#6b7280" },
] as const;

export type DefaultCategoryKey = (typeof DEFAULT_CATEGORIES)[number]["key"];
