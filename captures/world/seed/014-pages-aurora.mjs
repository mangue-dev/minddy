/**
 * 014 — the Aurora pages (the project wiki).
 *
 * For which capture: `pagesEditor` — “an open wiki page: on the left
 * the project page tree with a page unfolded on its subpages, at
 * right the content — a title, a paragraph, a list of checkboxes
 * including two checked, and a mention pill towards a ticket in the text”.
 *
 * What this poses: four root pages, one of which (“Product handbook”) covers
 * three subpages. The one we photograph is “Release process”, under the
 * handbook: it is she who carries the task list and the note.
 *
 * ─── The body of a page is JSON ProseMirror ────────────────────────────
 *
 * Not markdown: the markdown projection is produced elsewhere
 * (lib/pages-markdown.ts) and requests a DOM. We therefore write the document as
 * that it is stored, with the block register node names
 * (components/pages/blocks) — `paragraph`, `heading`, `taskList`, `taskItem` —
 * and the `blockId` attribute that `UniqueID` sets on the editor side. Placing it here avoids
 * that the opening of the page immediately writes in base to give it to itself.
 *
 * ─── The mention is a NODE, not text ───────────────────────────────────
 *
 * Unlike a ticket description, the page editor does not hydrate
 * the “@…” written in text: `hydrateMentions` is only called by
 * components/markdown-editor.tsx. An “@AUR-2” placed in plain text would remain
 * therefore text. The pill is stored in node `mention`, with the attributes that
 * the editor would itself produce (`attrsFromScanned`, markdown-mention.tsx):
 * `mentionType: "issue"`, `mentionId` = l'id du ticket, `mentionLabel` = son
 * identifier displayed.
 *
 *   node captures/world/seed/014-pages-aurora.mjs --dry-run
 *   node captures/world/seed/014-pages-aurora.mjs
 */
import { randomUUID } from "node:crypto";
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/** The ticket cited by the page — the one that already has the implementation plan. */
const MENTIONED_ISSUE = "Add keyboard shortcuts to the command palette";

/* ── Node factories ────────────────────────── ────────────────────────── */

/** A block identifier, such as `UniqueID` sets one upon typing. */
const blockId = () => ({ blockId: randomUUID() });

const text = (value) => ({ type: "text", text: value });

/** The pill of a ticket. `mentionId` is resolved at runtime. */
const issueMention = (issue) => ({
  type: "mention",
  attrs: {
    mentionType: "issue",
    mentionId: issue.id,
    mentionLabel: issue.identifier,
    seed: null,
    color: null,
    icon: null,
  },
});

const paragraph = (...inline) => ({
  type: "paragraph",
  attrs: blockId(),
  content: inline.length ? inline : undefined,
});

const heading = (level, value) => ({
  type: "heading",
  attrs: { ...blockId(), level },
  content: [text(value)],
});

/**
 * A task. The four states of the plan are carried by `state`
 * (components/scratchpad/task-nodes.ts); `checked` is the attribute inherited from
 * TipTap, which we keep consistent with it — that's what goes into the DOM.
 *
 * The values ​​are those of `PLAN_TASK_STATES` (lib/plan.ts): `pending`,
 * `in_progress`, `completed`, `cancelled`. An off-list value does not raise —
 * the view silently returns to “to do”, and the page is displayed with
 * five empty boxes without a single error being said.
 */
const task = (state, value) => ({
  type: "taskItem",
  attrs: { state, checked: state === "completed" },
  content: [{ type: "paragraph", content: [text(value)] }],
});

const taskList = (...items) => ({
  type: "taskList",
  attrs: blockId(),
  content: items,
});

const bullet = (...values) => ({
  type: "bulletList",
  attrs: blockId(),
  content: values.map((value) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [text(value)] }],
  })),
});

const quote = (value) => ({
  type: "blockquote",
  attrs: blockId(),
  content: [{ type: "paragraph", content: [text(value)] }],
});

const doc = (...blocks) => ({ type: "doc", content: blocks });

/** The bare text of a document — what `search_text` should carry. */
function plainText(node) {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "mention") return `@${node.attrs?.mentionLabel ?? ""}`;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(plainText).join(" ");
}

/* ── L'arbre ─────────────────────────────────────────────────────────────── */

/**
 * The positions are FRACTIONAL indexes (lib/pages.ts): digits of
 * the 62-value alphabet, compared like strings, never ended with
 * zero. Four well-spaced neighbors are enough here — the seed does not insert between
 * deux pages existantes.
 */
