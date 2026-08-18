/**
 * 002 — the “Aurora” project and its board.
 *
 * Used by `heroBoard` (the main landing-page capture — the board grouped by
 * status), `featurePalette` (the ⌘K palette, which returns to these tickets),
 * and `workflowIssue` (the ticket detail view with its implementation plan and
 * tasks checked off, in progress, or still to do).
 *
 * Aurora is a fictitious product. The titles are in English: the captures
 * exist in FR and EN, and the same data serves both variants.
 *
 * Idempotent: the project is reused if it exists, and only the tickets
 * absent are created (comparison by title).
 *
 * User agreement: “account + project + board” batch, data in English.
 *
 * node captures/world/seed/002-projet-aurora.mjs --dry-run # describes, writes nothing
 * node captures/world/seed/002-projet-aurora.mjs # apply
 */
import { openDemoWorld, createPlan, callRpc } from "../../lib/guards.mjs";
import { categoryLabel, ensureCategories } from "./_categories.mjs";
import { describeMetadata, syncIssueMetadata } from "./_issues.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const PROJECT = { name: "Aurora", key: "AUR" };

/** Short key → email, to attach tickets without pasting identifiers here. */
const PEOPLE = {
  camille: "captures-demo@minddy.app",
  alice: "captures-demo+alice@minddy.app",
  tom: "captures-demo+tom@minddy.app",
};

/** Colleagues added to the project. The owner is NOT in project_members. */
const MEMBERS = ["alice", "tom"];

/**
 * The implementation plan attached to a ticket. This is the one photographed
 * by `workflowIssue`: it must show a real engineering plan, with completed
 * tasks, one task in progress, and the rest still to do.
 */
const PALETTE_PLAN = `Add a discoverable shortcut layer to the command palette, so the actions people
run twenty times a day stop needing the mouse.

## Approach

Shortcuts are declared next to the action they trigger, not in a global map:
the palette already owns the action registry, so it stays the single source of
truth and a new action can never ship without its hint.

- [x] Declare an optional \`shortcut\` on the action type in \`lib/palette/actions.ts\`
- [x] Render the key hint on the right of each row in \`components/palette/row.tsx\`
- [~] Bind the global listener in \`components/palette/provider.tsx\`, ignoring events from inputs and textareas
- [ ] Support two-key sequences (\`g\` then \`n\`) with a 900 ms reset timer
- [ ] Add the shortcut column to the help sheet
- [ ] Verify: open the palette, type \`assign\`, press the displayed hint — the action runs and the palette closes`;

/**
 * The board. The dates are before July 15, 2026, the frozen moment of
 * captures (`CAPTURE.frozenNow`), so that the mentions “3 days ago”
 * are stable and credible from one run to the next.
 *
 * EACH ticket has a description and at least one category: this is what the
 * hero card displays (a three-line preview under the title and a colored dot
 * with its name in the bottom-right corner), and a card without them looks
 * empty. Categories are designated by short key — see `_categories.mjs`.
 */
