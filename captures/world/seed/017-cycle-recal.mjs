/**
 * 017 — Realign the cycle world for the `featureCycle` capture.
 *
 * Two demo-world corrections, both targeting the current fortnight:
 *
 * 1. AUR-18 ("Remember the last used filter per project") was auto-captured
 *    into Camille's cycle by the app's auto-capture on issue completion. It
 *    makes 13 tickets where the capture's story needs exactly the 12 seeded
 *    ones ("En cours 4"). It leaves the cycle and is reassigned to Alice so
 *    the auto-capture pool (issues assigned to Camille) never pulls it back —
 *    the `issues_enforce_cycle` trigger keeps cycle tickets owned by the
 *    cycle's user, so the reassignment is what keeps it out for good.
 * 2. The capacity ring read 93 % instead of the intended ~45 %: the app
 *    calibrates the velocity factor from the last 3 CLOSED cycles
 *    (completed_points 15/0/0 of 80 → factor floored at 0.5 → target 40).
 *    Setting those three cycles' completed_points to 80 restores factor 1,
 *    target 80, and the ring lands at 36/80 = 45 %. Reconcile only rewrites
 *    completed_points while null, so the values stick.
 *
 * Idempotent: both steps check current state before writing.
 *
 *   node captures/world/seed/017-cycle-recal.mjs --dry-run
 *   node captures/world/seed/017-cycle-recal.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople } from "./_people.mjs";
import { currentCycleWindow } from "./_cycle-window.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const world = await openDemoWorld();
  const people = resolvePeople(world);
  const window = currentCycleWindow();

  // The current fortnight row: the seed's window (start matches the cadence).
  const { data: cycles, error } = await world.admin
    .from("cycles")
    .select("id, start_date, end_date, target_points")
    .eq("user_id", people.camille)
    .eq("start_date", window.start);
  if (error) throw new Error(`captures: lecture des cycles — ${error.message}`);
  const cycle = (cycles || [])[0];
  if (!cycle) throw new Error(`captures: quinzaine ${window.start} introuvable — lance 004-cycle.mjs d'abord.`);

  // 1. AUR-18 out of the cycle, and out of Camille's auto-capture pool.
  const { data: aur18 } = await world.admin
    .from("issues")
    .select("id, number, title, assignee_id, cycle_id, project_id")
    .eq("cycle_id", cycle.id)
    .not("assignee_id", "eq", people.camille)
    .limit(1);
  const extra = (aur18 || [])[0];
  // Actually AUR-18 IS assigned to Camille; find it by title instead.
  const { data: aur18b } = await world.admin
    .from("issues")
    .select("id, number, title, assignee_id, cycle_id")
    .eq("cycle_id", cycle.id)
    .ilike("title", "Remember the last used filter%")
    .limit(1);
  const stray = extra ?? (aur18b || [])[0];
  if (!stray) {
    console.log("  → pas de ticket intrus dans la quinzaine, rien à retirer");
  } else {
    const plan = createPlan(world);
    plan.update("issues", { id: stray.id }, { cycle_id: null, assignee_id: people.alice },
      `AUR-${stray.number} sort de la quinzaine (réassigné à Alice)`);
    console.log(plan.describe());
    if (!DRY_RUN) {
      await plan.apply({ confirmed: true });
      console.log(`  → le ticket ${stray.title.slice(0, 40)}… a quitté la quinzaine`);
    }
  }

  // 2. Recalibration: the last 3 closed cycles back to 80 completed points.
  const { data: closed, error: closedError } = await world.admin
    .from("cycles")
    .select("id, start_date, end_date, completed_points")
    .eq("user_id", people.camille)
    .not("completed_points", "is", null)
    .order("start_date", { ascending: false })
    .limit(3);
  if (closedError) throw new Error(`captures: lecture des cycles closes — ${closedError.message}`);
  const stale = (closed || []).filter((c) => c.completed_points !== 80);
  if (stale.length === 0) {
    console.log("  → calibration déjà à 80 points sur les 3 dernières closes");
  } else {
    const plan = createPlan(world);
    for (const c of stale) {
      plan.update("cycles", { id: c.id }, { completed_points: 80 },
        `quinzaine ${c.start_date}→${c.end_date} : 80 pts terminés (recalibrage)`);
    }
    console.log(plan.describe());
    if (!DRY_RUN) {
      await plan.apply({ confirmed: true });
      console.log(`  → ${stale.length} quinzaine(s) close(s) recalibrée(s)`);
    }
  }
}

await main();
