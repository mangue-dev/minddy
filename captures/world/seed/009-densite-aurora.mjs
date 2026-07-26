/**
 * 009 — équilibrer les colonnes d'Aurora.
 *
 * Pour quelle capture : `heroBoard`. Le premier run l'a montré — Backlog (2) et
 * À faire (3) face à En cours (4 cartes à description) laissaient environ 40 %
 * de la première image du site en blanc. On ajoute 3 tickets au Backlog et 2 à
 * faire, dont trois avec description pour donner de la hauteur aux cartes.
 *
 * C'est la boucle prévue par les deux skills : `capture-shot` révèle que la
 * donnée rend mal, `capture-world` l'ajuste. Rien n'est reconstruit.
 *
 * Idempotent : seuls les titres absents sont créés.
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
 * Dates fixes, antérieures au 15 juillet 2026 (l'instant figé des captures),
 * comme le reste du board d'Aurora — contrairement à Beacon, dont les dates
 * suivent la quinzaine courante.
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
  // On se range APRÈS les tickets existants : la colonne est ordonnée par
  // `position`, et les nouveaux venus n'ont pas à s'intercaler.
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

  // Descriptions et catégories — seconde passe, voir `_issues.mjs`.
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
