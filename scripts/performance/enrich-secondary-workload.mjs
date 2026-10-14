import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SECONDARY_MARKER = "min683-secondary-v1";
export const SCALED_SECONDARY_MARKER = "min683-secondary-scaled-v2";
export const SECONDARY_EMAIL = "captures-demo+min540@minddy.app";
const ACCOUNT_MARKER = "min-540-performance-v1";
export const legacySecondaryManifestPath = path.resolve("output/playwright/performance/min683-secondary-workload.json");
export const secondaryManifestPath = path.resolve("output/playwright/performance/min683-secondary-scaled-workload.json");
export const SECONDARY_COUNTS = Object.freeze({ triage: 120, tasks: 450, feedback: 120, objectives: 30, comments: 1440 });
export const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");
const uuidFor = (namespace, key) => {
  const hex = createHash("sha256").update(`${namespace}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
export const secondaryId = (key) => uuidFor(SECONDARY_MARKER, key);
export const secondaryFixtureProjectIds = Object.freeze(Array.from({ length: 6 }, (_, index) => uuidFor(ACCOUNT_MARKER, `project-${index}`)));
export const secondaryOriginalIssueIds = Object.freeze(Array.from({ length: 6 }, (_, project) =>
  Array.from({ length: 100 }, (_, issue) => uuidFor(ACCOUNT_MARKER, `issue-${project}-${issue}`))).flat());
const projectId = secondaryFixtureProjectIds[0];
const marker = (key) => `<!-- ${SECONDARY_MARKER}:${key} -->`;
const label = (kind, index) => `[MIN-683 ${kind}${String(index + 1).padStart(2, "0")}]`;
const topics = ["Restore keyboard navigation", "Keep Page drafts through validation", "Reconcile remote updates on focus",
  "Prepare a second project's documents", "Preserve saved collection filters", "Render complete PR activity",
  "Explain triage category choices", "Keep board counts consistent", "Restore selected document identity",
  "Show optimistic changes immediately", "Retain edit history across navigation", "Bound background preparation"];
const description = (key, topic) => `${marker(key)}\n\n## Scenario\n\n${topic} in a workspace with restored tabs, rich documents and active issue lists. The user should see useful content and keep keyboard focus while the account reconciles its authorized data.\n\n## Expected behavior\n\nPreserve unsaved edits, project permissions and accepted versions. Check the complete visible interaction, including usable controls, rather than only the route shell. Record any visible loading and distinguish background synchronization from availability.`;
const comment = (key, topic, index) => `${marker(`${key}:comment-${index}`)}\n\n${index === 0
  ? `Preparation note: reproduce ${topic.toLowerCase()} with a refreshed renderer and no earlier activation of this destination. Check the visible content, selection and keyboard controls.`
  : `Review note: retain the same fixture and verify ${topic.toLowerCase()} after leaving focus and returning. Keep draft merging and authorization intact; this synthetic discussion records expected behavior, not a measured result.`}`;

/** Pure definitions; all records are additions to the one verified synthetic project. */
export function secondaryDefinitions(userId, categoryIds, { cohort = "scaled" } = {}) {
  assert.ok(["legacy", "scaled"].includes(cohort));
  const scaled = cohort === "scaled";
  assert.ok(categoryIds.length >= 3, "Three existing scoped categories are required");
  const issue = (key, title, status, index, objectiveKey = null, topic = topics[index % topics.length]) => ({ key, kind: "issue", objectiveKey,
    payload: { id: secondaryId(key), title, status, description: description(key, topic),
      plan: `## Verification plan\n\n- [x] Define the synthetic scenario\n- [ ] Prepare all restored dependencies\n- [ ] Check content and immediate keyboard input\n- [ ] Verify remote reconciliation without losing the draft`,
      priority: ["low", "medium", "high", "urgent"][index % 4], effort: ["xs", "s", "m", "l"][index % 4],
      assignee_id: userId, objective_id: null, category_ids: [categoryIds[index % 3]], smart_fill: false },
    comments: [0, 1].map((n) => ({ body: comment(key, topic, n), id: secondaryId(`${key}:comment-${n}`) })) });
  const triage = Array.from({ length: scaled ? 120 : 12 }, (_, index) => {
    const topic = topics[index % topics.length];
    return issue(`triage-${index}`, `${label("T", index)} ${topic}`, "triage", index);
  });
  const taskStatuses = [["backlog", "todo"], ["in_progress", "done"], ["in_review", "todo"],
    ["in_progress", "in_review"], ["todo", "in_progress"], ["backlog", "todo"]];
  const objectives = Array.from({ length: scaled ? 30 : 6 }, (_, index) => {
    const topic = topics[index % topics.length];
    return { key: `objective-${index}`, kind: "objective",
    payload: { name: `${label("O", index)} ${topic}`, description: description(`objective-${index}`, topic),
      status: index % 6 === 0 || index % 6 === 5 ? "planned" : "in_progress", lead_user_id: userId,
      color: ["#3b82f6", "#8b5cf6", "#10b981"][index % 3], target_date: "2026-10-30" },
    comments: [0, 1].map((n) => ({ body: comment(`objective-${index}`, topic, n) })) };
  });
  const tasks = objectives.flatMap((objective, index) => Array.from({ length: scaled ? 15 : 2 }, (_, task) => {
    if (index < 6 && task < 2) return issue(`task-${index}-${task}`, `${label("K", index * 2 + task)} ${task ? "Verify" : "Implement"} ${topics[index].toLowerCase()}`,
      taskStatuses[index][task], index * 2 + task, objective.key);
    const ordinal = index < 6 ? 12 + index * 13 + task - 2 : 90 + (index - 6) * 15 + task;
    const topic = `${topics[index % topics.length]}: work item ${task + 1}`;
    const status = objective.payload.status === "planned" ? (task % 2 ? "todo" : "backlog") : ["todo", "in_progress", "in_review", "done"][task % 4];
    return issue(`task-${index}-${task}`, `${label("K", ordinal)} ${topic}`, status, ordinal, objective.key, topic);
  }));
  const feedbackStatuses = ["open", "open", "open", "planned", "planned", "planned", "in_progress", "in_progress", "shipped", "declined"];
  const feedback = Array.from({ length: scaled ? 120 : 10 }, (_, index) => {
    const topic = topics[index % topics.length];
    return { key: `feedback-${index}`, kind: "feedback", status: feedbackStatuses[index % feedbackStatuses.length],
    payload: { title: `${label("F", index)} ${topic}`, body: description(`feedback-${index}`, topic),
      is_public: false, user: { email: SECONDARY_EMAIL } },
    comments: [0, 1].map((n) => ({ body: comment(`feedback-${index}`, topic, n), visibility: "internal" })) };
  });
  return { triage, tasks, objectives, feedback };
}

export function assertSecondaryIdentity(fixture, user) {
  assert.equal(fixture.email, SECONDARY_EMAIL);
  assert.equal(fixture.marker, ACCOUNT_MARKER);
  assert.equal(fixture.projects[0], projectId);
  assert.deepEqual(fixture.projects, secondaryFixtureProjectIds);
  assert.equal(user.id, fixture.userId, "Wrong authenticated fixture ID");
  assert.equal(user.email, SECONDARY_EMAIL, "Wrong authenticated fixture email");
  assert.equal(user.user_metadata?.performance_fixture, ACCOUNT_MARKER, "Wrong authenticated fixture marker");
}

export function assertSecondaryProject(project, fixture) {
  assert.equal(project.id, projectId);
  assert.equal(project.owner_id, fixture.userId, "The fixture must own the synthetic project");
  assert.equal(project.name, "Performance 1"); assert.equal(project.key, "PF1");
  assert.equal(project.smart_assign_enabled, false); assert.equal(project.auto_assign_enabled, false);
  assert.notEqual(project.automations_enabled, true, "Synthetic project automations must stay disabled");
}

const entityFields = (row, kind) => kind === "objective"
  ? { id: row.id, project_id: row.project_id, name: row.name, description: row.description, status: row.status, lead_user_id: row.lead_user_id, target_date: row.target_date, color: row.color }
  : kind === "feedback"
    ? { id: row.id, project_id: row.project_id, title: row.title, body: row.body, status: row.status, source: row.source, is_public: row.is_public,
      created_by_member: row.created_by_member, category_ids: [...(row.category_ids ?? [])].sort() }
    : { id: row.id, project_id: row.project_id, title: row.title, description: row.description, plan: row.plan, status: row.status,
      priority: row.priority, effort: row.effort, assignee_id: row.assignee_id, objective_id: row.objective_id,
      created_by: row.created_by, category_ids: [...(row.category_ids ?? [])].sort() };
const endpoint = (kind) => `/api/projects/${projectId}/${kind === "issue" ? "issues" : kind === "objective" ? "objectives" : "feedback"}`;
const unpack = (kind, value) => kind === "feedback" ? value.post : value;
const listRows = (kind, value) => kind === "feedback" ? value.posts : value;
const commentRoute = (kind, id) => kind === "feedback" ? `${endpoint(kind)}/${id}/comments`
  : `/api/${kind === "objective" ? "objectives" : "issues"}/${id}/comments`;

/** Bound independent read-only work, preserve order and drain before failing. */
export async function readOnlyMapBounded(items, read, concurrency = 5) {
  assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 6, "Read-only concurrency must stay between one and six");
  const results = Array(items.length);
  let next = 0, failed = false, failure;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await read(items[index], index); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }));
  if (failed) throw failure;
  return results;
}

