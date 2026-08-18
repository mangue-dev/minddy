/**
 * 004 — Camille’s fortnight.
 *
 * For which capture: `featureCycle` — “the current fortnight: from
 * several projects in the same list, visible progress”.
 *
 * Three schema constraints dictate this entire script:
 *
 * 1. The cycle displayed is the one that contains today’s date SERVER SIDE
 * (`reconcileCycles`). The frozen clock of captures only applies to the
 * browser: sowing other dates would cause an empty cycle to appear,
 * freshly created by the app next to ours.
 * 2. The window is not free: it is deduced from the cadence of the account,
 * anchored on Monday 1970-01-05. We therefore write the cadence in the
 * account preferences, then we calculate the window with the same algorithm.
 * 3. A ticket in a cycle is ALWAYS assigned to the owner of the cycle
 * (trigger `issues_enforce_cycle`): otherwise the database resets `cycle_id` to null
 * without saying anything. Only Camille's tickets can therefore enter.
 *
 * Consequence: this data EXPIRES when the fortnight changes. Reroll 003
 * then 004 realigns it to the current window.
 *
 * Idempotent: the cycle is reused if it already covers today's date.
 *
 *   node captures/world/seed/004-cycle.mjs --dry-run
 *   node captures/world/seed/004-cycle.mjs
 */
import { openDemoWorld, createPlan, updateDemoUserMetadata } from "../../lib/guards.mjs";
import { EFFORT_POINTS } from "../../lib/config.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";
import { currentCycleWindow, DEMO_CADENCE } from "./_cycle-window.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Demo account cycle preferences, written to `user_metadata` (keys
 * from lib/cycle-prefs.ts). `light` = 40 points per week: with around fifteen,
 * the target drops to 80, which puts the capacity ring around half
 * rather than at ground level.
 */
const CYCLE_PREFS = {
  // The cycles are OPT-IN: without this flag, the line exists in base but
  // the application displays “Enable Cycles” and the screen remains blank.
  cycles_enabled: true,
  cycle_duration_weeks: DEMO_CADENCE.durationWeeks,
  cycle_start_dow: DEMO_CADENCE.startDow,
  cycle_intensity: "light",
};

const INTENSITY_BASE_POINTS = { light: 40, medium: 80, heavy: 120 };

/**
 * Fortnightly tickets, designated by their displayed identifier. All
 * are Camille tickets — that’s the condition for them to stay there.
 * The AUR + BCN mix is ​​the very subject of capture.
 */
const CYCLE_ISSUES = [
  "AUR-1", "AUR-2", "AUR-9",
  "BCN-1", "BCN-2", "BCN-3", "BCN-4", "BCN-5", "BCN-6", "BCN-7", "BCN-8", "BCN-9",
];

/** Resolves "AUR-2" to the corresponding ticket line. */
async function resolveIssues(world, identifiers) {
  const byKey = new Map(world.demoProjects.map((p) => [p.key, p]));
  const wanted = identifiers.map((id) => {
    const [key, number] = id.split("-");
    const project = byKey.get(key);
    if (!project) throw new Error(`captures: projet ${key} introuvable (ticket ${id}).`);
    return { id, projectId: project.id, number: Number(number) };
  });

  const { data, error } = await world.admin
    .from("issues")
    .select("id, number, title, status, effort, assignee_id, project_id, cycle_id")
    .in("project_id", [...new Set(wanted.map((w) => w.projectId))]);
  if (error) throw new Error(`captures: lecture des tickets — ${error.message}`);

  return wanted.map((w) => {
    const row = (data || []).find((i) => i.project_id === w.projectId && i.number === w.number);
    if (!row) throw new Error(`captures: le ticket ${w.id} n'existe pas. Lance 002 et 003 d'abord.`);
    return { ...row, identifier: w.id };
  });
}

