/**
 * 014 — les pages d'Aurora (le wiki du projet).
 *
 * Pour quelle capture : `pagesEditor` — « une page du wiki ouverte : à gauche
 * l'arbre des pages du projet avec une page dépliée sur ses sous-pages, à
 * droite le contenu — un titre, un paragraphe, une liste de cases à cocher
 * dont deux cochées, et une pilule de mention vers un ticket dans le texte ».
 *
 * Ce que ça pose : quatre pages racines dont une (« Product handbook ») porte
 * trois sous-pages. Celle qu'on photographie est « Release process », sous le
 * handbook : c'est elle qui porte la liste de tâches et la mention.
 *
 * ─── Le corps d'une page est du JSON ProseMirror ────────────────────────────
 *
 * Pas du markdown : la projection markdown est produite ailleurs
 * (lib/pages-markdown.ts) et demande un DOM. On écrit donc le document tel
 * qu'il est stocké, avec les noms de nœuds du registre de blocs
 * (components/pages/blocks) — `paragraph`, `heading`, `taskList`, `taskItem` —
 * et l'attribut `blockId` que pose `UniqueID` côté éditeur. Le poser ici évite
 * que l'ouverture de la page écrive aussitôt en base pour se le donner.
 *
 * ─── La mention est un NŒUD, pas du texte ───────────────────────────────────
 *
 * Contrairement à une description de ticket, l'éditeur de page n'hydrate pas
 * les « @… » écrits en texte : `hydrateMentions` n'est appelée que par
 * components/markdown-editor.tsx. Un « @AUR-2 » posé en texte brut resterait
 * donc du texte. La pilule se stocke en nœud `mention`, avec les attributs que
 * l'éditeur produirait lui-même (`attrsFromScanned`, markdown-mention.tsx) :
 * `mentionType: "issue"`, `mentionId` = l'id du ticket, `mentionLabel` = son
 * identifiant affiché.
 *
 *   node captures/world/seed/014-pages-aurora.mjs --dry-run
 *   node captures/world/seed/014-pages-aurora.mjs
 */
import { randomUUID } from "node:crypto";
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/** Le ticket cité par la page — celui qui porte déjà le plan d'implémentation. */
const MENTIONED_ISSUE = "Add keyboard shortcuts to the command palette";

/* ── Fabriques de nœuds ──────────────────────────────────────────────────── */

/** Un identifiant de bloc, comme `UniqueID` en pose un à la frappe. */
const blockId = () => ({ blockId: randomUUID() });

const text = (value) => ({ type: "text", text: value });

/** La pilule d'un ticket. `mentionId` est résolu à l'exécution. */
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
 * Une tâche. Les quatre états du plan sont portés par `state`
 * (components/scratchpad/task-nodes.ts) ; `checked` est l'attribut hérité de
 * TipTap, qu'on garde cohérent avec lui — c'est ce qui part dans le DOM.
 *
 * Les valeurs sont celles de `PLAN_TASK_STATES` (lib/plan.ts) : `pending`,
 * `in_progress`, `completed`, `cancelled`. Une valeur hors liste ne lève pas —
 * la vue retombe silencieusement sur « à faire », et la page s'affiche avec
 * cinq cases vides sans qu'une seule erreur soit dite.
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

/** Le texte nu d'un document — ce que `search_text` doit porter. */
function plainText(node) {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "mention") return `@${node.attrs?.mentionLabel ?? ""}`;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(plainText).join(" ");
}

/* ── L'arbre ─────────────────────────────────────────────────────────────── */

/**
 * Les positions sont des index FRACTIONNAIRES (lib/pages.ts) : des chiffres de
 * l'alphabet à 62 valeurs, comparés comme des chaînes, jamais terminés par
 * zéro. Quatre voisins bien espacés suffisent ici — le seed n'insère pas entre
 * deux pages existantes.
 */
const POSITIONS = ["V", "a", "g", "m"];

/**
 * Toutes les dates sont ANTÉRIEURES au 15 juillet 2026, l'instant figé des
 * captures (`CAPTURE.frozenNow`) : l'en-tête de la page affiche « Modifiée par
 * Camille Roy · il y a N jours », et une date postérieure à l'horloge du
 * navigateur ferait dire « maintenant » à une page écrite trois semaines plus
 * tôt.
 *
 * Conséquence sur l'idempotence : `updated_at` est repris par un trigger
 * `before update` (pages_set_updated_at), une modification ne peut donc PAS le
 * backdater. Une page déjà là est retirée puis réécrite, à identifiant
 * constant — c'est le seul chemin qui tienne la date.
 */
const CREATED_AT = "2026-06-30T09:12:00.000Z";

/**
 * L'arbre, dans l'ordre d'affichage. Les corps sont en ANGLAIS comme le reste
 * du monde de démo : les mêmes données servent les captures FR et EN.
 *
 * `body` reçoit les tickets résolus pour pouvoir citer l'un d'eux.
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
        /** LA page photographiée. */
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

/* ── Le script ───────────────────────────────────────────────────────────── */

/** Aplatit l'arbre en lignes prêtes à insérer, parents avant enfants. */
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

  // La garde qui remplace `parents` dans le périmètre : aucune page créée ici
  // ne peut avoir pour parent autre chose qu'une page créée ici.
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

  // Idempotence : une page déjà là garde son IDENTIFIANT — les liens posés
  // ailleurs (une mention vers elle, un favori) continuent de tomber juste —,
  // mais elle est retirée puis réécrite plutôt que modifiée. C'est le trigger
  // `pages_set_updated_at` qui l'impose : il écrase `updated_at` à `now()` sur
  // toute modification, et la date affichée repartirait dans le futur de
  // l'horloge figée. Le titre sert de clé : ils sont uniques dans l'arbre.
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

  // Les enfants d'abord : `parent_id` est en `on delete set null`, retirer un
  // parent avant ses sous-pages orphelinerait celles qu'on s'apprête à
  // réécrire — et un échec en cours de route laisserait l'arbre à plat.
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
