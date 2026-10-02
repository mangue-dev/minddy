/**
 * 005 — Camille's notebook.
 *
 * Used by the scratchpad capture: two sections, completed and pending tasks,
 * and the section action revealed on hover.
 *
 * The notebook is a UNIQUE markdown note per person (`user_scratchpad`),
 * cross-project, in lib/plan.ts plan format: `- [ ]` pending, `- [~]` in
 * progress, `- [x]` done, `- [-]` cancelled.
 *
 * Existing notes are left untouched, including encrypted notes. Only the
 * owner's identifier is needed to check existence; never read their content.
 *
 *   node captures/world/seed/005-carnet.mjs --dry-run
 *   node captures/world/seed/005-carnet.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople } from "./_people.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * The contents of the notebook. Little things of the moment that don't deserve a
 * ticket — this is exactly what the notebook is supposed to show, and it should not
 * so definitely not that it looks like a board.
 */
const CONTENT = `## Before the release

- [x] Bump the changelog to 2.4
- [x] Check the upgrade notes render on mobile
- [~] Re-run the seed script on staging
- [ ] Ask Tom to sanity-check the migration order
- [ ] Turn the flag on for the two beta accounts

## Loose ends

- [x] Reply to the agency about the invoice
- [ ] Move the Friday sync half an hour later
- [ ] Cancel the old error-tracking plan
- [-] Rewrite the onboarding emails — Alice has it
`;

async function main() {
  if (DRY_RUN) {
    console.log("Planned changes (nothing is written):\n");
    console.log("  • Create one personal notebook for Camille Roy, with two sections:");
    for (const line of CONTENT.split("\n")) {
      if (line.startsWith("## ")) console.log(`      « ${line.slice(3)} »`);
      else if (line.startsWith("- [")) console.log(`        ${line}`);
    }
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);

  const { data: existing, error } = await world.admin
    .from("user_scratchpad")
    .select("user_id")
    .eq("user_id", people.camille)
    .maybeSingle();
  if (error) throw new Error(`captures: notebook lookup failed — ${error.message}`);

  if (existing) {
    console.log("  → Notebook already exists; left unchanged");
    return;
  }

  const plan = createPlan(world);
  plan.insert("user_scratchpad", [{ user_id: people.camille, content: CONTENT }], "notebook");
  console.log(plan.describe());
  await plan.apply({ confirmed: true });
  console.log("  → Notebook created for Camille");
}

await main();
