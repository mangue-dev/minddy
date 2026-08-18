/**
 * 009 — balance the columns of Aurora.
 *
 * For which capture: `heroBoard`. The first run showed it — Backlog (2) and
 * To do (3) against In progress (4 description cards) left around 40%
 * of the first image of the site in white. We add 3 tickets to the Backlog and 2 to
 * to do, including three with description to give height to the cards.
 *
 * This is the loop provided by the two skills: `capture-shot` reveals that the
 * given is wrong, `capture-world` adjusts it. Nothing is rebuilt.
 *
 * Idempotent: only absent titles are created.
 *
 *   node captures/world/seed/009-densite-aurora.mjs --dry-run
 *   node captures/world/seed/009-densite-aurora.mjs
 */
import { openDemoWorld, createPlan, callRpc } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";
import { categoryLabel } from "./_categories.mjs";
import { describeMetadata, syncIssueMetadata } from "./_issues.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Fixed dates, before July 15, 2026 (the fixed moment of captures),
 * like the rest of the Aurora board — unlike Beacon, whose dates
 * follow the current fortnight.
 */
const ISSUES = [
  {
    title: "Two-factor authentication for the workspace",
    description:
      "Enterprise prospects raise it on every call. TOTP and recovery codes first; single sign-on is a separate conversation.",
    categories: ["feature"],
    status: "backlog",
    priority: "medium",
    effort: "l",
    assignee: null,
    createdAt: "2026-07-03T10:20:00Z",
  },
  {
    title: "Audit log for workspace admins",
    description:
      "Who changed what, and when. Ninety days of retention covers what we sell today.",
    categories: ["feature"],
    status: "backlog",
    priority: "low",
    effort: "l",
    assignee: null,
    createdAt: "2026-07-01T15:45:00Z",
  },
  {
    title: "Merge two accounts created with the same email",
    description:
      "People sign up with Google, then again with a password, and end up with two half-empty workspaces.",
    categories: ["improvement"],
    status: "backlog",
    priority: "low",
    effort: "m",
    assignee: null,
    createdAt: "2026-06-30T09:10:00Z",
  },
  {
    title: "Inline editing of issue titles on the board",
    description:
      "Renaming a ticket takes four clicks today. Double-click the title, type, press Enter.",
    categories: ["improvement"],
    status: "todo",
    priority: "high",
    effort: "m",
    assignee: "tom",
    createdAt: "2026-07-09T11:30:00Z",
  },
  {
    title: "Remember the last used filter per project",
    description:
      "Filters reset on every visit. Keep the last one per project, and let a single click clear it.",
    categories: ["improvement"],
    status: "todo",
    priority: "low",
    effort: "xs",
    assignee: null,
    createdAt: "2026-07-04T16:05:00Z",
  },
];

function describeIntent() {
  const lines = ["  • Ajouter 5 tickets au projet Aurora :"];
  for (const issue of ISSUES) {
    const who = issue.assignee ? ` → ${issue.assignee}` : " → non assigné";
    const cats = (issue.categories ?? []).map(categoryLabel).join(", ");
    lines.push(
      `      - [${issue.status}] ${issue.title} [${issue.priority}/${issue.effort}]${who}` +
        `${cats ? ` · ${cats}` : ""}`,
    );
  }
  lines.push(describeMetadata(ISSUES));
  return lines.join("\n");
}

async function main() {
  if (DRY_RUN) {
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log(describeIntent());
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  const project = requireProject(world, "AUR");

  const { data: existing, error } = await world.admin
    .from("issues")
    .select("title, position")
    .eq("project_id", project.id);
  if (error) throw new Error(`captures: lecture des tickets — ${error.message}`);

  const known = new Set((existing || []).map((i) => i.title));
  // We arrange AFTER the existing tickets: the column is ordered by
  // `position`, and newcomers do not have to intervene.
  let position = Math.max(0, ...(existing || []).map((i) => i.position ?? 0));

  const rows = [];
  for (const issue of ISSUES) {
    if (known.has(issue.title)) continue;
    const number = await callRpc(world, "next_issue_number", { p_project_id: project.id });
    position += 1000;
    rows.push({
      project_id: project.id,
      number,
      title: issue.title,
      description: issue.description ?? null,
      status: issue.status,
      priority: issue.priority,
      effort: issue.effort,
      assignee_id: issue.assignee ? people[issue.assignee] : null,
      position,
      created_by: people.camille,
      created_at: issue.createdAt,
      updated_at: issue.createdAt,
    });
  }

  if (rows.length === 0) {
    console.log("  → rien à ajouter, les colonnes sont déjà équilibrées");
  } else {
    const plan = createPlan(world);
    plan.insert("issues", rows, "ticket");
    console.log(plan.describe());
    await plan.apply({ confirmed: true });
  }

  // Descriptions and categories — second pass, see `_issues.mjs`.
  await syncIssueMetadata(world, project, ISSUES);

  const { data: after } = await world.admin
    .from("issues")
    .select("status")
    .eq("project_id", project.id);
  const counts = {};
  for (const i of after || []) counts[i.status] = (counts[i.status] || 0) + 1;
  console.log(`\n  → ${rows.length} ticket(s) ajouté(s). Colonnes d'Aurora :`, counts);
}

await main();