const ISSUES = [
  {
    title: "Dark mode flickers on first paint",
    description:
      "The theme is read from localStorage after hydration, so the light palette shows for a frame before the dark one takes over. Most visible on slow connections.",
    categories: ["bug", "design"],
    status: "in_progress",
    priority: "urgent",
    effort: "s",
    assignee: "camille",
    createdAt: "2026-07-13T09:12:00Z",
    updatedAt: "2026-07-15T08:12:00Z",
  },
  {
    title: "Add keyboard shortcuts to the command palette",
    description:
      "Power users live in the palette but still reach for the mouse to run an action. Show the shortcut next to each row, and make it work from anywhere in the app.",
    categories: ["feature"],
    plan: PALETTE_PLAN,
    status: "in_progress",
    priority: "high",
    effort: "m",
    assignee: "camille",
    createdAt: "2026-07-09T14:30:00Z",
    updatedAt: "2026-07-15T09:40:00Z",
    dueDate: "2026-07-24",
  },
  {
    title: "Rework the onboarding checklist",
    description:
      "Only one person in ten finishes the current checklist. Cut it to three steps and let people skip straight to the board.",
    categories: ["design"],
    status: "in_progress",
    priority: "high",
    effort: "m",
    assignee: "alice",
    createdAt: "2026-07-08T10:05:00Z",
    updatedAt: "2026-07-14T16:20:00Z",
  },
  {
    title: "Cache avatar lookups on the members endpoint",
    description:
      "Every board load resolves the same handful of accounts one round-trip at a time. A short in-memory TTL removes the N+1.",
    categories: ["technical"],
    status: "in_progress",
    priority: "medium",
    effort: "s",
    assignee: "tom",
    createdAt: "2026-07-11T11:45:00Z",
    updatedAt: "2026-07-14T09:02:00Z",
  },
  {
    title: "Bulk-assign issues from the board",
    description:
      "Select several rows, then assign them in one go instead of opening each ticket.",
    categories: ["feature"],
    status: "todo",
    priority: "high",
    effort: "m",
    assignee: "alice",
    createdAt: "2026-07-10T08:20:00Z",
    dueDate: "2026-07-22",
  },
  {
    title: "Weekly activity digest by email",
    description:
      "One email on Monday morning: what shipped, what moved, what stalled. Opt-in per project, unsubscribe in one click.",
    categories: ["feature"],
    status: "todo",
    priority: "medium",
    effort: "l",
    assignee: "tom",
    createdAt: "2026-07-07T15:10:00Z",
  },
  {
    title: "Export a project as CSV",
    description:
      "Board data people can drop into a spreadsheet: one row per ticket, with its status, assignee and effort.",
    categories: ["feature"],
    status: "todo",
    priority: "low",
    effort: "s",
    assignee: null,
    createdAt: "2026-07-05T13:00:00Z",
  },
  {
    title: "Fix timezone drift on due dates",
    description:
      "A due date set at 23:00 in Paris shows as the day before for anyone west of UTC. Store the date, not the instant.",
    categories: ["bug"],
    status: "in_review",
    priority: "high",
    effort: "s",
    assignee: "tom",
    createdAt: "2026-07-06T09:35:00Z",
    updatedAt: "2026-07-14T17:48:00Z",
  },
  {
    title: "Persist the sidebar collapsed state",
    description:
      "Collapsing the sidebar only lasts until the next page load. Remember the choice per account, not per tab.",
    categories: ["improvement"],
    status: "in_review",
    priority: "low",
    effort: "xs",
    assignee: "camille",
    createdAt: "2026-07-12T10:15:00Z",
    updatedAt: "2026-07-15T07:55:00Z",
  },
  {
    title: "Slack notifications for mentions",
    description:
      "Being mentioned in a comment should reach people where they already are. Direct message first, channel routing later.",
    categories: ["feature"],
    status: "backlog",
    priority: "medium",
    effort: "l",
    assignee: null,
    createdAt: "2026-07-02T14:05:00Z",
  },
  {
    title: "Public roadmap page",
    description:
      "A read-only page showing what shipped, what is in progress and what is planned — fed by the board, with no second list to maintain.",
    categories: ["feature", "design"],
    status: "backlog",
    priority: "low",
    effort: "xl",
    assignee: null,
    createdAt: "2026-06-28T11:20:00Z",
  },
  {
    title: "Drag issues between columns",
    description:
      "Moving a ticket meant opening it and changing its status. Drag the card, drop it in the column, done.",
    categories: ["feature"],
    status: "done",
    priority: "high",
    effort: "m",
    assignee: "camille",
    createdAt: "2026-06-24T09:00:00Z",
    updatedAt: "2026-07-11T15:30:00Z",
    completedAt: "2026-07-11T15:30:00Z",
  },
  {
    title: "Invite teammates by email",
    description:
      "Send an invitation from the project settings, with a link that expires after seven days.",
    categories: ["feature"],
    status: "done",
    priority: "medium",
    effort: "s",
    assignee: "alice",
    createdAt: "2026-06-26T16:40:00Z",
    updatedAt: "2026-07-09T12:10:00Z",
    completedAt: "2026-07-09T12:10:00Z",
  },
];

/** Resolves demo family emails to account IDs. */
function resolvePeople(world) {
  const byEmail = new Map(world.demoUsers.map((u) => [u.email, u.id]));
  const ids = {};
  for (const [key, email] of Object.entries(PEOPLE)) {
    const id = byEmail.get(email);
    if (!id) {
      throw new Error(
        `captures: le compte ${email} n'existe pas. Lance d'abord 001-comptes.mjs.`,
      );
    }
    ids[key] = id;
  }
  return ids;
}