/** Ordinary authorized reads hydrate content only in memory; saved/public evidence uses hashes. */
export async function loadSecondaryWorkload(api, fixture, manifest) {
  manifest ??= JSON.parse(await readFile(secondaryManifestPath, "utf8"));
  assert.ok([SECONDARY_MARKER, SCALED_SECONDARY_MARKER].includes(manifest.marker)); assert.equal(manifest.status, "complete");
  assert.equal(manifest.userId, fixture.userId); assert.equal(manifest.email, fixture.email);
  assert.equal(manifest.projectId, projectId);
  assertSecondaryProject(await api(`/api/projects/${projectId}`), fixture);
  const kinds = ["issue", "objective", "feedback"];
  const values = await readOnlyMapBounded(kinds, async (kind) => listRows(kind, await api(endpoint(kind))), 3);
  const sources = Object.fromEntries(kinds.map((kind, index) => [kind, values[index]]));
  const expected = manifest.marker === SCALED_SECONDARY_MARKER ? { triage: 120, tasks: 450, feedback: 120, objectives: 30 } : { triage: 12, tasks: 12, feedback: 10, objectives: 6 };
  const readiness = {};
  const validated = [];
  for (const [group, kind] of [["triage", "issue"], ["tasks", "issue"], ["feedback", "feedback"], ["objectives", "objective"]]) {
    assert.equal(manifest.entities[group].length, expected[group], "The complete declared cohort must be retained");
    assert.equal(manifest.counts[group], expected[group]);
    for (const record of manifest.entities[group]) {
      const row = sources[kind].find((item) => item.id === record.id);
      assert.ok(row, `Missing retained ${group} record`);
      assert.equal(fingerprint(entityFields(row, kind)), record.fingerprint, `Changed retained ${group} record`);
      assert.equal(record.commentIds.length, 2); assert.equal(new Set(record.commentIds).size, 2);
      validated.push({ group, kind, record, row });
    }
  }
  assert.equal(manifest.counts.comments, validated.length * 2);
  const details = await readOnlyMapBounded(validated, async ({ kind, record, row }) => {
    const comments = await api(commentRoute(kind, record.id));
    for (const id of record.commentIds) {
      const saved = comments.find((item) => item.id === id);
      assert.equal(saved?.author_id, fixture.userId, "Missing scoped fixture comment");
      assert.equal(fingerprint(saved.body), record.commentFingerprints[id], "Changed retained fixture comment");
    }
    return { id: row.id, title: row.title ?? row.name, bodyText: row.description ?? row.body,
      commentIds: record.commentIds, comments: comments.filter((item) => record.commentIds.includes(item.id)).map(({ id, body }) => ({ id, body })) };
  });
  for (const group of Object.keys(expected)) {
    readiness[group] = { listIds: manifest.entities[group].map((row) => row.id), details: details.filter((_, index) => validated[index].group === group) };
  }
  return { ...manifest, readiness };
}

