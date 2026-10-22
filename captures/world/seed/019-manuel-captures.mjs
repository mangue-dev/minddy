/**
 * 019 — demo data for the remaining manual screenshots.
 *
 * For which captures:
 * - `triage-incoming`: an incoming ticket waiting in Aurora's triage,
 *   created by Alice, with its description;
 * - `reader-trash`: one Aurora ticket in the trash, deleted by Camille;
 * - `feedback-pages-and-views-workflow`: a short "Feedback guide" page,
 *   published read-only and shown as a tab of Aurora's public feedback board.
 *
 * Writes go through the shared guards only. The published page is a public
 * read-only share of a demo page, anchored by that page; the board change
 * only arms its page tabs. Nothing is sent, billed or attached to a real
 * account or project.
 *
 * Idempotent: a ticket or page that already exists by title is left as is,
 * an existing share is reused, and the board is only updated when its page
 * tabs differ.
 *
 *   node captures/world/seed/019-manuel-captures.mjs          (describes)
 *   node captures/world/seed/019-manuel-captures.mjs --apply  (writes, after approval)
 */
import { randomBytes, randomUUID } from "node:crypto";
import { openDemoWorld, createPlan, callRpc } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";
import { assertIssueSeedWritable } from "./_issues.mjs";

const APPLY = process.argv.includes("--apply");

const TRIAGE = {
  title: "Review an incoming keyboard report",
  description:
    "Incoming report: the focus ring disappears when tabbing through the board filters. Reproduce it with the keyboard before accepting.",
  createdAt: "2026-10-22T10:20:00Z",
};

const TRASHED = {
  title: "Check the mobile navigation",
  description: "Open the board on a phone and check that every navigation link stays reachable.",
  createdAt: "2026-10-14T09:00:00Z",
  deletedAt: "2026-10-20T16:00:00Z",
};

const PAGE_TITLE = "Feedback guide";
const PAGE_UPDATED_AT = "2026-10-20T15:00:00Z";

const blockId = () => ({ blockId: randomUUID() });
const text = (value) => ({ type: "text", text: value });
const paragraph = (value) => ({ type: "paragraph", attrs: blockId(), content: [text(value)] });
const heading = (level, value) => ({ type: "heading", attrs: { ...blockId(), level }, content: [text(value)] });

const PAGE_CONTENT = {
  type: "doc",
  content: [
    paragraph("Read requests, vote for useful changes and follow their progress."),
    heading(2, "How we read feedback"),
    paragraph("Every request is read by the team within a week. Planned requests move to the roadmap; shipped ones say so here."),
    heading(2, "Before you post"),
    paragraph("Search first and vote on an existing request when it describes your need."),
  ],
};

function plainText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text;
  return (node.content || []).map(plainText).filter(Boolean).join("\n");
}

function describeIntent() {
  return [
    `  • Créer 1 ticket entrant en triage sur Aurora : « ${TRIAGE.title} », créé par Alice`,
    `  • Créer 1 ticket « ${TRASHED.title} » sur Aurora et le placer dans la corbeille, supprimé par Camille`,
    `  • Créer 1 page « ${PAGE_TITLE} » dans Aurora, la publier en lecture seule`,
    "  • Afficher cette page comme onglet du board public de retours d'Aurora",
  ].join("\n");
}

