/**
 * 022 — the "Lumen" project (LUM): a large board with eight months of history.
 *
 * For which captures: the project statistics of the General settings
 * (MIN-878) — momentum, weekly flow, status breakdown, overdue and stalled
 * issues, contributors, pull requests and the issue graph — in the manual and
 * the pull request. It is also the load test of the graph: about a thousand
 * issues and as many relations as Smart Fill tends to add.
 *
 * Everything is generated from a fixed seed, so two runs describe the same
 * world. Dates are relative to the day of the run: the history always ends
 * "now", and the momentum, overdue and stalled figures stay meaningful.
 *
 * Steps, each its own guarded plan (a child row needs its parent applied):
 * project, members and categories; parent issues; the other issues; then
 * categories links, relations and pull requests.
 *
 * Idempotent: issues are matched by title, relations by pair, pull requests
 * by number; only what is missing is created.
 *
 *   node captures/world/seed/022-projet-lumen.mjs            (describe only)
 *   node captures/world/seed/022-projet-lumen.mjs --apply    (after approval)
 */
import { randomUUID } from "node:crypto";
import { openDemoWorld, createPlan, callRpc } from "../../lib/guards.mjs";
import { DEMO_REPOSITORY, openContentCodec } from "../../lib/encrypted-content.mjs";
import { resolvePeople } from "./_people.mjs";
import { ensureCategories, resolveCategories } from "./_categories.mjs";
import { assertIssueSeedWritable } from "./_issues.mjs";

const APPLY = process.argv.includes("--apply");
const PROJECT = { name: "Lumen", key: "LUM" };
const MEMBERS = ["alice", "tom"];
const ISSUE_COUNT = 1000;
const HISTORY_DAYS = 240;
const DAY = 86_400_000;
const NOW = Date.now();

// ── Deterministic randomness ───────────────────────────────────────────────
let state = 878;
const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const pick = (list) => list[Math.floor(random() * list.length)];
const weighted = (entries) => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) if ((roll -= weight) < 0) return value;
  return entries.at(-1)[0];
};
const iso = (ms) => new Date(ms).toISOString();
const dateOnly = (ms) => iso(ms).slice(0, 10);
/**
 * A due date the way the app stores a picked day: local midnight (the demo
 * team works from Paris). Midnight UTC would read as "1:00 AM" there, and
 * would make the issue late an hour into the day.
 */
const PARIS_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" });
const dueAt = (day) => {
  for (const offset of ["+01:00", "+02:00"]) {
    const instant = new Date(`${day}T00:00:00${offset}`);
    if (PARIS_HOUR.format(instant) === "00") return instant.toISOString();
  }
  throw new Error(`captures: no Paris midnight on ${day}`);
};