async function main() {
  const window = currentCycleWindow();
  const targetPoints =
    INTENSITY_BASE_POINTS[CYCLE_PREFS.cycle_intensity] * DEMO_CADENCE.durationWeeks;

  if (DRY_RUN) {
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log(`  • Régler les préférences de cycle de Camille : quinzaine, démarrage lundi, intensité « light »`);
    console.log(`  • Créer 1 quinzaine ${window.start} → ${window.end} (objectif ${targetPoints} points)`);
    console.log(`  • Y ranger ${CYCLE_ISSUES.length} tickets de Camille, de 2 projets : ${CYCLE_ISSUES.join(", ")}`);
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  requireProject(world, "AUR");
  requireProject(world, "BCN");

  // 1. The cadence must be written BEFORE everything: it is this which defines the
  // window that the application will search for.
  await updateDemoUserMetadata(world, {
    userId: people.camille,
    patch: CYCLE_PREFS,
    confirmed: true,
  });
  console.log("  → préférences de cycle réglées sur le compte de Camille");

  // 2. The cycle of the current window.
  const { data: cycles, error } = await world.admin
    .from("cycles")
    .select("id, start_date, end_date, target_points")
    .eq("user_id", people.camille)
    .eq("start_date", window.start);
  if (error) throw new Error(`captures: lecture des cycles — ${error.message}`);

  let cycle = (cycles || [])[0];
  if (!cycle) {
    const plan = createPlan(world);
    plan.insert(
      "cycles",
      [{
        user_id: people.camille,
        start_date: window.start,
        end_date: window.end,
        intensity: CYCLE_PREFS.cycle_intensity,
        target_points: targetPoints,
        // Requests auto-filling: without it, the application would pour into it
        // other tickets on first load and the capture would change.
        filled_at: new Date().toISOString(),
      }],
      "quinzaine",
    );
    console.log(plan.describe());
    const inserted = await plan.apply({ confirmed: true });
    cycle = inserted.cycles[0];
    console.log(`  → quinzaine ${cycle.start_date} → ${cycle.end_date} créée`);
  } else {
    console.log(`  → quinzaine ${cycle.start_date} déjà là, réutilisée`);
  }

  // 3. Tickets. One by one: `plan.update` rereads and checks each line
  // aim before hitting it.
  const issues = await resolveIssues(world, CYCLE_ISSUES);
  const misassigned = issues.filter((i) => i.assignee_id !== people.camille);
  if (misassigned.length > 0) {
    throw new Error(
      `captures: ces tickets ne sont pas assignés à Camille et sortiraient aussitôt du cycle — ` +
        misassigned.map((i) => i.identifier).join(", "),
    );
  }

  const toAttach = issues.filter((i) => i.cycle_id !== cycle.id);
  if (toAttach.length === 0) {
    console.log("  → les 12 tickets sont déjà dans la quinzaine");
  } else {
    const plan = createPlan(world);
    for (const issue of toAttach) {
      plan.update("issues", { id: issue.id }, { cycle_id: cycle.id }, `${issue.identifier} → quinzaine`);
    }
    console.log(plan.describe());
    await plan.apply({ confirmed: true });
    console.log(`  → ${toAttach.length} ticket(s) rangés dans la quinzaine`);
  }

  // 4. Control: did the trigger keep our tickets? If it ejected, the
  // capture would show an incomplete cycle without any error saying so.
  const after = await resolveIssues(world, CYCLE_ISSUES);
  const kept = after.filter((i) => i.cycle_id === cycle.id);
  const points = kept.reduce((sum, i) => sum + (EFFORT_POINTS[i.effort] ?? 3), 0);
  const donePoints = kept
    .filter((i) => i.status === "done" || i.status === "canceled")
    .reduce((sum, i) => sum + (EFFORT_POINTS[i.effort] ?? 3), 0);

  console.log(
    `\n  Quinzaine : ${kept.length}/${CYCLE_ISSUES.length} tickets, ${points} points sur ${targetPoints} ` +
      `(capacité ${Math.round((points / targetPoints) * 100)} %), ` +
      `terminés ${donePoints} points (complétion ${Math.round((donePoints / points) * 100)} %)`,
  );
  if (kept.length !== CYCLE_ISSUES.length) {
    throw new Error(
      `captures: ${CYCLE_ISSUES.length - kept.length} ticket(s) ont été éjectés du cycle par la base.`,
    );
  }
}

await main();