const writeManifest = async (manifest, destination) => {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, JSON.stringify(manifest, null, 2));
  await rename(temporary, destination);
};

function assertEntity(row, spec, userId) {
  assert.ok(row && typeof row.id === "string", "Missing created fixture identity");
  assert.equal(row.project_id, projectId);
  const fields = spec.kind === "objective" ? ["name", "description", "lead_user_id", "target_date", "color"]
    : spec.kind === "feedback" ? ["title", "body", "is_public"]
      : ["id", "title", "description", "plan", "status", "priority", "effort", "assignee_id", "objective_id"];
  for (const field of fields) {
    // The ordinary objective API returns midnight dates as UTC timestamps.
    const canonical = (value) => field === "target_date" && typeof value === "string" ? new Date(value).toISOString() : value;
    assert.equal(fingerprint(canonical(row[field])), fingerprint(canonical(spec.payload[field])), `Changed synthetic ${spec.kind} ${field}`);
  }
  if (spec.kind === "issue") {
    assert.equal(row.created_by, userId);
    assert.deepEqual([...(row.category_ids ?? [])].sort(), [...spec.payload.category_ids].sort());
    for (const field of ["remote_provider", "remote_repo_id", "remote_number", "integration_id", "automation_override"]) assert.equal(row[field] ?? null, null);
  }
  if (spec.kind === "feedback") {
    assert.equal(row.source, "internal"); assert.equal(row.created_by_member, userId);
    assert.equal(row.merged_into_id ?? null, null, "A stable feedback record must not be merged");
  }
}