// ── What Lumen is about: a team workspace app ─────────────────────────────
const TOPICS = [
  { name: "Sync", epics: ["Sync engine v2", "Conflict resolution"], subjects: ["sync conflicts", "the sync queue", "background sync", "delta uploads", "sync status badge", "retry backoff"] },
  { name: "Offline", epics: ["Offline mode", "Offline drafts"], subjects: ["offline drafts", "the offline banner", "cached attachments", "local storage quota", "reconnect flow", "offline search"] },
  { name: "Search", epics: ["Search v2", "Saved searches"], subjects: ["search results", "search filters", "the search index", "recent searches", "search suggestions", "fuzzy matching"] },
  { name: "Notifications", epics: ["Notification center", "Email digests"], subjects: ["push notifications", "the weekly digest", "notification preferences", "mention alerts", "the unread counter", "quiet hours"] },
  { name: "Billing", epics: ["Annual plans", "Invoices revamp"], subjects: ["invoice PDFs", "the checkout page", "seat-based pricing", "payment retries", "the billing portal", "tax IDs"] },
  { name: "Onboarding", epics: ["Onboarding revamp", "Team invites"], subjects: ["the welcome checklist", "team invites", "the sample workspace", "the first-run tour", "invite links", "workspace templates"] },
  { name: "Editor", epics: ["Editor tables", "Slash commands"], subjects: ["the rich text editor", "tables in documents", "slash commands", "code blocks", "image resizing", "undo history"] },
  { name: "Mobile", epics: ["Mobile widgets", "Tablet layout"], subjects: ["the iOS widget", "the Android share sheet", "tablet layout", "pull to refresh", "haptic feedback", "the mobile tab bar"] },
  { name: "Integrations", epics: ["Slack integration", "Calendar sync"], subjects: ["the Slack integration", "calendar sync", "webhooks", "the Zapier app", "the public API", "OAuth scopes"] },
  { name: "Performance", epics: ["Cold start budget", "Large workspaces"], subjects: ["cold start time", "large workspaces", "list virtualization", "image loading", "bundle size", "memory usage"] },
  { name: "Accessibility", epics: ["Screen reader pass", "Keyboard navigation"], subjects: ["screen reader labels", "keyboard navigation", "focus order", "color contrast", "reduced motion", "text scaling"] },
  { name: "Reports", epics: ["Reports dashboard", "CSV exports"], subjects: ["the reports dashboard", "CSV exports", "weekly reports", "chart tooltips", "date range picker", "scheduled reports"] },
  { name: "Permissions", epics: ["Guest access", "Custom roles"], subjects: ["guest access", "custom roles", "the sharing dialog", "audit log", "link permissions", "admin settings"] },
  { name: "Import", epics: ["Trello importer", "Bulk import"], subjects: ["the Trello importer", "bulk import", "CSV mapping", "import progress", "duplicate detection", "the Notion importer"] },
  { name: "Auth", epics: ["Single sign-on", "Passkeys"], subjects: ["single sign-on", "passkeys", "session expiry", "the login page", "two-factor setup", "password reset"] },
];
const TEMPLATES = [
  ["bug", "Fix {s} on slow networks"],
  ["bug", "Fix {s} after an app update"],
  ["bug", "Fix {s} in dark mode"],
  ["bug", "Fix {s} for workspaces with 500+ members"],
  ["bug", "Fix {s} when the session expires"],
  ["bug", "Fix {s} on Android 15"],
  ["bug", "Fix {s} in Safari"],
  ["bug", "Fix {s} after a timezone change"],
  ["feature", "Add filters to {s}"],
  ["feature", "Add keyboard shortcuts to {s}"],
  ["feature", "Let admins configure {s}"],
  ["feature", "Show {s} in the activity feed"],
  ["improvement", "Speed up {s}"],
  ["improvement", "Simplify {s}"],
  ["improvement", "Polish the empty state of {s}"],
  ["improvement", "Clarify the copy of {s}"],
  ["design", "Redesign {s}"],
  ["design", "Align {s} with the new design system"],
  ["documentation", "Document {s} in the help center"],
  ["technical", "Add tests for {s}"],
  ["technical", "Log errors from {s}"],
  ["technical", "Refactor {s}"],
  ["technical", "Remove the legacy code behind {s}"],
];
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// ── Generation ─────────────────────────────────────────────────────────────

/** Days ago, denser toward today: the team grew over the eight months. */
const createdDaysAgo = () => Math.floor(HISTORY_DAYS * (1 - Math.sqrt(random())) ** 1.15);

