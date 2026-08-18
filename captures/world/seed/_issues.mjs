/**
 * Alignment of tickets already created with the data of their seed script.
 *
 * The board scripts only created what was missing, and no longer touched
 * never to existing tickets: add a description to an already seeded ticket
 * asked to delete it and recreate it — impossible, a ticket has a
 * plan, an agent run, a place in the fortnight.
 *
 * This pass makes the seeds CONVERGENT: rerolling 002 aligns the board with this
 * that the file describes, whatever its initial state.
 *
 * Two compulsory periods, imposed by the safeguards: a child cannot
 * be inserted in the same plane as its parent (the world is only refreshed
 * `apply()`). The category connections are therefore made AFTER the
 * tickets have been applied — hence the call at the end of the script, not the middle.
 *
 * Note on `updated_at`: the `issues_set_updated_at` trigger returns it to
 * `now()` on each modification, and nothing can prevent it from the client side.
 * A description added after the fact therefore shifts the date of modification of the
 * ticket. No capture shows it (the cards show the deadline, not the
 * last modification); only the order of the search index is found
 * changed, which the palette capture already assumes.
 */
import { createPlan } from "../../lib/guards.mjs";
import { resolveCategories } from "./_categories.mjs";

/**
 * Aligns project ticket descriptions and categories with `issues`
 * (the table of the calling script: `title`, `description`, `categories`).
 *
 * Idempotent: only modifies what diverges, only inserts the connections
 * absent, and never removes a category placed by hand.
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
    if (!row) continue; // ticket removed from the board by hand: we do not resuscitate it.

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

/** Readable summary, for the `--dry-run` of board scripts. */
export function describeMetadata(issues) {
  const withDescription = issues.filter((i) => i.description).length;
  const withCategory = issues.filter((i) => (i.categories ?? []).length > 0).length;
  return (
    `  • Aligner les tickets déjà créés : ${withDescription} description(s) et ` +
    `${withCategory} rattachement(s) de catégorie`
  );
}