/** Final source recovery cannot create, repair or reclassify any fixture record. */
async function completeReadOnlyScaledReplay({ api, fixture, journal, definitions, before, addedIssueIds, feedbackAlreadyCompleted, persist }) {
  const previousStatus = journal.status;
  const expectedSource = { allSourceIssues: 1206, allBoardCards: 1086, projectSourceIssues: 670, projectBoardCards: 550 };
  assert.ok(["incomplete-source", "complete"].includes(previousStatus));
  assert.deepEqual(journal.expectedSource, expectedSource);
  for (const [kind, count] of Object.entries(SECONDARY_COUNTS)) assert.equal(journal.counts[kind], count);
  if (previousStatus === "incomplete-source") {
    assert.equal(journal.sourceComplete, false);
    assert.equal(journal.counts.allSourceIssues, 1000);
    assert.equal(journal.counts.allBoardCards, 880);
    assert.equal(journal.failure, "Complete API source required: expected global 1206/1086 and project 670/550 issues/cards, observed 1000/880 and 670/550");
  } else {
    assert.equal(journal.sourceComplete, true);
    for (const [key, count] of Object.entries(expectedSource)) assert.equal(journal.counts[key], count);
  }
  assert.equal(journal.settings.phase, "restored", "A read-only source recovery cannot repair review settings");
  assert.equal(journal.preservation.settingsRestored, true);
  assert.equal(journal.preservation.beforeFingerprint, journal.preservation.afterFingerprint);
  assert.equal(journal.beforeFingerprint, fingerprint(before));
  assert.equal(journal.preservation.beforeFingerprint, fingerprint(before));
  assert.equal(feedbackAlreadyCompleted, true, "All private feedback must already have both completion markers");
  const allowed = new Set();
  const objectiveIds = new Map(journal.entities.objectives.map((record) => [record.key, record.id]));
  for (const [group, specs] of Object.entries(definitions)) {
    assert.equal(journal.entities[group].length, specs.length);
    for (const spec of specs) {
      const record = journal.entities[group].find((item) => item.key === spec.key);
      assert.ok(record, "A final source replay requires every accepted canonical record");
      const operation = journal.operations[spec.key]; allowed.add(spec.key);
      assert.equal(operation?.phase, "accepted"); assert.equal(operation.kind, spec.kind); assert.equal(operation.id, record.id);
      const payload = { ...spec.payload, ...(spec.objectiveKey ? { objective_id: objectiveIds.get(spec.objectiveKey) } : {}) };
      assert.equal(operation.inputFingerprint, fingerprint(payload));
      if (spec.payload.id) assert.equal(record.id, spec.payload.id);
      assert.equal(record.commentIds.length, 2);
      for (const [index, comment] of spec.comments.entries()) {
        const key = `${spec.key}:comment-${index}`, saved = journal.operations[key]; allowed.add(key);
        assert.equal(saved?.phase, "accepted"); assert.equal(saved.kind, "comment");
        assert.equal(saved.id, record.commentIds[index]); assert.equal(saved.parentId, record.id);
        assert.equal(saved.inputFingerprint, fingerprint(comment));
        assert.equal(record.commentFingerprints[saved.id], fingerprint(comment.body));
      }
      if (spec.kind === "feedback" && spec.status !== "open") {
        const key = `${spec.key}:lifecycle`, lifecycle = journal.operations[key]; allowed.add(key);
        assert.deepEqual(lifecycle, { id: record.id, phase: "accepted", desiredStatus: spec.status });
      }
    }
  }
  assert.deepEqual(Object.keys(journal.operations).sort(), [...allowed].sort(), "Unknown or unfinished operations cannot enter read-only recovery");
  // The clone permits full canonical validation of a durable final source
  // failure. It does not change the saved status before every proof succeeds.
  await loadSecondaryWorkload(api, fixture, { ...journal, status: "complete" });
  const after = await capturePreserved(api, fixture, addedIssueIds);
  assert.deepEqual(after, before, "Read-only recovery must preserve every original issue, Page, tab and Git link");
  const [board, projectIssues, currentProject, members] = await readOnlyMapBounded([
    "/api/me/board", endpoint("issue"), `/api/projects/${projectId}`, `/api/projects/${projectId}/members`,
  ], (route) => api(route), 4);
  assertSecondaryProject(currentProject, fixture);
  assert.equal(currentProject.feedback_review_enabled, journal.settings.originalFeedbackReviewEnabled);
  assert.equal(members.isOwner, true); assert.deepEqual(members.members.map((row) => row.user_id).sort(), [fixture.userId]);
  assert.equal(members.invitations?.length ?? 0, 0);
  const expectedIds = new Set([...before.issues, ...journal.entities.triage, ...journal.entities.tasks].map((row) => row.id));
  assert.equal(expectedIds.size, 1206); assert.equal(new Set(board.issues.map((row) => row.id)).size, board.issues.length);
  assert.deepEqual(board.issues.map((row) => row.id).sort(), [...expectedIds].sort(), "The global source must contain every preserved and secondary identity");
  const projectIds = [...secondaryOriginalIssueIds.slice(0, 100), ...journal.entities.triage.map((row) => row.id), ...journal.entities.tasks.map((row) => row.id)];
  assert.deepEqual(projectIssues.map((row) => row.id).sort(), projectIds.sort());
  const cards = (rows) => rows.filter((row) => !["triage", "duplicate"].includes(row.status)).length;
  const source = { allSourceIssues: board.issues.length, allBoardCards: cards(board.issues), projectSourceIssues: projectIssues.length, projectBoardCards: cards(projectIssues) };
  assert.deepEqual(source, expectedSource, "The complete source cannot be replaced by capped rows or inferred counts");
  journal.readOnlyReplay = { protocol: "min683-final-source-read-only-replay-v1", fromStatus: previousStatus,
    previousSource: Object.fromEntries(Object.keys(expectedSource).map((key) => [key, journal.counts[key]])),
    checkedEntities: 720, checkedComments: 1440, commentReadConcurrency: 5, checkedAt: new Date().toISOString() };
  journal.counts = { ...journal.counts, ...source }; journal.sourceComplete = true;
  journal.status = "complete"; delete journal.failure; journal.completedAt = new Date().toISOString(); journal.lastRunMutations = 0;
  await persist(journal);
  return journal;
}