function generate() {
  const issues = [];
  const titles = new Set();
  const add = (issue) => {
    titles.add(issue.title);
    issues.push(issue);
    return issue;
  };

  // Parent issues: the epics of each area.
  for (const [topicIndex, topic] of TOPICS.entries()) {
    for (const epic of topic.epics) {
      for (const suffix of ["", " — follow-ups"]) {
        if (issues.length >= 60) break;
        add({ key: `epic:${epic}${suffix}`, title: `${epic}${suffix}`, topic: topicIndex, category: "feature", parent: true, ageDays: createdDaysAgo() + 20 });
      }
    }
  }
  // The rest of the board.
  let guard = 0;
  while (issues.length < ISSUE_COUNT && guard++ < 50_000) {
    const topicIndex = Math.floor(random() * TOPICS.length);
    const [category, template] = pick(TEMPLATES);
    const title = capitalize(template.replace("{s}", pick(TOPICS[topicIndex].subjects)));
    if (titles.has(title)) continue;
    add({ key: title, title, topic: topicIndex, category, parent: false, ageDays: createdDaysAgo() });
  }

  // Lifecycle: older work is mostly done; recent work is in flight.
  for (const issue of issues) {
    issue.createdMs = NOW - issue.ageDays * DAY - Math.floor(random() * 9) * 3_600_000;
    issue.effort = weighted([["xs", 2], ["s", 4], ["m", 4], ["l", 2], ["xl", 1]]);
    issue.priority = weighted([["none", 2], ["low", 3], ["medium", 4], ["high", 2], ["urgent", 1]]);
    // Faster lately: the lead time shrinks over the history, so momentum shows.
    const leadDays = Math.max(0.2, (2 + random() * 12) * ({ xs: 0.4, s: 0.7, m: 1, l: 1.6, xl: 2.4 })[issue.effort] * (0.6 + issue.ageDays / HISTORY_DAYS));
    const doneMs = issue.createdMs + leadDays * DAY;
    const finished = doneMs < NOW - 3_600_000 && random() < 0.8;
    if (issue.parent) {
      issue.status = issue.ageDays > 90 ? "done" : "in_progress";
    } else if (finished) {
      issue.status = random() < 0.06 ? "canceled" : "done";
    } else {
      issue.status = weighted([["backlog", 5], ["todo", 4], ["in_progress", 2], ["in_review", 1]]);
    }
    issue.completedMs = issue.status === "done" || issue.status === "canceled"
      ? Math.min(issue.parent ? issue.createdMs + 80 * DAY : doneMs, NOW - 3_600_000)
      : null;
    issue.assignee = issue.status === "done" || issue.status === "in_progress" || issue.status === "in_review"
      ? weighted([["camille", 4], ["alice", 3], ["tom", 2]])
      : weighted([["camille", 3], ["alice", 3], ["tom", 2], [null, 3]]);
    issue.updatedMs = issue.completedMs ?? issue.createdMs + Math.min(issue.ageDays, 3) * DAY;
  }
  // Open epics move with their sub-issues.
  for (const issue of issues) {
    if (issue.parent && !issue.completedMs) issue.updatedMs = NOW - Math.floor(random() * 4) * DAY - 3_600_000;
  }
  const open = issues.filter((issue) => !issue.completedMs && !issue.parent);
  // In flight means touched lately, except a handful left stalled.
  const inFlight = open.filter((issue) => issue.status === "in_progress" || issue.status === "in_review");
  inFlight.forEach((issue, index) => {
    issue.updatedMs = index < 9
      ? NOW - (16 + index * 3) * DAY
      : Math.max(issue.createdMs, NOW - Math.floor(random() * 6) * DAY - 3_600_000);
  });
  // Due dates: a few overdue, more upcoming.
  open.forEach((issue, index) => {
    if (index % 17 === 0) issue.dueDate = dueAt(dateOnly(NOW - (2 + (index % 13)) * DAY));
    else if (index % 4 === 0) issue.dueDate = dueAt(dateOnly(NOW + (2 + (index % 28)) * DAY));
  });

  // Sub-issues: each epic takes 2–8 issues of its area, created after it.
  const parents = issues.filter((issue) => issue.parent);
  const taken = new Set();
  for (const parent of parents) {
    const pool = issues.filter((issue) =>
      !issue.parent && !taken.has(issue.key) && issue.topic === parent.topic && issue.createdMs > parent.createdMs);
    const count = 2 + Math.floor(random() * 7);
    for (let i = 0; i < count && pool.length; i += 1) {
      const child = pool.splice(Math.floor(random() * pool.length), 1)[0];
      child.parentKey = parent.key;
      taken.add(child.key);
    }
  }

  // Relations, the way Smart Fill adds them: mostly within an area, a few
  // across; "blocks" always from the older issue to the newer one.
  const relations = [];
  const pairs = new Set();
  for (const issue of issues) {
    const count = random() < 0.3 ? 0 : 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i += 1) {
      const sameArea = random() < 0.85;
      const pool = sameArea ? issues.filter((other) => other.topic === issue.topic) : issues;
      const other = pick(pool);
      if (other === issue || other.parentKey === issue.key || issue.parentKey === other.key) continue;
      const pair = [issue.key, other.key].sort().join("\0");
      if (pairs.has(pair)) continue;
      pairs.add(pair);
      const blocks = random() < 0.15;
      const [source, target] = blocks && other.createdMs < issue.createdMs ? [other, issue] : [issue, other];
      relations.push({ sourceKey: source.key, targetKey: target.key, type: blocks ? "blocks" : "related" });
    }
  }

  // Pull requests: most delivered code went through one.
  const pullRequests = [];
  const codeWork = (issue) => ["bug", "feature", "improvement", "technical"].includes(issue.category) && !issue.parent;
  for (const issue of issues.filter(codeWork)) {
    if (issue.status === "done" && issue.ageDays < 150 && random() < 0.26) {
      const openedMs = Math.max(issue.createdMs, issue.completedMs - (0.2 + random() * 3) * DAY);
      pullRequests.push({ issueKey: issue.key, title: issue.title, state: "merged", openedMs, mergedMs: issue.completedMs });
    } else if (issue.status === "in_review" || (issue.status === "in_progress" && random() < 0.3)) {
      pullRequests.push({ issueKey: issue.key, title: issue.title, state: issue.status === "in_review" ? "open" : "draft", openedMs: Math.max(issue.createdMs, issue.updatedMs - DAY), mergedMs: null });
    } else if (issue.status === "canceled" && random() < 0.5) {
      pullRequests.push({ issueKey: issue.key, title: issue.title, state: "closed", openedMs: issue.createdMs + DAY, mergedMs: null });
    }
  }
  pullRequests.sort((a, b) => a.openedMs - b.openedMs).forEach((pr, index) => { pr.number = 101 + index; });

  return { issues, relations, pullRequests };
}

