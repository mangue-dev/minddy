/**
 * The category vocabulary of the demo world, shared by all seeds.
 *
 * The six categories of a project are NOT created by us: the trigger
 * `projects_seed_categories` asks them at the birth of the project, with names
 * French (`default_categories()` in migration 20260704161000). But everything
 * the rest of the demo world is in English — titles, descriptions, feedback —
 * because the same data serves the FR and EN captures. A map
 * English with “Functionality” is immediately visible.
 *
 * Hence this module: scripts designate a category with a short KEY
 * (`feature`), never by a label. `013-categories-en.mjs` renames them
 * lines in English once and for all, and the resolution below accepts
 * both names — a seed therefore remains replayable before as well as after renaming,
 * and on a project whose categories were sown in French.
 */
import { createPlan } from "../../lib/guards.mjs";

/** Mirror of `public.default_categories()`, plus English name and key. */
export const CATEGORIES = [
  { key: "bug", fr: "Bug", en: "Bug", color: "#ef4444" },
  { key: "feature", fr: "Fonctionnalité", en: "Feature", color: "#3b82f6" },
  { key: "improvement", fr: "Amélioration", en: "Improvement", color: "#22c55e" },
  { key: "design", fr: "Design", en: "Design", color: "#a855f7" },
  { key: "documentation", fr: "Documentation", en: "Documentation", color: "#eab308" },
  { key: "technical", fr: "Technique", en: "Technical", color: "#6b7280" },
];

/**
 * Guarantees that a demo project carries its six categories, in English.
 *
 * They were posed by a Postgres trigger; since migration
 * `20260904090000`, it is `POST /api/projects` which sows, in the language of
 * the caller. But the seeds write to the base directly — deliberately, to
 * do not trigger Smart Assign, notifications, or billing — so
 * no one would sow for them. Hence this function, called by the scripts
 * who create a project.
 *
 * Idempotent: does nothing if the project already has categories.
 */
export async function ensureCategories(world, projectId) {
  const { data, error } = await world.admin
    .from("categories")
    .select("id")
    .eq("project_id", projectId);
  if (error) throw new Error(`captures: lecture des catégories — ${error.message}`);
  if ((data || []).length > 0) return { created: 0 };

  const plan = createPlan(world);
  plan.insert(
    "categories",
    CATEGORIES.map((c) => ({ project_id: projectId, name: c.en, color: c.color })),
    "catégorie",
  );
  console.log(plan.describe());
  await plan.apply({ confirmed: true });
  console.log(`  → ${CATEGORIES.length} catégories posées (en anglais)`);
  return { created: CATEGORIES.length };
}

/** English name of a key — for readable summaries before writing. */
export function categoryLabel(key) {
  const category = CATEGORIES.find((c) => c.key === key);
  if (!category) throw new Error(`captures: catégorie inconnue « ${key} ».`);
  return category.en;
}

/**
 * Solves the six categories of a demo project: short key → basic line.
 * Accepts the English name as well as the French name, to remain valid for both
 * sides of the renaming. Fails if one is missing — a project without its categories
 * default is an anomaly, not one to be silently worked around.
 */
export async function resolveCategories(world, projectId) {
  const { data, error } = await world.admin
    .from("categories")
    .select("id, name, color, project_id")
    .eq("project_id", projectId);
  if (error) throw new Error(`captures: lecture des catégories — ${error.message}`);

  const byName = new Map((data || []).map((c) => [c.name, c]));
  const resolved = new Map();
  for (const category of CATEGORIES) {
    const row = byName.get(category.en) ?? byName.get(category.fr);
    if (!row) {
      throw new Error(
        `captures: la catégorie « ${category.en} » est absente du projet ${projectId}. ` +
          `Elles viennent du trigger de création de projet — vérifie l'état dans world.md.`,
      );
    }
    resolved.set(category.key, row);
  }
  return resolved;
}
