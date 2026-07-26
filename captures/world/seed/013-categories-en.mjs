/**
 * 013 — les catégories des projets de démo, en anglais.
 *
 * Pour quelle capture : `heroBoard` d'abord (chaque carte porte désormais sa
 * catégorie, nommée en toutes lettres à côté d'une pastille de couleur), mais
 * aussi `feedbackBoard` et `feedbackInbox`, qui les affichent depuis toujours.
 *
 * Le problème n'est pas de nous : les six catégories d'un projet sont créées
 * par le trigger `projects_seed_categories`, avec des noms FRANÇAIS. Tout le
 * reste du monde de démo est en anglais — c'est le principe, les mêmes données
 * servent les captures FR et EN. Jusqu'ici ça ne se voyait pas ; à partir du
 * moment où la carte du hero affiche « Fonctionnalité » sur la variante
 * anglaise, si.
 *
 * Ce script renomme, et ne fait que ça : mêmes lignes, mêmes identifiants,
 * mêmes couleurs. Rien n'est créé, rien n'est supprimé, aucun rattachement ne
 * bouge (ils pointent des identifiants, pas des noms).
 *
 * Idempotent : seules les lignes encore nommées en français sont modifiées.
 *
 *   node captures/world/seed/013-categories-en.mjs --dry-run
 *   node captures/world/seed/013-categories-en.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { CATEGORIES } from "./_categories.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

function describeIntent() {
  const lines = ["  • Renommer les catégories des projets de démo (Aurora, Beacon) :"];
  for (const category of CATEGORIES) {
    if (category.fr === category.en) {
      lines.push(`      - ${category.fr} → inchangé`);
    } else {
      lines.push(`      - ${category.fr} → ${category.en}`);
    }
  }
  lines.push("  • Les couleurs, les rattachements et les tickets ne bougent pas.");
  return lines.join("\n");
}

async function main() {
  if (DRY_RUN) {
    console.log("Ce que ce script changerait (rien n'est écrit) :\n");
    console.log(describeIntent());
    return;
  }

  const world = await openDemoWorld();
  const projects = world.demoProjects.filter((p) => !p.deleted_at);
  if (projects.length === 0) {
    throw new Error("captures: aucun projet de démo. Lance d'abord 002 et 003.");
  }

  const plan = createPlan(world);
  let renames = 0;

  for (const project of projects) {
    const { data: rows, error } = await world.admin
      .from("categories")
      .select("id, name")
      .eq("project_id", project.id);
    if (error) throw new Error(`captures: lecture des catégories — ${error.message}`);

    for (const row of rows || []) {
      // On ne touche QUE les noms français du jeu par défaut. Une catégorie
      // ajoutée à la main garde son nom : elle n'est pas dans la table.
      const target = CATEGORIES.find((c) => c.fr === row.name && c.fr !== c.en);
      if (!target) continue;
      plan.update(
        "categories",
        { id: row.id },
        { name: target.en },
        `catégorie de ${project.key} « ${row.name} »`,
      );
      renames += 1;
    }
  }

  if (renames === 0) {
    console.log("  → les catégories sont déjà en anglais, rien à faire");
    return;
  }

  console.log(plan.describe());
  await plan.apply({ confirmed: true });
  console.log(`  → ${renames} catégorie(s) renommée(s)`);

  for (const project of projects) {
    const { data: rows } = await world.admin
      .from("categories")
      .select("name")
      .eq("project_id", project.id)
      .order("name");
    console.log(`    ${project.key} : ${(rows || []).map((r) => r.name).join(", ")}`);
  }
}

await main();
