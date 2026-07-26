/**
 * Le vocabulaire de catégories du monde de démo, partagé par tous les seeds.
 *
 * Les six catégories d'un projet ne sont PAS créées par nous : le trigger
 * `projects_seed_categories` les pose à la naissance du projet, avec des noms
 * français (`default_categories()` dans la migration 20260704161000). Or tout
 * le reste du monde de démo est en anglais — titres, descriptions, retours —
 * parce que les mêmes données servent les captures FR et EN. Une carte
 * anglaise portant « Fonctionnalité » se voit immédiatement.
 *
 * D'où ce module : les scripts désignent une catégorie par une CLÉ courte
 * (`feature`), jamais par un libellé. `013-categories-en.mjs` renomme les
 * lignes en anglais une fois pour toutes, et la résolution ci-dessous accepte
 * les deux noms — un seed reste donc rejouable avant comme après le renommage,
 * et sur un projet dont les catégories ont été semées en français.
 */
import { createPlan } from "../../lib/guards.mjs";

/** Miroir de `public.default_categories()`, plus le nom anglais et la clé. */
export const CATEGORIES = [
  { key: "bug", fr: "Bug", en: "Bug", color: "#ef4444" },
  { key: "feature", fr: "Fonctionnalité", en: "Feature", color: "#3b82f6" },
  { key: "improvement", fr: "Amélioration", en: "Improvement", color: "#22c55e" },
  { key: "design", fr: "Design", en: "Design", color: "#a855f7" },
  { key: "documentation", fr: "Documentation", en: "Documentation", color: "#eab308" },
  { key: "technical", fr: "Technique", en: "Technical", color: "#6b7280" },
];

/**
 * Garantit qu'un projet de démo porte ses six catégories, en anglais.
 *
 * Elles étaient posées par un trigger Postgres ; depuis la migration
 * `20260904090000`, c'est `POST /api/projects` qui sème, dans la langue de
 * l'appelant. Or les seeds écrivent en base directement — délibérément, pour
 * ne déclencher ni Smart Assign, ni notifications, ni facturation — donc
 * personne ne sèmerait pour eux. D'où cette fonction, appelée par les scripts
 * qui créent un projet.
 *
 * Idempotent : ne fait rien si le projet a déjà des catégories.
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

/** Nom anglais d'une clé — pour les résumés lisibles avant écriture. */
export function categoryLabel(key) {
  const category = CATEGORIES.find((c) => c.key === key);
  if (!category) throw new Error(`captures: catégorie inconnue « ${key} ».`);
  return category.en;
}

/**
 * Résout les six catégories d'un projet de démo : clé courte → ligne en base.
 * Accepte le nom anglais comme le nom français, pour rester valable des deux
 * côtés du renommage. Échoue si l'une manque — un projet sans ses catégories
 * par défaut est une anomalie, pas un cas à contourner en silence.
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
