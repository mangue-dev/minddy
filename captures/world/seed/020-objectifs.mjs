/**
 * 020 — Aurora's objectives.
 *
 * For which captures: objective pickers (open objectives first, each with its
 * status and colored name), objective pills on issue cards and in the feedback
 * list, objective mentions and the command palette (MIN-785). Four objectives
 * cover the four statuses; five open Aurora tickets and the two oldest
 * feedback requests are filed under the two open ones.
 *
 * Aurora has a content key, so an objective's name is protected content: each
 * new row is encoded with the application's own codec
 * (`captures/lib/encrypted-content.mjs`) before the guarded insert, and the
 * existing ones are decoded to be recognized by name. No key is ever created.
 * Nothing is sent, billed or attached to a real account or project.
 *
 * Idempotent: an objective that exists by name is left as is (its status
 * included), and a ticket or request already filed under its objective is not
 * touched again.
 *
 *   node captures/world/seed/020-objectifs.mjs          (describes)
 *   node captures/world/seed/020-objectifs.mjs --apply  (writes, after approval)
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { openContentCodec } from "../../lib/encrypted-content.mjs";
import { requireProject } from "./_people.mjs";

const APPLY = process.argv.includes("--apply");

const OBJECTIVES = [
  { name: "Public launch", status: "in_progress", color: "#3b82f6", issues: 3, feedback: 1 },
  { name: "Onboarding revamp", status: "in_progress", color: "#a855f7", issues: 2, feedback: 1 },
  { name: "Search v2", status: "done", color: "#22c55e", issues: 0, feedback: 0 },
  { name: "Legacy importer", status: "canceled", color: "#f97316", issues: 0, feedback: 0 },
];

async function read(world, table, columns, projectId) {
  const { data, error } = await world.admin.from(table).select(columns).eq("project_id", projectId);
  if (error) throw new Error(`captures: reading ${table} — ${error.message}`);
  return data ?? [];
}

async function objectivesByName(world, codec, projectId) {
  const rows = await read(world, "objectives", "*", projectId);
  const decoded = await Promise.all(rows.map((row) => codec.decode("objectives", row)));
  return new Map(decoded.map((row) => [row.name, row.id]));
}

/** Open tickets in number order and feedback requests oldest first, dealt to
    the objectives in the order of `OBJECTIVES`. */
async function assignments(world, projectId) {
  const issues = (await read(world, "issues", "id, number, status, objective_id, deleted_at", projectId))
    .filter((issue) => !issue.deleted_at && !["done", "canceled", "duplicate", "triage"].includes(issue.status))
    .sort((a, b) => a.number - b.number);
  const posts = (await read(world, "feedback_posts", "id, created_at, objective_id", projectId))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const dealt = [];
  let nextIssue = 0;
  let nextPost = 0;
  for (const objective of OBJECTIVES) {
    for (const issue of issues.slice(nextIssue, nextIssue + objective.issues)) {
      dealt.push({ table: "issues", row: issue, objective: objective.name, label: `ticket AUR-${issue.number}` });
    }
    for (const post of posts.slice(nextPost, nextPost + objective.feedback)) {
      dealt.push({ table: "feedback_posts", row: post, objective: objective.name, label: "retour" });
    }
    nextIssue += objective.issues;
    nextPost += objective.feedback;
  }
  return dealt;
}

async function main() {
  const world = await openDemoWorld();
  const project = requireProject(world, "AUR");
  const codec = await openContentCodec(world);

  const existing = await objectivesByName(world, codec, project.id);
  const missing = OBJECTIVES.filter((objective) => !existing.has(objective.name));

  if (!APPLY) {
    console.log("Ce que ce script ferait (rien n'est écrit) :\n");
    for (const objective of missing) {
      console.log(`  • Créer l'objectif « ${objective.name} » (${objective.status}) dans Aurora`);
    }
    const linked = (await assignments(world, project.id))
      .filter(({ row, objective }) => row.objective_id !== existing.get(objective));
    for (const { label, objective } of linked) console.log(`  • Ranger ${label} sous « ${objective} »`);
    if (!missing.length && !linked.length) console.log("  • Rien : le monde de démo est déjà à jour.");
    return;
  }

  if (missing.length) {
    const plan = createPlan(world);
    const rows = await Promise.all(missing.map((objective) => codec.encode("objectives", {
      project_id: project.id,
      name: objective.name,
      description: null,
      status: objective.status,
      color: objective.color,
    })));
    plan.insert("objectives", rows, "objectif");
    console.log(plan.describe());
    await plan.apply({ confirmed: true });
  }

  const ids = await objectivesByName(world, codec, project.id);
  const links = createPlan(world);
  for (const { table, row, objective, label } of await assignments(world, project.id)) {
    if (row.objective_id !== ids.get(objective)) {
      links.update(table, { id: row.id }, { objective_id: ids.get(objective) }, `${label} → ${objective}`);
    }
  }
  console.log(links.describe());
  await links.apply({ confirmed: true });
}

await main();
