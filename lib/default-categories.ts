/**
 * The set of categories placed on each new project.
 *
 * It lived in the database (`public.default_categories()`, trigger
 * `projects_seed_categories`), with names written hard IN FRENCH:
 * Postgres does not know the language from the one who created the project, so an English user inherited "Feature" and "Improvement". same
 * gesture as for default views (`ensureBaselineViews`). Here like
 * there, the name is FIXED at creation: it is editable data
 * then, not interface labels. Changing the language later does not re-translate them, and that is intended — otherwise renaming a category would be
 * impossible.
 *
 * The order is that of the old trigger: it determines the display order
 * (the categories are listed by `created_at`).
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
