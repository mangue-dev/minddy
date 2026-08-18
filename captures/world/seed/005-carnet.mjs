/**
 * 005 — Camille's notebook.
 *
 * For which capture: `scratchpad` — “the task book modal: two
 * “##” sections, tasks checked and others to do, and an action to
 * section visible au survol ».
 *
 * The notebook is a UNIQUE markdown note per person (`user_scratchpad`),
 * cross-project, in lib/plan.ts plan format: `- [ ]` to do, `- [~]` in
 * course, `- [x]` done, `- [-]` cancelled.
 *
 * Idempotent: the note is only written if it does not exist. We don't rewrite
 * never over — the notebook can be edited by hand, and overwrite
 * silently would lose what would have been adjusted for a capture.
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
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log("  • Créer 1 carnet personnel pour Camille Roy, avec 2 sections :");
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
    .select("user_id, content")
    .eq("user_id", people.camille)
    .maybeSingle();
  if (error) throw new Error(`captures: lecture du carnet — ${error.message}`);

  if (existing) {
    const tasks = (existing.content || "").split("\n").filter((l) => l.startsWith('- [')).length;
    console.log(`  → carnet déjà là (${tasks} tâches), laissé tel quel`);
    return;
  }

  const plan = createPlan(world);
  plan.insert("user_scratchpad", [{ user_id: people.camille, content: CONTENT }], "carnet");
  console.log(plan.describe());
  await plan.apply({ confirmed: true });
  console.log("  → carnet créé pour Camille");
}

await main();
