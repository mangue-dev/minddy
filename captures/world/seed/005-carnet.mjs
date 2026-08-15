/**
 * 005 — le carnet de Camille.
 *
 * Pour quelle capture : `scratchpad` — « la modale du carnet de tâches : deux
 * sections « ## », des tâches cochées et d'autres à faire, et une action de
 * section visible au survol ».
 *
 * Le carnet est une note markdown UNIQUE par personne (`user_scratchpad`),
 * cross-projet, au format de plan de lib/plan.ts : `- [ ]` à faire, `- [~]` en
 * cours, `- [x]` fait, `- [-]` annulé.
 *
 * Idempotent : la note n'est écrite que si elle n'existe pas. On ne réécrit
 * jamais par-dessus — le carnet est éditable à la main, et l'écraser
 * silencieusement ferait perdre ce qui aurait été ajusté pour une capture.
 *
 *   node captures/world/seed/005-carnet.mjs --dry-run
 *   node captures/world/seed/005-carnet.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople } from "./_people.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Le contenu du carnet. Des petites choses du moment qui ne méritent pas un
 * ticket — c'est exactement ce que le carnet est censé montrer, et il ne faut
 * donc surtout pas que ça ressemble à un board.
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
