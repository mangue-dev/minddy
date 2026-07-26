/**
 * Alignement des tickets déjà créés sur la donnée de leur script de seed.
 *
 * Les scripts de board ne créaient que ce qui manquait, et ne touchaient plus
 * jamais aux tickets existants : ajouter une description à un ticket déjà semé
 * demandait de le supprimer et de le recréer — impossible, un ticket porte un
 * plan, un run d'agent, une place dans la quinzaine.
 *
 * Cette passe rend les seeds CONVERGENTS : relancer 002 aligne le board sur ce
 * que le fichier décrit, quel que soit son état de départ.
 *
 * Deux temps obligatoires, imposés par les garde-fous : un enfant ne peut pas
 * être inséré dans le même plan que son parent (le monde n'est rafraîchi qu'à
 * `apply()`). Les rattachements de catégories sont donc posés APRÈS que les
 * tickets ont été appliqués — d'où l'appel en fin de script, pas au milieu.
 *
 * Note sur `updated_at` : le trigger `issues_set_updated_at` le repose à
 * `now()` à chaque modification, et rien ne peut l'en empêcher côté client.
 * Une description ajoutée après coup décale donc la date de modification du
 * ticket. Aucune capture ne l'affiche (les cartes montrent l'échéance, pas la
 * dernière modification) ; seul l'ordre de l'index de recherche s'en trouve
 * changé, ce que la capture de la palette assume déjà.
 */
import { createPlan } from "../../lib/guards.mjs";
import { resolveCategories } from "./_categories.mjs";

/**
 * Aligne descriptions et catégories des tickets d'un projet sur `issues`
 * (le tableau du script appelant : `title`, `description`, `categories`).
 *
 * Idempotent : ne modifie que ce qui diverge, n'insère que les rattachements
 * absents, et ne retire jamais une catégorie posée à la main.
 */
export async function syncIssueMetadata(world, project, issues) {
  const { data: rows, error } = await world.admin
    .from("issues")
    .select("id, title, description")
    .eq("project_id", project.id);
  if (error) throw new Error(`captures: lecture des tickets — ${error.message}`);

  const byTitle = new Map((rows || []).map((r) => [r.title, r]));
  const categories = await resolveCategories(world, project.id);

  const ids = (rows || []).map((r) => r.id);
  const { data: existingLinks, error: linkError } = ids.length
    ? await world.admin
        .from("issue_categories")
        .select("issue_id, category_id")
        .in("issue_id", ids)
    : { data: [], error: null };
  if (linkError) throw new Error(`captures: lecture des catégories des tickets — ${linkError.message}`);
  const linked = new Set((existingLinks || []).map((l) => `${l.issue_id}:${l.category_id}`));

  const plan = createPlan(world);
  const missingLinks = [];
  let descriptions = 0;

  for (const issue of issues) {
    const row = byTitle.get(issue.title);
    if (!row) continue; // ticket retiré du board à la main : on ne le ressuscite pas.

    const wanted = issue.description ?? null;
    if (wanted !== (row.description ?? null)) {
      plan.update("issues", { id: row.id }, { description: wanted }, `description de « ${issue.title} »`);
      descriptions += 1;
    }

    for (const key of issue.categories ?? []) {
      const category = categories.get(key);
      if (!category) throw new Error(`captures: catégorie inconnue « ${key} ».`);
      if (linked.has(`${row.id}:${category.id}`)) continue;
      missingLinks.push({ issue_id: row.id, category_id: category.id });
    }
  }

  if (missingLinks.length > 0) {
    plan.insert("issue_categories", missingLinks, "catégorie de ticket");
  }

  if (descriptions === 0 && missingLinks.length === 0) {
    console.log("  → descriptions et catégories déjà à jour");
    return { descriptions: 0, links: 0 };
  }

  console.log(plan.describe());
  await plan.apply({ confirmed: true });
  console.log(
    `  → ${descriptions} description(s) posée(s), ${missingLinks.length} catégorie(s) rattachée(s)`,
  );
  return { descriptions, links: missingLinks.length };
}

/** Résumé lisible, pour le `--dry-run` des scripts de board. */
export function describeMetadata(issues) {
  const withDescription = issues.filter((i) => i.description).length;
  const withCategory = issues.filter((i) => (i.categories ?? []).length > 0).length;
  return (
    `  • Aligner les tickets déjà créés : ${withDescription} description(s) et ` +
    `${withCategory} rattachement(s) de catégorie`
  );
}