const POSITIONS = ["V", "a", "g", "m"];

/**
 * All dates are BEFORE July 15, 2026, the frozen moment of
 * captures (`CAPTURE.frozenNow`): the page header displays “Modified by
 * Camille Roy · N days ago", and a date after the clock of
 * browser would make a page written three weeks later say “now”
 * early.
 *
 * Consequence on idempotence: `updated_at` is taken up by a trigger
 * `before update` (pages_set_updated_at), a modification can NOT be made
 * backdate. A page already there is removed then rewritten, to identifier
 * constant — this is the only way that keeps the date.
 */
const CREATED_AT = "2026-06-30T09:12:00.000Z";

/**
 * The tree, in display order. The bodies are in ENGLISH like the rest
 * from the demo world: the same data is used for FR and EN captures.
 *
 * `body` receives resolved tickets so it can cite one of them.
 */
const TREE = [
  {
    key: "handbook",
    updated: "2026-07-09T14:05:00.000Z",
    icon: "📘",
    title: "Product handbook",
    body: () =>
      doc(
        paragraph(
          text(
            "How we work on Aurora: what we ship, how we decide, and who to ask when something is on fire.",
          ),
        ),
        heading(2, "In this section"),
        paragraph(
          text(
            "Release process, design principles, and the support playbook. Keep them short — a page nobody rereads is a page nobody trusts.",
          ),
        ),
      ),
    children: [
      {
        key: "release",
        updated: "2026-07-13T16:20:00.000Z",
        icon: "🚀",
        title: "Release process",
        /** THE photographed page. */
        body: (issue) =>
          doc(
            paragraph(
              text(
                "We ship on Thursday. Anything that isn't merged by Wednesday noon waits for the next release — no exceptions, no late merges.",
              ),
            ),
            heading(2, "Before you ship"),
            taskList(
              task("completed", "Freeze the release branch"),
              task("completed", "Run the full test suite on staging"),
              task("pending", "Update the changelog"),
              task("pending", "Tag the release and deploy"),
              task("pending", "Post the release note in #product"),
            ),
            paragraph(
              text("Everything is merged except "),
              issueMention(issue),
              text(
                ", still in review — Camille decides on Thursday morning whether it ships with the rest.",
              ),
            ),
            heading(2, "After the deploy"),
            bullet(
              "Watch the error rate for twenty minutes — most regressions show up in the first ten.",
              "Reply in the release thread with what actually shipped, in one sentence.",
              "Close the tickets that went out, and move the rest to next Thursday.",
            ),
            heading(2, "If something breaks"),
            paragraph(
              text(
                "Roll back first, explain afterwards. A revert takes four minutes; a hotfix written under pressure rarely does.",
              ),
            ),
            quote(
              "Rolling back is not a failure. Shipping on a Friday to avoid one is.",
            ),
          ),
      },
      {
        key: "design",
        updated: "2026-07-06T10:40:00.000Z",
        icon: "🎨",
        title: "Design principles",
        body: () =>
          doc(
            paragraph(
              text(
                "Four rules we hold on to when a screen gets crowded: one job per screen, no setting without a default, plain words, and nothing that moves without a reason.",
              ),
            ),
          ),
      },
      {
        key: "support",
        updated: "2026-07-02T15:55:00.000Z",
        icon: "🛟",
        title: "Support playbook",
        body: () =>
          doc(
            paragraph(
              text(
                "Answer within a day, reproduce before promising a fix, and open a ticket the moment the same question comes up twice.",
              ),
            ),
          ),
      },
    ],
  },
  {
    key: "launch",
    updated: "2026-07-11T09:30:00.000Z",
    icon: "🧭",
    title: "Aurora 2.0 launch",
    body: () =>
      doc(
        paragraph(
          text(
            "The plan for the September release: what goes in, what waits, and the two things we say on the landing page.",
          ),
        ),
      ),
  },
  {
    key: "notes",
    updated: "2026-07-08T17:10:00.000Z",
    icon: "🗒️",
    title: "Meeting notes",
    body: () =>
      doc(
        paragraph(
          text(
            "One page per weekly sync. Decisions at the top, everything else below — nobody scrolls a meeting note twice.",
          ),
        ),
      ),
  },
  {
    key: "metrics",
    updated: "2026-07-04T11:25:00.000Z",
    icon: "📊",
    title: "Metrics that matter",
    body: () =>
      doc(
        paragraph(
          text(
            "Three numbers we actually look at: weekly active projects, time to first ticket, and the share of releases that ship on Thursday.",
          ),
        ),
      ),
  },
];

