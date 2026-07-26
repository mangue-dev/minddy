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
import { categoryLabel, ensureCategories } from "./_categories.mjs";
import { describeMetadata, syncIssueMetadata } from "./_issues.mjs";
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
    categories: ["design"],
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
    categories: ["bug"],
    status: "done",
    priority: "urgent",
    effort: "l",
    assignee: "camille",
    at: 0.05,
    doneAt: 0.7,
  },
  {
    title: "Show the last delivery attempt on each endpoint",
    description:
      "When a webhook stops working, the first question is always when it last ran. Put the answer on the endpoint row.",
    categories: ["improvement"],
    status: "done",
    priority: "medium",
    effort: "s",
    assignee: "camille",
    at: 0.15,
    doneAt: 0.55,
  },
  {
    title: "Rate-limit the public status API",
    description:
      "One integration polls the endpoint every second. Cap it per address, with a header that tells callers to slow down.",
    categories: ["technical"],
    status: "done",
    priority: "medium",
    effort: "m",
    assignee: "camille",
    at: 0.25,
    doneAt: 0.8,
  },
  {
    title: "Collapse duplicate incidents into one timeline",
    description:
      "The same outage gets opened three times by three probes. Group them under one incident, keep every timestamp.",
    categories: ["improvement"],
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
    categories: ["feature"],
    status: "in_progress",
    priority: "high",
    effort: "l",
    assignee: "camille",
    at: 0.4,
  },
  {
    title: "Incident templates for common outages",
    description:
      "Writing the first update while everything burns is the worst moment to look for words. Pre-fill the ones we send every time.",
    categories: ["feature"],
    status: "in_progress",
    priority: "medium",
    effort: "m",
    assignee: "camille",
    at: 0.6,
  },
  {
    title: "Backfill uptime history from the old provider",
    description:
      "Two years of measurements sit in the tool we are leaving. Import them so the graphs do not start at zero.",
    categories: ["technical"],
    status: "todo",
    priority: "medium",
    effort: "l",
    assignee: "camille",
    at: 0.7,
  },
  {
    title: "Publish a JSON feed of current incidents",
    description:
      "Customers want to surface our status inside their own dashboards. Expose exactly what the page shows, nothing more.",
    categories: ["feature"],
    status: "todo",
    priority: "low",
    effort: "s",
    assignee: "camille",
    at: 0.85,
  },
  {
    title: "Custom domain for the status page",
    description:
      "Serve the page on status.customer.com instead of our subdomain, with the certificate issued automatically.",
    categories: ["feature"],
    status: "backlog",
    priority: "medium",
    effort: "l",
    assignee: null,
    at: 0.2,
  },
  {
    title: "Postmortem editor with a shared template",
    description:
      "Every postmortem is written from scratch, in a different document. One template, attached to the incident it explains.",
    categories: ["documentation"],
    status: "backlog",
    priority: "low",
    effort: "xl",
    assignee: "alice",
    at: 0.35,
  },
  {
    title: "Alert when a probe flaps more than twice an hour",
    description:
      "A service that goes up and down repeatedly still looks healthy on average. Catch the pattern and page someone.",
    categories: ["improvement"],
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
      const cats = (issue.categories ?? []).map(categoryLabel).join(", ");
      lines.push(
        `        - ${issue.title} [${issue.priority}/${issue.effort}]${who}` +
          `${cats ? ` · ${cats}` : ""}`,
      );
    }
  }
  lines.push(describeMetadata(ISSUES));
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

  // Voir 002 : les catégories viennent de l'app, pas d'un trigger.
  await ensureCategories(world, project.id);

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
  } else {
    const plan = createPlan(world);
    plan.insert("issues", rows, "ticket");
    console.log(plan.describe());
    await plan.apply({ confirmed: true });
    console.log(`  → ${rows.length} ticket(s) ajoutés à ${project.key}`);
  }

  // Descriptions et catégories — seconde passe, voir `_issues.mjs`.
  await syncIssueMetadata(world, project, ISSUES);
}

await main();