// ── Summary in French, for the user ───────────────────────────────────────
function describe({ issues, relations, pullRequests }) {
  const count = (filter) => issues.filter(filter).length;
  const byStatus = {};
  for (const issue of issues) byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;
  const recent = (days) => count((issue) => issue.status === "done" && issue.completedMs > NOW - days * DAY);
  const stalled = count((issue) => (issue.status === "in_progress" || issue.status === "in_review") && issue.updatedMs < NOW - 14 * DAY);
  const overdue = count((issue) => issue.dueDate && Date.parse(issue.dueDate) < NOW - DAY && !issue.completedMs);
  return [
    `  • Projet « ${PROJECT.name} » (clé ${PROJECT.key}), détenu par Camille Roy, avec Alice et Tom`,
    `  • ${issues.length} tickets créés sur ${HISTORY_DAYS} jours, dont ${count((i) => i.parent)} parents et ${count((i) => i.parentKey)} sous-tickets`,
    `      par statut : ${Object.entries(byStatus).map(([s, n]) => `${s} ${n}`).join(", ")}`,
    `      terminés ces 4 dernières semaines : ${recent(28)} (les 4 d'avant : ${recent(56) - recent(28)})`,
    `      en retard : ${overdue} · au point mort : ${stalled}`,
    `  • ${relations.length} relations (${relations.filter((r) => r.type === "blocks").length} « bloque »)`,
    `  • ${pullRequests.length} pull requests sur le dépôt fictif ${DEMO_REPOSITORY} : ` +
      `${pullRequests.filter((p) => p.state === "merged").length} fusionnées, ` +
      `${pullRequests.filter((p) => p.state === "open" || p.state === "draft").length} ouvertes, ` +
      `${pullRequests.filter((p) => p.state === "closed").length} fermées`,
  ].join("\n");
}