/** Journal every creation before transport and recover only exact scoped outcomes. */
export async function enrichSecondaryWorkload({ api, fixture, getIdentity, apply = false, journal,
  cohort = "scaled", legacyJournal, backupLegacy,
  persist = async () => {}, wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) }) {
  assert.ok(["legacy", "scaled"].includes(cohort));
  const scaled = cohort === "scaled", targetMarker = scaled ? SCALED_SECONDARY_MARKER : SECONDARY_MARKER;
  assertSecondaryIdentity(fixture, await getIdentity());
  const project = await api(`/api/projects/${projectId}`);
  assertSecondaryProject(project, fixture);
  const members = await api(`/api/projects/${projectId}/members`);
  assert.equal(members.isOwner, true);
  assert.deepEqual(members.members.map((row) => row.user_id).sort(), [fixture.userId], "The synthetic project must have only its fixture owner");
  assert.equal(members.invitations?.length ?? 0, 0, "Do not enrich a project with pending invitations");
  assert.equal((await api("/api/routines")).routines.filter((row) => row.project_id === projectId && row.enabled).length, 0,
    "Do not trigger enabled synthetic-project routines");
  const categories = await api(`/api/projects/${projectId}/categories`);
  assert.ok(categories.every((row) => row.project_id === projectId));
  const categoryIds = categories.map((row) => row.id).sort().slice(0, 3);
  const definitions = secondaryDefinitions(fixture.userId, categoryIds, { cohort });
  const definitionsHash = fingerprint(definitions);
  if (scaled) {
    assert.equal(legacyJournal?.marker, SECONDARY_MARKER, "Scaling requires the retained completed small cohort");
    await loadSecondaryWorkload(api, fixture, legacyJournal);
    for (const [group, count] of [["triage", 12], ["tasks", 12], ["feedback", 10], ["objectives", 6]]) {
      assert.equal(legacyJournal.entities[group].length, count, "Do not replace the established small cohort");
    }
    assert.deepEqual(categoryIds, legacyJournal.categoryIds, "Preserve existing scoped category assignments");
  }
  if (journal) {
    assert.equal(journal.marker, targetMarker); assert.equal(journal.userId, fixture.userId);
    assert.equal(journal.email, fixture.email); assert.equal(journal.projectId, projectId);
    assert.equal(journal.definitionsHash, definitionsHash, "The retained fixture definition must remain stable");
  }
  if (!journal) {
    let migration;
    if (scaled) {
      if (apply) assert.equal(typeof backupLegacy, "function", "A durable legacy backup is required before scaled mutations");
      migration = { fromMarker: legacyJournal.marker, legacyDefinitionsHash: legacyJournal.definitionsHash,
        legacyEntityFingerprint: fingerprint(legacyJournal.entities), legacyCounts: legacyJournal.counts,
        ...(apply ? { backup: await backupLegacy(legacyJournal) } : {}) };
    }
    journal = { marker: targetMarker, userId: fixture.userId, email: fixture.email, projectId,
      definitionsHash, categoryIds, operations: scaled ? structuredClone(legacyJournal.operations) : {}, entities: {},
      ...(migration ? { migration } : {}), ...(scaled && legacyJournal.failureHistory ? { failureHistory: structuredClone(legacyJournal.failureHistory) } : {}),
      status: "planned", establishedAt: new Date().toISOString() };
  }
  if (journal.failure) {
    journal.failureHistory ??= [];
    if (journal.failureHistory.at(-1)?.reason !== journal.failure) journal.failureHistory.push({ at: new Date().toISOString(), reason: journal.failure });
  }
  if (journal.status === "complete" && !scaled) await loadSecondaryWorkload(api, fixture, journal);
  // Refuse an unknown non-idempotent outcome before even changing review settings.
  // A successful read can recover a lost acknowledgement; absence cannot prove
  // that a server-generated creation never reached the database.
  for (const [key, operation] of Object.entries(journal.operations)) {
    if (operation.id || !["started", "ambiguous"].includes(operation.phase) || operation.kind === "issue") continue;
    const spec = Object.values(definitions).flat().find((item) => item.key === key.split(":comment-")[0]);
    if (!spec) continue;
    if (operation.kind === "comment") {
      const payload = spec.comments[Number(key.split(":comment-")[1])];
      if (payload.id) continue;
      const rows = await api(commentRoute(spec.kind, operation.parentId));
      assert.equal(rows.filter((row) => row.body === payload.body && row.author_id === fixture.userId).length, 1,
        `Unresolved comment outcome: ${key}`);
    } else {
      const field = spec.kind === "objective" ? "name" : "title";
      const matches = listRows(spec.kind, await api(endpoint(spec.kind))).filter((row) => row[field] === spec.payload[field]);
      assert.equal(matches.length, 1, `Unresolved ${spec.kind} outcome: ${key}`);
      assertEntity(matches[0], spec, fixture.userId);
    }
  }
  const legacyIssueIds = new Set(scaled ? [...legacyJournal.entities.triage, ...legacyJournal.entities.tasks].map((record) => record.id) : []);
  const addedIssueIds = new Set([...definitions.triage, ...definitions.tasks].map((spec) => spec.payload.id).filter((id) => !legacyIssueIds.has(id)));
  const before = await capturePreserved(api, fixture, addedIssueIds);
  assert.equal(before.issues.length, scaled ? 660 : 636, "Preserve the complete original authorized issue cohort");
  const protectedIds = new Set(before.issues.map((row) => row.id));
  assert.ok(secondaryOriginalIssueIds.every((id) => protectedIds.has(id)), "Every original synthetic issue identity must remain present");
  if (scaled && journal.status !== "complete" && journal.beforeFingerprint) assert.equal(fingerprint(before), journal.beforeFingerprint,
    "An incomplete migration must not silently replace its protected original snapshot");
  const feedbackBefore = listRows("feedback", await api(endpoint("feedback")));
  assert.ok(feedbackBefore.length < 500, "A capped feedback list cannot prove absence for deduplication");
  assert.ok(feedbackBefore.every((row) => (row.analyzed_at && row.classified_at) || definitions.feedback.some((spec) =>
    row.title === spec.payload.title && row.body === spec.payload.body && row.source === "internal" && row.is_public === false &&
    row.created_by_member === fixture.userId)), "Disabling review must not affect pre-existing unreviewed feedback");
  const feedbackAlreadyCompleted = definitions.feedback.every((spec) => feedbackBefore.some((row) =>
    row.title === spec.payload.title && row.body === spec.payload.body && row.source === "internal" && row.is_public === false &&
    row.status === spec.status && row.analyzed_at && row.classified_at));
  if (!apply) {
    return { marker: targetMarker, status: "read-only-preflight", verifiedIdentity: true,
      projectId, feedbackReviewEnabled: project.feedback_review_enabled,
      counts: { triage: definitions.triage.length, tasks: definitions.tasks.length, feedback: definitions.feedback.length,
        objectives: definitions.objectives.length, comments: Object.values(definitions).flat().reduce((sum, spec) => sum + spec.comments.length, 0) },
      ...(scaled ? { additions: { triage: 108, tasks: 438, feedback: 110, objectives: 24, comments: 1360 },
        expectedSource: { allSourceIssues: 1206, allBoardCards: 1086, projectSourceIssues: 670, projectBoardCards: 550 },
        legacyEntityFingerprint: journal.migration.legacyEntityFingerprint } : {}),
      preservedFingerprint: fingerprint(before), definitionsHash, mutations: 0 };
  }
  if (scaled && ["incomplete-source", "complete"].includes(journal.status)) return completeReadOnlyScaledReplay({
    api, fixture, journal, definitions, before, addedIssueIds, feedbackAlreadyCompleted, persist,
  });
  journal.status = "applying"; journal.beforeFingerprint = fingerprint(before);
  await persist(journal);
  let mutationCount = 0;
  const mutate = async (route, method, payload, reviewDisabled = false) => {
    const [identity, current, currentMembers, currentRoutines] = await Promise.all([
      getIdentity(), api(`/api/projects/${projectId}`), api(`/api/projects/${projectId}/members`), api("/api/routines"),
    ]);
    assertSecondaryIdentity(fixture, identity);
    assertSecondaryProject(current, fixture);
    assert.equal(currentMembers.isOwner, true);
    assert.deepEqual(currentMembers.members.map((row) => row.user_id).sort(), [fixture.userId], "Recheck sole fixture membership before every mutation");
    assert.equal(currentMembers.invitations?.length ?? 0, 0);
    assert.equal(currentRoutines.routines.filter((row) => row.project_id === projectId && row.enabled).length, 0);
    if (reviewDisabled) assert.equal(current.feedback_review_enabled, false, "Keep review disabled until every new feedback is completed");
    mutationCount++;
    return api(route, method, payload);
  };
  const ensure = async (spec) => {
    const rows = listRows(spec.kind, await api(endpoint(spec.kind)));
    const titleField = spec.kind === "objective" ? "name" : "title";
    const candidates = rows.filter((row) => row.id === spec.payload.id || row[titleField] === spec.payload[titleField]);
    assert.ok(candidates.length <= 1, "Refuse ambiguous synthetic matches");
    let row = candidates[0];
    const operation = journal.operations[spec.key];
    if (row) assertEntity(row, spec, fixture.userId);
    else {
      assert.ok(!operation?.id, "A previously accepted fixture record is missing; do not recreate it");
      if (!spec.payload.id && ["started", "ambiguous"].includes(operation?.phase)) {
        throw new Error(`Unresolved ${spec.kind} outcome: ${spec.key}; reconcile the saved journal before retrying`);
      }
      journal.operations[spec.key] = { kind: spec.kind, phase: "started", inputFingerprint: fingerprint(spec.payload), startedAt: new Date().toISOString() };
      await persist(journal);
      try {
        row = unpack(spec.kind, await mutate(endpoint(spec.kind), "POST", spec.payload, spec.kind === "feedback"));
        assertEntity(row, spec, fixture.userId);
      } catch (error) {
        journal.operations[spec.key].phase = "ambiguous";
        journal.operations[spec.key].status = error.status ?? null;
        await persist(journal); throw error;
      }
    }
    const accepted = { ...journal.operations[spec.key], kind: spec.kind, id: row.id,
      inputFingerprint: fingerprint(spec.payload), phase: "accepted" };
    if (fingerprint(journal.operations[spec.key]) !== fingerprint(accepted)) { journal.operations[spec.key] = accepted; await persist(journal); }
    return row;
  };
  const ensureComments = async (row, spec) => {
    const route = commentRoute(spec.kind, row.id), ids = [];
    for (const [index, payload] of spec.comments.entries()) {
      const key = `${spec.key}:comment-${index}`;
      const comments = await api(route);
      const candidates = comments.filter((item) => item.id === payload.id || item.body === payload.body);
      assert.ok(candidates.length <= 1, "Refuse duplicate synthetic comments");
      let saved = candidates[0];
      if (!saved) {
        const operation = journal.operations[key];
        assert.ok(!operation?.id, "A retained comment was removed; do not recreate it");
        if (!payload.id && ["started", "ambiguous"].includes(operation?.phase)) throw new Error(`Unresolved comment outcome: ${key}`);
        journal.operations[key] = { kind: "comment", parentId: row.id, inputFingerprint: fingerprint(payload), phase: "started" };
        await persist(journal);
        try { saved = await mutate(route, "POST", { ...payload, mentioned_user_ids: [], parent_id: null }); }
        catch (error) { journal.operations[key].phase = "ambiguous"; journal.operations[key].status = error.status ?? null; await persist(journal); throw error; }
      }
      assert.equal(saved.body, payload.body); assert.equal(saved.author_id, fixture.userId);
      const parentField = spec.kind === "feedback" ? "feedback_post_id" : spec.kind === "objective" ? "objective_id" : "issue_id";
      assert.equal(saved[parentField], row.id); assert.equal(saved.parent_id ?? null, null);
      if (spec.kind === "feedback") assert.equal(saved.visibility, "internal");
      const accepted = { ...journal.operations[key], kind: "comment", parentId: row.id, id: saved.id,
        phase: "accepted", inputFingerprint: fingerprint(payload), bodyFingerprint: fingerprint(saved.body) };
      if (fingerprint(journal.operations[key]) !== fingerprint(accepted)) { journal.operations[key] = accepted; await persist(journal); }
      ids.push(saved.id);
    }
    return ids;
  };
  const records = { triage: [], tasks: [], objectives: [], feedback: [] };
  const saveRecord = async (group, row, spec) => {
    const commentIds = await ensureComments(row, spec);
    const fields = entityFields(row, spec.kind);
    const commentFingerprints = Object.fromEntries(commentIds.map((id, index) => [id, fingerprint(spec.comments[index].body)]));
    const record = { key: spec.key, id: row.id, title: row.title, name: row.name, status: row.status, commentIds, commentFingerprints,
      fingerprint: fingerprint(fields), descriptionFingerprint: fingerprint(row.description ?? row.body),
      ...(spec.kind === "issue" ? { planFingerprint: fingerprint(row.plan), categoryIds: row.category_ids, objectiveId: row.objective_id } : {}) };
    records[group].push(record); return record;
  };
  let failure;
  try {
    journal.settings ??= { originalFeedbackReviewEnabled: project.feedback_review_enabled, phase: "unchanged" };
    if (project.feedback_review_enabled && !feedbackAlreadyCompleted) {
      journal.settings.phase = "disabling"; await persist(journal);
      await mutate(`/api/projects/${projectId}`, "PATCH", { feedback_review_enabled: false });
      journal.settings.phase = "disabled"; await persist(journal);
    } else if (project.feedback_review_enabled) journal.settings.phase = "restored";
    const objectiveIds = new Map();
    for (const spec of definitions.objectives) {
      const row = await ensure(spec); objectiveIds.set(spec.key, row.id);
      await saveRecord("objectives", row, spec);
    }
    for (const [group, specs] of [["triage", definitions.triage], ["tasks", definitions.tasks]]) {
      for (const spec of specs) {
        if (spec.objectiveKey) spec.payload.objective_id = objectiveIds.get(spec.objectiveKey);
        await saveRecord(group, await ensure(spec), spec);
      }
    }
    for (const spec of definitions.feedback) {
      let row = await ensure(spec);
      if (row.status !== spec.status) {
        assert.ok(journal.status !== "complete");
        journal.operations[`${spec.key}:lifecycle`] = { id: row.id, phase: "started", desiredStatus: spec.status }; await persist(journal);
        row = unpack("feedback", await mutate(`${endpoint("feedback")}/${row.id}`, "PATCH", { status: spec.status, is_public: false }, true));
        journal.operations[`${spec.key}:lifecycle`].phase = "accepted"; await persist(journal);
      }
      await saveRecord("feedback", row, spec);
    }
    // The disabled-review path marks both fields specifically to prevent a
    // retroactive paid pass after the original flag is restored.
    for (const record of records.feedback) await waitForFeedbackCompletion(api, record.id, wait);
    const freshObjectives = await api(endpoint("objective"));
    for (const record of records.objectives) {
      const row = freshObjectives.find((item) => item.id === record.id);
      assert.ok(["planned", "in_progress"].includes(row.status), "All fixture goals must remain active");
      record.status = row.status; record.fingerprint = fingerprint(entityFields(row, "objective"));
      record.taskIds = records.tasks.filter((task) => task.objectiveId === row.id).map((task) => task.id);
    }
    journal.entities = records;
  } catch (error) { failure = error; journal.status = "incomplete"; journal.failure = error.message; }
  finally {
    if (journal.settings?.originalFeedbackReviewEnabled && journal.settings.phase !== "restored") {
      try {
        // A lost feedback acknowledgement can still leave an inserted post.
        // Recover its exact identity before restoring review; absence is ambiguous.
        for (const spec of definitions.feedback) {
          const operation = journal.operations[spec.key];
          if (!operation || operation.id || !["started", "ambiguous"].includes(operation.phase)) continue;
          const matches = (await api(endpoint("feedback"))).posts.filter((row) => row.title === spec.payload.title);
          assert.equal(matches.length, 1, "Unresolved feedback transport; preserve the disabled-review recovery state");
          assertEntity(matches[0], spec, fixture.userId); operation.id = matches[0].id;
          await persist(journal);
        }
        const createdFeedbackIds = Object.values(journal.operations).filter((row) => row.kind === "feedback" && row.id).map((row) => row.id);
        for (const id of createdFeedbackIds) await waitForFeedbackCompletion(api, id, wait);
        journal.settings.phase = "restoring"; await persist(journal);
        await mutate(`/api/projects/${projectId}`, "PATCH", { feedback_review_enabled: true });
        assert.equal((await api(`/api/projects/${projectId}`)).feedback_review_enabled, true);
        journal.settings.phase = "restored";
      } catch (error) { journal.settings.phase = "recovery-required"; journal.status = "incomplete"; failure ??= error; }
    }
    await persist(journal);
  }
  if (failure) throw failure;
  if (scaled) await loadSecondaryWorkload(api, fixture, legacyJournal);
  const after = await capturePreserved(api, fixture, addedIssueIds);
  assert.deepEqual(after, before, "Every pre-existing issue, Page, tab and Git link must remain unchanged");
  const board = await api("/api/me/board");
  const projectIssues = await api(endpoint("issue"));
  const boardRows = (rows) => rows.filter((row) => !["triage", "duplicate"].includes(row.status));
  journal.counts = { triage: records.triage.length, tasks: records.tasks.length, objectives: records.objectives.length,
    feedback: records.feedback.length, comments: Object.values(records).flat().reduce((sum, row) => sum + row.commentIds.length, 0),
    allSourceIssues: board.issues.length, allBoardCards: boardRows(board.issues).length,
    projectSourceIssues: projectIssues.length, projectBoardCards: boardRows(projectIssues).length };
  journal.preservation = { beforeFingerprint: fingerprint(before), afterFingerprint: fingerprint(after),
    oldIssueCount: before.issues.length, pageTreeFingerprint: fingerprint(before.pages), tabFingerprint: fingerprint(before.tabs),
    linkFingerprint: fingerprint(before.links), settingsRestored: (await api(`/api/projects/${projectId}`)).feedback_review_enabled === journal.settings.originalFeedbackReviewEnabled };
  if (scaled) {
    journal.expectedSource = { allSourceIssues: 1206, allBoardCards: 1086, projectSourceIssues: 670, projectBoardCards: 550 };
    journal.sourceComplete = Object.entries(journal.expectedSource).every(([key, value]) => journal.counts[key] === value);
    if (!journal.sourceComplete) {
      journal.status = "incomplete-source"; journal.lastRunMutations = mutationCount;
      journal.failure = `Complete API source required: expected global 1206/1086 and project 670/550 issues/cards, observed ${journal.counts.allSourceIssues}/${journal.counts.allBoardCards} and ${journal.counts.projectSourceIssues}/${journal.counts.projectBoardCards}`;
      await persist(journal); throw new Error(journal.failure);
    }
  }
  journal.status = "complete"; delete journal.failure; journal.completedAt = new Date().toISOString();
  journal.lastRunMutations = mutationCount;
  await persist(journal);
  return journal;
}

