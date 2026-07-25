/**
 * 003 — le second projet « Beacon » (BCN).
 *
 * Pour quelle capture : `featureCycle`. Le cycle est une quinzaine PERSONNELLE
 * et CROSS-PROJET — sa capture doit montrer des tickets de plusieurs projets
 * dans une même liste. Avec un seul projet, l'écran ne dit rien de ce qu'il
 * est censé démontrer.
 *
 * La plupart des tickets sont assignés à Camille : le schéma impose qu'un
 * ticket entré dans un cycle soit assigné au propriétaire du cycle (trigger
 * `issues_enforce_cycle`), donc seuls ses tickets pourront y entrer.
 *
 * Les dates sont posées relativement au cycle courant, calculé à l'exécution :
 * voir 004-cycle.mjs, qui explique pourquoi elles ne peuvent pas être figées.
 *
 * Idempotent : projet réutilisé s'il existe, seuls les tickets absents créés.
 *
 *   node captures/world/seed/003-projet-beacon.mjs --dry-run
 *   node captures/world/seed/003-projet-beacon.mjs
 */
import { openDemoWorld, createPlan, callRpc } from "../../lib/guards.mjs";
import { resolvePeople } from "./_people.mjs";
import { currentCycleWindow, spreadInWindow } from "./_cycle-window.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const PROJECT = { name: "Beacon", key: "BCN" };

/**
 * Le board de Beacon. `at` et `doneAt` sont des positions RELATIVES dans la
 * partie écoulée de la quinzaine courante (0 = son début, 1 = aujourd'hui) :
 * les dates absolues sont calculées à l'exécution, pour que la donnée reste
 * étalée quel que soit le jour où le seed tourne.
 */
const ISSUES = [
  {
    title: "Redesign the status page",
    description:
      "The current page lists raw service names. Group them by what a customer actually notices: sign-in, sending, dashboards.",
    status: "done",
    priority: "high",
    effort: "m",
    assignee: "camille",
    at: 0.0,
    doneAt: 0.45,
  },
  {
    title: "Retry failed webhook deliveries",
    description:
      "A webhook that fails once is never retried. Back off exponentially for an hour, then park it in a dead-letter list the team can replay.",
    status: "done",
    priority: "urgent",
    effort: "l",
    assignee: "camille",
    at: 0.05,
    doneAt: 0.7,
  },
  {
    title: "Show the last delivery attempt on each endpoint",
    status: "done",
    priority: "medium",
    effort: "s",
    assignee: "camille",
    at: 0.15,
    doneAt: 0.55,
  },
  {
    title: "Rate-limit the public status API",
    status: "done",
    priority: "medium",
    effort: "m",
    assignee: "camille",
    at: 0.25,
    doneAt: 0.8,
  },
  {
    title: "Collapse duplicate incidents into one timeline",
    status: "done",
    priority: "low",
    effort: "s",
    assignee: "camille",
    at: 0.3,
    doneAt: 0.95,
  },
  {
    title: "Subscribe to incidents by email",
    description:
      "Let customers follow a single service instead of the whole status page. One confirmation email, one unsubscribe link, no account required.",
    status: "in_progress",
    priority: "high",
    effort: "l",
    assignee: "camille",
    at: 0.4,
  },
  {
    title: "Incident templates for common outages",
    status: "in_progress",
    priority: "medium",
    effort: "m",
    assignee: "camille",
    at: 0.6,
  },
  {
    title: "Backfill uptime history from the old provider",
    status: "todo",
    priority: "medium",
    effort: "l",
    assignee: "camille",
    at: 0.7,
  },
  {
    title: "Publish a JSON feed of current incidents",
    status: "todo",
    priority: "low",
    effort: "s",
    assignee: "camille",
    at: 0.85,
  },
  {
    title: "Custom domain for the status page",
    status: "backlog",
    priority: "medium",
    effort: "l",
    assignee: null,
    at: 0.2,
  },
  {
    title: "Postmortem editor with a shared template",
    status: "backlog",
    priority: "low",
    effort: "xl",
    assignee: "alice",
    at: 0.35,
  },
  {
    title: "Alert when a probe flaps more than twice an hour",
    status: "in_review",
    priority: "high",
    effort: "m",
    assignee: "tom",
    at: 0.5,
  },
];

function describeIntent(window) {
  const byStatus = {};
  for (const issue of ISSUES) (byStatus[issue.status] ||= []).push(issue);
  const lines = [
    `  • Créer 1 projet « ${PROJECT.name} » (clé ${PROJECT.key}), détenu par Camille Roy`,
    `  • Créer ${ISSUES.length} tickets, datés dans la quinzaine ${window.start} → ${window.end} :`,
  ];
  for (const [status, list] of Object.entries(byStatus)) {
    lines.push(`      ${status} (${list.length}) :`);
    for (const issue of list) {
      const who = issue.assignee ? ` → ${issue.assignee}` : " → non assigné";
      lines.push(`        - ${issue.title} [${issue.priority}/${issue.effort}]${who}`);
    }
  }
  return lines.join("\n");
}

async function main() {
  const window = currentCycleWindow();

  if (DRY_RUN) {
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log(describeIntent(window));
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  const owner = people.camille;

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

  const { data: existing, error } = await world.admin
    .from("issues")
    .select("title")
    .eq("project_id", project.id);
  if (error) throw new Error(`captures: lecture des tickets — ${error.message}`);
  const known = new Set((existing || []).map((i) => i.title));

  const rows = [];
  for (const [index, issue] of ISSUES.entries()) {
    if (known.has(issue.title)) continue;
    const number = await callRpc(world, "next_issue_number", { p_project_id: project.id });
    const createdAt = spreadInWindow(window, issue.at, 9 + (index % 8));
    rows.push({
      project_id: project.id,
      number,
      title: issue.title,
      description: issue.description ?? null,
      status: issue.status,
      priority: issue.priority,
      effort: issue.effort,
      assignee_id: issue.assignee ? people[issue.assignee] : null,
      position: (index + 1) * 1000,
      created_by: owner,
      created_at: createdAt,
      updated_at: issue.doneAt != null ? spreadInWindow(window, issue.doneAt, 16) : createdAt,
      completed_at: issue.doneAt != null ? spreadInWindow(window, issue.doneAt, 16) : null,
    });
  }

  if (rows.length === 0) {
    console.log("  → rien à ajouter, le board de Beacon est déjà complet");
    return;
  }

  const plan = createPlan(world);
  plan.insert("issues", rows, "ticket");
  console.log(plan.describe());
  await plan.apply({ confirmed: true });
  console.log(`  → ${rows.length} ticket(s) ajoutés à ${project.key}`);
}

await main();