// ── Writing ────────────────────────────────────────────────────────────────
async function main() {
  const world = generate();
  console.log("Monde Lumen à créer :\n");
  console.log(describe(world));
  if (!APPLY) {
    console.log("\nRien n'est écrit. Relancer avec --apply après accord.");
    return;
  }

  const demo = await openDemoWorld();
  const people = resolvePeople(demo);
  const owner = people.camille;

  let project = demo.demoProjects.find((p) => p.key === PROJECT.key && !p.deleted_at);
  if (!project) {
    const plan = createPlan(demo);
    plan.insert("projects", [{ owner_id: owner, name: PROJECT.name, key: PROJECT.key, created_at: iso(NOW - (HISTORY_DAYS + 30) * DAY) }], "projet");
    project = (await plan.apply({ confirmed: true })).projects[0];
    console.log(`  → projet ${project.key} créé`);
  }
  await assertIssueSeedWritable(demo, project.id);
  await ensureCategories(demo, project.id);

  const { data: members } = await demo.admin.from("project_members").select("user_id").eq("project_id", project.id);
  const present = new Set((members ?? []).map((m) => m.user_id));
  const missingMembers = MEMBERS.filter((key) => !present.has(people[key]))
    .map((key) => ({ project_id: project.id, user_id: people[key], role: "member", added_by: owner }));
  if (missingMembers.length) {
    const plan = createPlan(demo);
    plan.insert("project_members", missingMembers, "collègue");
    await plan.apply({ confirmed: true });
  }

  // Issues: parents first, so the children can point at them.
  const readIssues = async () => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await demo.admin.from("issues").select("id, title, number")
        .eq("project_id", project.id).order("number").range(from, from + 999);
      if (error) throw new Error(`captures: lecture des tickets — ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) return new Map(rows.map((row) => [row.title, row]));
    }
  };
  let existing = await readIssues();
  const keyToTitle = new Map(world.issues.map((issue) => [issue.key, issue.title]));
  for (const batch of [world.issues.filter((i) => i.parent), world.issues.filter((i) => !i.parent)]) {
    const ordered = batch.filter((issue) => !existing.has(issue.title)).sort((a, b) => a.createdMs - b.createdMs);
    if (ordered.length === 0) continue;
    const rows = [];
    for (const issue of ordered) {
      const number = await callRpc(demo, "next_issue_number", { p_project_id: project.id });
      rows.push({
        project_id: project.id,
        number,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        effort: issue.effort,
        assignee_id: issue.assignee ? people[issue.assignee] : null,
        parent_id: issue.parentKey ? existing.get(keyToTitle.get(issue.parentKey))?.id ?? null : null,
        due_date: issue.dueDate ?? null,
        position: number * 1000,
        created_by: issue.assignee ? people[issue.assignee] : owner,
        created_at: iso(issue.createdMs),
        updated_at: iso(issue.updatedMs),
        completed_at: issue.completedMs ? iso(issue.completedMs) : null,
      });
    }
    for (let start = 0; start < rows.length; start += 250) {
      const plan = createPlan(demo);
      plan.insert("issues", rows.slice(start, start + 250), "ticket");
      await plan.apply({ confirmed: true });
    }
    console.log(`  → ${rows.length} tickets créés`);
    existing = await readIssues();
  }
  const idOf = (key) => existing.get(keyToTitle.get(key))?.id;

  // Categories, relations and pull requests point at applied issues.
  const categories = await resolveCategories(demo, project.id);
  const issueIds = [...existing.values()].map((row) => row.id);
  const readAll = async (table, columns, column) => {
    const rows = [];
    for (let start = 0; start < issueIds.length; start += 100) {
      const { data, error } = await demo.admin.from(table).select(columns).in(column, issueIds.slice(start, start + 100));
      if (error) throw new Error(`captures: lecture de ${table} — ${error.message}`);
      rows.push(...(data ?? []));
    }
    return rows;
  };
  const linked = new Set((await readAll("issue_categories", "issue_id", "issue_id")).map((row) => row.issue_id));
  const categoryRows = world.issues
    .filter((issue) => !linked.has(idOf(issue.key)) && categories.get(issue.category))
    .map((issue) => ({ issue_id: idOf(issue.key), category_id: categories.get(issue.category).id }));
  const knownPairs = new Set((await readAll("issue_relations", "source_id, target_id", "source_id"))
    .map((row) => [row.source_id, row.target_id].sort().join("\0")));
  const relationRows = world.relations
    .map((relation) => ({ source_id: idOf(relation.sourceKey), target_id: idOf(relation.targetKey), type: relation.type }))
    .filter((row) => row.source_id && row.target_id && !knownPairs.has([row.source_id, row.target_id].sort().join("\0")))
    .map((row) => ({ ...row, project_id: project.id, source_type: "issue", target_type: "issue", created_by: owner }));
  const knownNumbers = new Set((await readAll("pull_requests", "number", "issue_id")).map((row) => row.number));
  const codec = await openContentCodec(demo);
  const pullRequestRows = [];
  for (const pr of world.pullRequests.filter((p) => !knownNumbers.has(p.number))) {
    pullRequestRows.push(await codec.encodePullRequest({
      id: randomUUID(),
      provider: "github",
      repo_full_name: DEMO_REPOSITORY,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      issue_id: idOf(pr.issueKey),
      opened_at: iso(pr.openedMs),
      merged_at: pr.mergedMs ? iso(pr.mergedMs) : null,
      created_at: iso(pr.openedMs),
      updated_at: iso(pr.mergedMs ?? pr.openedMs),
      synced_at: iso(pr.mergedMs ?? pr.openedMs),
    }));
  }

  for (const [table, rows, label] of [
    ["issue_categories", categoryRows, "lien de catégorie"],
    ["issue_relations", relationRows, "relation"],
    ["pull_requests", pullRequestRows, "pull request"],
  ]) {
    for (let start = 0; start < rows.length; start += 250) {
      const plan = createPlan(demo);
      plan.insert(table, rows.slice(start, start + 250), label);
      await plan.apply({ confirmed: true });
    }
    if (rows.length) console.log(`  → ${rows.length} × ${label}`);
  }
  console.log("Lumen est prêt.");
}

await main();