async function capturePreserved(api, fixture, newlyAddedIds = new Set()) {
  // Per-project authorized sources stay below the global row cap and provide
  // independent preservation evidence when the global DTO is incomplete.
  const source = [];
  for (const id of [...fixture.projects, ...(fixture.connectedProjectId ? [fixture.connectedProjectId] : [])]) {
    source.push(...await api(`/api/projects/${id}/issues`));
  }
  assert.equal(new Set(source.map((row) => row.id)).size, source.length, "Project sources must have unique issue identities");
  const issues = source.filter((row) => !newlyAddedIds.has(row.id)).map((row) => ({ id: row.id, fingerprint: fingerprint(row) })).sort((a, b) => a.id.localeCompare(b.id));
  const pages = [], links = [];
  for (const id of fixture.projects) {
    pages.push({ projectId: id, fingerprint: fingerprint(await api(`/api/projects/${id}/pages`)) });
    links.push({ projectId: id, fingerprint: fingerprint((await api(`/api/projects/${id}/git-link`)).link) });
  }
  if (fixture.connectedProjectId) links.push({ projectId: fixture.connectedProjectId,
    fingerprint: fingerprint((await api(`/api/projects/${fixture.connectedProjectId}/git-link`)).link) });
  return { issues, pages, links, tabs: fingerprint(await api("/api/me/app-tabs")) };
}

