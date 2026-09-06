/** Move the five completed Beacon demo issues into the current demo cycle. */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { DEMO_EMAIL } from "../../lib/config.mjs";
import { currentCycleWindow } from "./_cycle-window.mjs";

const world = await openDemoWorld();
const owner = world.demoUsers.find((user) => user.email === DEMO_EMAIL);
const project = world.demoProjects.find((item) => item.key === "BCN");
if (!owner || !project) throw new Error("The demo owner and Beacon project must exist.");

const { start } = currentCycleWindow();
const { data: cycle, error: cycleError } = await world.admin.from("cycles")
  .select("id").eq("user_id", owner.id).eq("start_date", start).single();
if (cycleError) throw new Error(`Cannot read the current demo cycle: ${cycleError.message}`);

const { data: issues, error } = await world.admin.from("issues")
  .select("id, number, status, assignee_id, cycle_id")
  .eq("project_id", project.id).in("number", [1, 2, 3, 4, 5]);
if (error) throw new Error(`Cannot read completed Beacon issues: ${error.message}`);
if (issues.length !== 5 || issues.some((issue) => issue.status !== "done" || issue.assignee_id !== owner.id)) {
  throw new Error("Expected five completed Beacon issues assigned to the demo owner.");
}

const pending = issues.filter((issue) => issue.cycle_id !== cycle.id);
if (pending.length) {
  const plan = createPlan(world);
  for (const issue of pending) {
    plan.update("issues", { id: issue.id }, { cycle_id: cycle.id }, `BCN-${issue.number}`);
  }
  if (process.argv.includes("--apply")) {
    await plan.apply({ confirmed: true });
    console.log(`Moved ${pending.length} completed demo issues into the cycle starting ${start}.`);
  } else {
    console.log(`Would move ${pending.length} completed demo issues into the cycle starting ${start}.`);
    console.log("Apply with --apply only after the user approves this specific data change.");
  }
} else {
  console.log("All five completed demo issues are already in the current cycle.");
}