function describeIntent() {
  const byStatus = {};
  for (const issue of ISSUES) (byStatus[issue.status] ||= []).push(issue);
  const lines = [
    `  • Créer 1 projet « ${PROJECT.name} » (clé ${PROJECT.key}), détenu par Camille Roy`,
    `  • Ajouter 2 collègues au projet : Alice Fontaine, Tom Berger`,
    `  • Créer ${ISSUES.length} tickets :`,
  ];
  for (const [status, list] of Object.entries(byStatus)) {
    lines.push(`      ${status} (${list.length}) :`);
    for (const issue of list) {
      const who = issue.assignee ? ` → ${issue.assignee}` : " → non assigné";
      const plan = issue.plan ? " · avec plan d'implémentation" : "";
      const cats = (issue.categories ?? []).map(categoryLabel).join(", ");
      lines.push(
        `        - ${issue.title} [${issue.priority}/${issue.effort}]${who}${plan}` +
          `${cats ? ` · ${cats}` : ""}`,
      );
    }
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
  const owner = people.camille;

  // ── The project ─────────────────────────────── ───────────────────────────────
  let project = world.demoProjects.find((p) => p.key === PROJECT.key && !p.deleted_at);
  if (!project) {
    const plan = createPlan(world);
    plan.insert("projects", [{ owner_id: owner, name: PROJECT.name, key: PROJECT.key }], "projet");
    console.log(plan.describe());
    const inserted = await plan.apply({ confirmed: true });
    project = inserted.projects[0];
    console.log(`  → projet ${project.key} créé`);
  } else {
    console.log(`  → projet ${project.key} déjà là, réutilisé`);
  }

  // The categories no longer come from a trigger: it is the app that sows them, and
  // the seeds write in base without going through it. See `_categories.mjs`.
  await ensureCategories(world, project.id);

  // ── Colleagues ───────────────────────────── ─────────────────────────────
  const { data: existingMembers, error: memberError } = await world.admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", project.id);
  if (memberError) throw new Error(`captures: lecture des membres — ${memberError.message}`);
  const present = new Set((existingMembers || []).map((m) => m.user_id));

  const missingMembers = MEMBERS.filter((key) => !present.has(people[key])).map((key) => ({
    project_id: project.id,
    user_id: people[key],
    role: "member",
    added_by: owner,
  }));

  // ── Tickets ────────────────────────────── ──────────────────────────────
  const { data: existingIssues, error: issueError } = await world.admin
    .from("issues")
    .select("title")
    .eq("project_id", project.id);
  if (issueError) throw new Error(`captures: lecture des tickets — ${issueError.message}`);
  const known = new Set((existingIssues || []).map((i) => i.title));

  const missingIssues = [];
  for (const [index, issue] of ISSUES.entries()) {
    if (known.has(issue.title)) continue;
    // The number comes from the database, never from a local counter: it
    // supplies the displayed identifier AUR-42 and must remain atomic.
    const number = await callRpc(world, "next_issue_number", { p_project_id: project.id });
    missingIssues.push({
      project_id: project.id,
      number,
      title: issue.title,
      description: issue.description ?? null,
      plan: issue.plan ?? null,
      status: issue.status,
      priority: issue.priority,
      effort: issue.effort,
      assignee_id: issue.assignee ? people[issue.assignee] : null,
      due_date: issue.dueDate ?? null,
      position: (index + 1) * 1000,
      created_by: owner,
      created_at: issue.createdAt,
      updated_at: issue.updatedAt ?? issue.createdAt,
      completed_at: issue.completedAt ?? null,
    });
  }

  if (missingMembers.length === 0 && missingIssues.length === 0) {
    console.log("  → rien à ajouter, le board est déjà complet");
  } else {
    const plan = createPlan(world);
    if (missingMembers.length > 0) plan.insert("project_members", missingMembers, "collègue");
    if (missingIssues.length > 0) plan.insert("issues", missingIssues, "ticket");
    console.log(plan.describe());
    await plan.apply({ confirmed: true });
    console.log(
      `  → ${missingMembers.length} collègue(s) et ${missingIssues.length} ticket(s) ajoutés`,
    );
  }

  // ── Descriptions and categories ────────────────────── ───────────────────────
  // Mandatory second pass: a category attachment cannot be inserted in the
  // same plan as the ticket it targets. It also catches up with tickets seeded
  // before these fields existed in this file.
  await syncIssueMetadata(world, project, ISSUES);
}

await main();