async function waitForFeedbackCompletion(api, id, wait) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const { post } = await api(`${endpoint("feedback")}/${id}`);
    assert.equal(post.project_id, projectId); assert.equal(post.source, "internal"); assert.equal(post.is_public, false);
    assert.equal(post.merged_into_id ?? null, null);
    if (post.analyzed_at && post.classified_at) return;
    await wait(1000);
  }
  throw new Error(`Feedback completion markers unresolved: ${id}; keep review disabled and use the recovery journal`);
}

async function main() {
  const { loadEnv, requireEnv } = await import("../../captures/lib/env.mjs");
  const { createServerClient } = await import("@supabase/ssr");
  const { request } = await import("playwright");
  loadEnv();
  const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname)); assert.equal(new URL(base).origin, base);
  const fixture = JSON.parse(await readFile(path.resolve("output/playwright/performance/workload.json"), "utf8"));
  const stable = JSON.parse(await readFile(path.resolve("output/playwright/performance/min683-stable-tabs.json"), "utf8"));
  assert.equal(stable.userId, fixture.userId); fixture.connectedProjectId = stable.forge.project;
  const cookies = [];
  const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: { getAll: () => cookies, setAll: (values) => { for (const value of values) { const old = cookies.findIndex((item) => item.name === value.name); if (old < 0) cookies.push(value); else cookies[old] = value; } } },
  });
  const login = await auth.auth.signInWithPassword({ email: SECONDARY_EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
  if (login.error) throw new Error(`Fixture sign-in failed: ${login.error.code}`);
  assertSecondaryIdentity(fixture, login.data.user);
  const client = await request.newContext({ baseURL: base, extraHTTPHeaders: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") } });
  const api = async (route, method = "GET", data) => {
    assert.ok(route.startsWith("/api/") && !route.includes("..") && !route.includes("?candidates"));
    const response = await client.fetch(route, { method, ...(data === undefined ? {} : { data }) });
    if (!response.ok()) {
      const error = new Error(`${method} ${route}: ${response.status()}; stop and respect Retry-After before retrying`);
      error.status = response.status(); error.retryAfter = response.headers()["retry-after"] ?? null; throw error;
    }
    return response.json();
  };
  let journal;
  try { journal = JSON.parse(await readFile(secondaryManifestPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const legacyBytes = await readFile(legacySecondaryManifestPath);
  const legacyJournal = JSON.parse(legacyBytes);
  const legacySha256 = createHash("sha256").update(legacyBytes).digest("hex");
  const backupLegacy = async () => {
    const backup = `${legacySecondaryManifestPath}.before-scaled-${legacySha256.slice(0, 12)}.json`;
    try { await writeFile(backup, legacyBytes, { flag: "wx" }); }
    catch (error) { if (error.code !== "EEXIST") throw error; assert.equal(createHash("sha256").update(await readFile(backup)).digest("hex"), legacySha256); }
    return { path: backup, sha256: legacySha256, bytes: legacyBytes.length };
  };
  try {
    const result = await enrichSecondaryWorkload({ api, fixture, journal, legacyJournal, backupLegacy, apply: process.argv.includes("--apply"),
      getIdentity: async () => { const { data, error } = await auth.auth.getUser(); if (error) throw new Error(`Fixture identity check failed: ${error.code}`); return data.user; },
      persist: (value) => writeManifest(value, secondaryManifestPath) });
    console.log(JSON.stringify({ status: result.status, marker: result.marker, projectId, identity: { email: fixture.email, userId: fixture.userId, marker: fixture.marker },
      counts: result.counts, preservation: result.preservation, feedbackReviewEnabled: result.feedbackReviewEnabled,
      additions: result.additions, expectedSource: result.expectedSource, definitionsHash: result.definitionsHash, legacyEntityFingerprint: result.legacyEntityFingerprint,
      mutations: result.lastRunMutations ?? result.mutations,
      manifestPath: process.argv.includes("--apply") ? secondaryManifestPath : undefined }));
  } finally { await client.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