/* ── The script ────────────────────────────── ─────────────────────────────── */

/** Flattens the tree into lines ready to insert, parents before children. */
function buildRows({ projectId, authorId, issue, existingByTitle }) {
  const rows = [];
  const ids = new Set();

  const walk = (nodes, parentId) => {
    nodes.forEach((node, index) => {
      const id = existingByTitle.get(node.title)?.id ?? randomUUID();
      ids.add(id);
      const content = node.body(issue);
      rows.push({
        id,
        project_id: projectId,
        parent_id: parentId,
        title: node.title,
        icon: node.icon,
        content,
        position: POSITIONS[index] ?? POSITIONS[POSITIONS.length - 1],
        search_text: plainText(content),
        created_by: authorId,
        updated_by: authorId,
        created_at: CREATED_AT,
        updated_at: node.updated,
      });
      if (node.children) walk(node.children, id);
    });
  };

  walk(TREE, null);

  // The guard who replaces `parents` in the perimeter: no page created here
  // cannot have as parent anything other than a page created here.
  for (const row of rows) {
    if (row.parent_id !== null && !ids.has(row.parent_id)) {
      throw new Error(
        `captures: la page « ${row.title} » vise un parent hors du seed. REFUSÉ.`,
      );
    }
  }
  return rows;
}

function describeTree(nodes, depth = 0) {
  for (const node of nodes) {
    console.log(`${"  ".repeat(depth + 3)}${node.icon} ${node.title}`);
    if (node.children) describeTree(node.children, depth + 1);
  }
}

async function main() {
  if (DRY_RUN) {
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log("  • Créer 7 pages dans le projet Aurora, en arbre :");
    describeTree(TREE);
    console.log(
      "\n    La page « Release process » porte un paragraphe, un sous-titre,\n" +
        "    5 cases à cocher (2 cochées) et une pilule vers le ticket\n" +
        `    « ${MENTIONED_ISSUE} ».`,
    );
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  const aurora = requireProject(world, "AUR");

  const { data: issues, error: issueError } = await world.admin
    .from("issues")
    .select("id, number, title")
    .eq("project_id", aurora.id)
    .eq("title", MENTIONED_ISSUE)
    .is("deleted_at", null);
  if (issueError) {
    throw new Error(`captures: lecture des tickets — ${issueError.message}`);
  }
  if (!issues?.length) {
    throw new Error(
      `captures: le ticket « ${MENTIONED_ISSUE} » est introuvable sur Aurora. ` +
        `Lance d'abord 002-projet-aurora.mjs.`,
    );
  }
  const issue = {
    id: issues[0].id,
    identifier: `${aurora.key}-${issues[0].number}`,
  };

  // Idempotence: a page already there keeps its IDENTIFIER — the links placed
  // elsewhere (a mention towards her, a favorite) continue to fall just —,
  // but it is removed and then rewritten rather than modified. This is the trigger
  // `pages_set_updated_at` which imposes it: it overwrites `updated_at` with `now()` on
  // any modification, and the date displayed would start again in the future of
  // the frozen clock. The title serves as a key: they are unique in the tree.
  const { data: current, error: pageError } = await world.admin
    .from("pages")
    .select("id, title")
    .eq("project_id", aurora.id)
    .is("deleted_at", null);
  if (pageError) throw new Error(`captures: lecture des pages — ${pageError.message}`);
  const existingByTitle = new Map((current || []).map((p) => [p.title, p]));

  const rows = buildRows({
    projectId: aurora.id,
    authorId: people.camille,
    issue,
    existingByTitle,
  });

  const plan = createPlan(world);
  const known = rows.filter((r) => existingByTitle.has(r.title));

  // Children first: `parent_id` is in `on delete set null`, remove one
  // parent before its subpages would orphan those that we are about to
  // rewrite — and a failure along the way would leave the tree flat.
  for (const row of [...known].reverse()) {
    plan.remove("pages", { id: row.id }, `page « ${row.title} » à réécrire`);
  }
  plan.insert("pages", rows, "page du wiki d'Aurora");

  console.log(plan.describe());
  await plan.apply({ confirmed: true });
  console.log(
    `  → ${rows.length} page(s) écrite(s) (dont ${known.length} réécrite(s)) ` +
      `— la page citée pointe ${issue.identifier}`,
  );
}

await main();
