/**
 * Fill the demo account's statistics ledger from its existing history
 * (MIN-737): one "issue created" event per demo issue Camille created, at its
 * creation date, and one "issue completed" event per completed issue assigned
 * to her, at its completion date. Nothing is invented: the profile statistics
 * then describe the demo world exactly as it already is.
 *
 * Snapshot texts stay empty (no project name, title or task text), so the
 * rows carry nothing to encrypt. Idempotent: an event already recorded for
 * the same issue and kind is never added twice. The default run only
 * describes the plan; `--apply` requires the user's explicit approval.
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { DEMO_EMAIL } from "../../lib/config.mjs";

const world = await openDemoWorld();
const owner = world.demoUsers.find((user) => user.email === DEMO_EMAIL);
if (!owner) throw new Error("The demo owner must exist.");
const projects = new Map(world.demoProjects.map((project) => [project.id, project]));

const { data: issues, error } = await world.admin.from("issues")
  .select("id, project_id, number, status, created_by, assignee_id, created_at, completed_at, deleted_at")
  .in("project_id", [...projects.keys()]).is("deleted_at", null);
if (error) throw new Error(`Cannot read the demo issues: ${error.message}`);

const { data: existing, error: existingError } = await world.admin.from("stat_events")
  .select("kind, issue_id").eq("user_id", owner.id);
if (existingError) throw new Error(`Cannot read the demo statistics: ${existingError.message}`);
const recorded = new Set(existing.map((event) => `${event.kind}:${event.issue_id}`));

const event = (kind, issue, occurredAt) => {
  // Every reference must stay inside the demo world.
  if (!projects.has(issue.project_id)) throw new Error("Refused: issue outside a demo project.");
  return {
    user_id: owner.id,
    kind,
    occurred_at: occurredAt,
    project_id: issue.project_id,
    project_name: null,
    issue_id: issue.id,
    issue_number: issue.number,
    issue_title: null,
    task_text: null,
  };
};

const rows = [];
for (const issue of issues) {
  if (issue.created_by === owner.id && !recorded.has(`issue_created:${issue.id}`)) {
    rows.push(event("issue_created", issue, issue.created_at));
  }
  if (issue.status === "done" && issue.completed_at && issue.assignee_id === owner.id
      && !recorded.has(`issue_completed:${issue.id}`)) {
    rows.push(event("issue_completed", issue, issue.completed_at));
  }
}

if (rows.length === 0) {
  console.log("The demo statistics already mirror the demo history.");
} else {
  const plan = createPlan(world);
  plan.insert("stat_events", rows, "événement de statistiques");
  const byKind = (kind) => rows.filter((row) => row.kind === kind).length;
  console.log(`${byKind("issue_created")} issue-created and ${byKind("issue_completed")} issue-completed events.`);
  console.log(plan.describe());
  if (process.argv.includes("--apply")) {
    await plan.apply({ confirmed: true });
    console.log("Applied.");
  } else {
    console.log("Apply with --apply only after the user approves this specific data change.");
  }
}
