/**
 * 013 — categories of demo projects, in English.
 *
 * For which capture: `heroBoard` first (each card now carries its
 * category, named in full next to a colored dot), but
 * also `feedbackBoard` and `feedbackInbox`, which have always displayed them.
 *
 * The problem is not ours: the six categories of a project are created
 * by the `projects_seed_categories` trigger, with FRENCH names. All the
 * rest of the world demo is in English — it's the principle, the same data
 * serve FR and EN captures. Until now it was not visible; from
 * moment when the hero's card displays "Feature" on the variant
 * anglaise, si.
 *
 * This script renames, and does just that: same lines, same identifiers,
 * same colors. Nothing is created, nothing is deleted, no attachment
 * bouge (ils pointent des identifiants, pas des noms).
 *
 * Idempotent: only lines still named in French are modified.
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
      // We ONLY touch the French names of the game by default. A category
      // added to the hand keeps its name: it is not in the table.
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