async function main() {
  if (!APPLY) {
    console.log("Ce que ce script ferait (rien n'est écrit) :\n");
    console.log(describeIntent());
    console.log("\nRelancer avec --apply, après accord, pour écrire.");
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  const project = requireProject(world, "AUR");
  await assertIssueSeedWritable(world, project.id);

  const { data: existing, error } = await world.admin
    .from("issues")
    .select("id, title, position, deleted_at")
    .eq("project_id", project.id);
  if (error) throw new Error(`captures: lecture des tickets — ${error.message}`);
  const byTitle = new Map((existing || []).map((issue) => [issue.title, issue]));
  let position = Math.max(0, ...(existing || []).map((issue) => issue.position ?? 0));

  const issuePlan = createPlan(world);
  let newIssues = 0;
  if (!byTitle.has(TRIAGE.title)) {
    position += 1000;
    issuePlan.insert("issues", [{
      project_id: project.id,
      number: await callRpc(world, "next_issue_number", { p_project_id: project.id }),
      title: TRIAGE.title,
      description: TRIAGE.description,
      status: "triage",
      priority: "none",
      effort: null,
      assignee_id: null,
      position,
      created_by: people.alice,
      created_at: TRIAGE.createdAt,
      updated_at: TRIAGE.createdAt,
    }], "ticket entrant en triage");
    newIssues += 1;
  }
  if (!byTitle.has(TRASHED.title)) {
    position += 1000;
    issuePlan.insert("issues", [{
      project_id: project.id,
      number: await callRpc(world, "next_issue_number", { p_project_id: project.id }),
      title: TRASHED.title,
      description: TRASHED.description,
      status: "todo",
      priority: "medium",
      effort: "s",
      assignee_id: people.camille,
      position,
      created_by: people.camille,
      created_at: TRASHED.createdAt,
      updated_at: TRASHED.deletedAt,
      deleted_at: TRASHED.deletedAt,
      deleted_by: people.camille,
    }], "ticket dans la corbeille");
    newIssues += 1;
  }
  if (newIssues > 0) {
    console.log(issuePlan.describe());
    await issuePlan.apply({ confirmed: true });
  } else {
    console.log("  → tickets déjà là");
  }

  // The page, its read-only publication, and the board's page tabs.
  const { data: pages, error: pageError } = await world.admin
    .from("pages")
    .select("id, title")
    .eq("project_id", project.id)
    .eq("title", PAGE_TITLE)
    .is("deleted_at", null);
  if (pageError) throw new Error(`captures: lecture des pages — ${pageError.message}`);
  let pageId = pages?.[0]?.id;
  if (!pageId) {
    pageId = randomUUID();
    const pagePlan = createPlan(world);
    pagePlan.insert("pages", [{
      id: pageId,
      project_id: project.id,
      parent_id: null,
      title: PAGE_TITLE,
      icon: "💬",
      content: PAGE_CONTENT,
      position: "x",
      search_text: plainText(PAGE_CONTENT),
      created_by: people.camille,
      updated_by: people.camille,
      created_at: PAGE_UPDATED_AT,
      updated_at: PAGE_UPDATED_AT,
    }], "page publiée sur le board");
    console.log(pagePlan.describe());
    await pagePlan.apply({ confirmed: true });
  }

  const { data: shares, error: shareError } = await world.admin
    .from("view_shares")
    .select("id")
    .eq("page_id", pageId);
  if (shareError) throw new Error(`captures: lecture des publications — ${shareError.message}`);
  if (!shares?.length) {
    const sharePlan = createPlan(world);
    sharePlan.insert("view_shares", [{
      page_id: pageId,
      view_id: null,
      level: "public",
      token: randomBytes(16).toString("base64url"),
      include_children: false,
      created_by: people.camille,
    }], "publication en lecture seule de la page");
    console.log(sharePlan.describe());
    await sharePlan.apply({ confirmed: true });
  }

  const { data: board, error: boardError } = await world.admin
    .from("feedback_boards")
    .select("id, show_pages, visible_page_ids")
    .eq("project_id", project.id)
    .maybeSingle();
  if (boardError) throw new Error(`captures: lecture du board — ${boardError.message}`);
  if (!board) throw new Error("captures: Aurora n'a pas de board de retours (rejouer 007).");
  const visible = board.visible_page_ids ?? [];
  if (!board.show_pages || !visible.includes(pageId)) {
    const boardPlan = createPlan(world);
    boardPlan.update(
      "feedback_boards",
      { id: board.id },
      { show_pages: true, visible_page_ids: [...new Set([...visible, pageId])] },
      "onglet de page du board public",
    );
    console.log(boardPlan.describe());
    await boardPlan.apply({ confirmed: true });
  } else {
    console.log("  → onglet de page déjà affiché");
  }
}

await main();
