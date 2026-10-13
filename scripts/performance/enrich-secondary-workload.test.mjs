import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { enrichSecondaryWorkload, fingerprint, loadSecondaryWorkload, SECONDARY_EMAIL, SECONDARY_MARKER,
  secondaryDefinitions, secondaryFixtureProjectIds, secondaryOriginalIssueIds, secondaryId, SCALED_SECONDARY_MARKER } from "./enrich-secondary-workload.mjs";

function fixtureApi(options = {}) {
  const fixture = { email: SECONDARY_EMAIL, marker: "min-540-performance-v1", userId: "fixture-user",
    projects: [...secondaryFixtureProjectIds], connectedProjectId: "shared-project" };
  const user = { id: fixture.userId, email: fixture.email, user_metadata: { performance_fixture: fixture.marker } };
  const pid = fixture.projects[0];
  const project = { id: pid, owner_id: fixture.userId, name: "Performance 1", key: "PF1", smart_assign_enabled: false,
    auto_assign_enabled: false, automations_enabled: false, feedback_review_enabled: true };
  const categories = [0, 1, 2].map((index) => ({ id: secondaryId(`category-${index}`), project_id: pid }));
  const originalIssues = Array.from({ length: 636 }, (_, index) => ({ id: secondaryOriginalIssueIds[index] ?? `shared-${index}`,
    project_id: index < 600 ? fixture.projects[Math.floor(index / 100)] : "shared-project", status: "todo", title: "Existing immutable issue" }));
  const issues = [], objectives = [], feedback = [], comments = new Map(), mutations = [], persisted = [];
  const state = { fixture, user, project, categories, originalIssues, issues, objectives, feedback, comments, mutations, persisted,
    members: [fixture.userId], routines: [], loseOnce: options.loseOnce, invisibleOnce: options.invisibleOnce,
    reviewCompletes: options.reviewCompletes ?? true, identityChecks: 0 };
  const routeRoot = `/api/projects/${pid}`;
  const clone = (row) => structuredClone(row);
  state.api = async (route, method = "GET", payload) => {
    if (method === "GET") {
      if (route === routeRoot) return clone(project);
      if (route === `${routeRoot}/members`) return { isOwner: true, invitations: [], members: state.members.map((user_id) => ({ user_id })) };
      if (route === "/api/routines") return { routines: clone(state.routines) };
      if (route === `${routeRoot}/categories`) return clone(categories);
      if (/^\/api\/projects\/[^/]+\/issues$/.test(route)) {
        const target = route.split("/")[3];
        return clone([...originalIssues, ...issues].filter((row) => row.project_id === target));
      }
      if (route === `${routeRoot}/objectives`) return clone(objectives);
      if (route === `${routeRoot}/feedback`) return { posts: clone(feedback) };
      if (route === "/api/me/board") return { issues: clone([...originalIssues, ...issues].slice(0, state.globalCap ?? Infinity)) };
      if (route === "/api/me/app-tabs") return Array.from({ length: 10 }, (_, index) => ({ id: `tab-${index}`, user_id: fixture.userId }));
      if (/^\/api\/projects\/[^/]+\/pages$/.test(route)) return [{ id: `${route}:existing-page`, version: 5 }];
      if (/^\/api\/projects\/[^/]+\/git-link$/.test(route)) return { link: { id: `${route}:existing-link`, connection_id: "preserved-main-connection" } };
      if (route.endsWith("/comments")) return clone(comments.get(route) ?? []);
      if (route.startsWith(`${routeRoot}/feedback/`)) return { post: clone(feedback.find((row) => route.endsWith(row.id))) };
      throw new Error(`Unexpected read: ${route}`);
    }
    mutations.push({ route, method, payload: clone(payload) });
    let result;
    if (route === routeRoot && method === "PATCH") {
      assert.deepEqual(Object.keys(payload), ["feedback_review_enabled"]);
      project.feedback_review_enabled = payload.feedback_review_enabled; result = clone(project);
    } else if (route === `${routeRoot}/issues` && method === "POST") {
      let row = issues.find((item) => item.id === payload.id);
      if (!row) { row = { ...clone(payload), project_id: pid, created_by: fixture.userId }; issues.push(row); }
      if (row.objective_id) {
        const objective = objectives.find((item) => item.id === row.objective_id);
        const tasks = issues.filter((item) => item.objective_id === objective.id);
        objective.status = tasks.some((item) => ["in_progress", "in_review", "done"].includes(item.status)) ? "in_progress" : "planned";
      }
      result = clone(row);
    } else if (route === `${routeRoot}/objectives` && method === "POST") {
      const row = { ...clone(payload), target_date: `${payload.target_date}T00:00:00+00:00`, id: randomUUID(), project_id: pid }; objectives.push(row); result = clone(row);
    } else if (route === `${routeRoot}/feedback` && method === "POST") {
      assert.equal(project.feedback_review_enabled, false);
      const row = { ...clone(payload), id: randomUUID(), project_id: pid, created_by_member: fixture.userId, source: "internal", status: "open",
        category_ids: [], analyzed_at: state.reviewCompletes ? "completed" : null, classified_at: state.reviewCompletes ? "completed" : null };
      delete row.user; feedback.push(row); result = { post: clone(row) };
    } else if (route.startsWith(`${routeRoot}/feedback/`) && method === "PATCH") {
      const row = feedback.find((item) => route.endsWith(item.id)); Object.assign(row, payload); result = { post: clone(row) };
    } else if (route.endsWith("/comments") && method === "POST") {
      const list = comments.get(route) ?? [], id = payload.id ?? randomUUID();
      let row = list.find((item) => item.id === id);
      if (!row) {
        const parts = route.split("/"), parentId = parts.at(-2), kind = parts.includes("feedback") ? "feedback" : parts[2];
        const field = kind === "feedback" ? "feedback_post_id" : kind === "objectives" ? "objective_id" : "issue_id";
        row = { ...clone(payload), id, author_id: fixture.userId, [field]: parentId, parent_id: null };
        list.push(row); comments.set(route, list);
      }
      result = clone(row);
    } else throw new Error(`Forbidden mutation: ${method} ${route}`);
    if (state.loseOnce?.(route, method, payload)) {
      state.loseOnce = null;
      if (state.invisibleOnce) {
        if (route.endsWith("/objectives")) objectives.pop();
        if (route.endsWith("/feedback")) feedback.pop();
      }
      throw new Error("Response lost after transport");
    }
    return result;
  };
  state.run = (apply = true, journal = state.journal) => enrichSecondaryWorkload({ api: state.api, fixture, cohort: state.cohort ?? "legacy",
    legacyJournal: state.legacyJournal, backupLegacy: async (value) => { state.backup = clone(value); return { path: "in-memory-test-backup", fingerprint: fingerprint(value) }; },
    getIdentity: async () => { state.identityChecks++; return clone(state.user); }, apply, journal,
    wait: async () => {}, persist: async (value) => { state.journal = value; persisted.push({ status: value.status, settings: clone(value.settings) }); } });
  return state;
}

test("refuses every wrong identity and project ownership boundary before any mutation", async () => {
  for (const change of [
    (s) => { s.user.email = "primary@example.test"; }, (s) => { s.user.id = "primary-user"; },
    (s) => { s.user.user_metadata.performance_fixture = "other"; }, (s) => { s.project.owner_id = "primary-user"; },
    (s) => { s.project.smart_assign_enabled = true; }, (s) => { s.members.push("other-member"); },
    (s) => { s.routines.push({ enabled: true, project_id: s.project.id }); },
  ]) {
    const state = fixtureApi(); change(state);
    await assert.rejects(state.run()); assert.equal(state.mutations.length, 0);
  }
});

test("preflight is read-only and defines a rich deterministic isolated workload", async () => {
  const state = fixtureApi(), result = await state.run(false);
  assert.equal(result.status, "read-only-preflight"); assert.equal(state.mutations.length, 0);
  assert.deepEqual(result.counts, { triage: 12, tasks: 12, feedback: 10, objectives: 6, comments: 80 });
  const defs = secondaryDefinitions(state.fixture.userId, state.categories.map((row) => row.id).sort(), { cohort: "legacy" });
  assert.equal(new Set([...defs.triage, ...defs.tasks].map((row) => row.payload.id)).size, 24);
  assert.ok(defs.triage.every((row) => row.payload.status === "triage" && row.payload.description.length > 400 && row.payload.plan.includes("[ ]") && row.comments.length === 2));
  assert.ok(defs.feedback.every((row) => row.payload.is_public === false && row.comments.every((item) => item.visibility === "internal")));
});

test("retains the new fixture, restores review and repeats without accumulating or touching old records", async () => {
  const state = fixtureApi(), old = fingerprint(state.originalIssues);
  const result = await state.run();
  assert.equal(result.status, "complete"); assert.equal(result.marker, SECONDARY_MARKER);
  assert.deepEqual(result.counts, { triage: 12, tasks: 12, objectives: 6, feedback: 10, comments: 80,
    allSourceIssues: 660, allBoardCards: 648, projectSourceIssues: 124, projectBoardCards: 112 });
  assert.equal(fingerprint(state.originalIssues), old); assert.equal(state.project.feedback_review_enabled, true);
  assert.equal(result.preservation.beforeFingerprint, result.preservation.afterFingerprint);
  assert.ok(state.persisted.find((row) => row.settings?.phase === "disabling"));
  assert.ok(result.entities.objectives.every((row) => row.taskIds.length === 2));
  const count = state.mutations.length;
  const repeated = await state.run();
  assert.equal(repeated.lastRunMutations, 0);
  assert.equal(state.mutations.length, count, "A complete retry must make zero new mutations");
  const loaded = await loadSecondaryWorkload(state.api, state.fixture, state.journal);
  assert.equal(loaded.readiness.feedback.details.length, 10); assert.equal(loaded.readiness.objectives.details.length, 6);
  assert.ok(loaded.readiness.triage.details.every((row) => row.commentIds.length === 2 && row.bodyText.includes("Expected behavior")));
  const record = result.entities.objectives[0];
  state.comments.get(`/api/objectives/${record.id}/comments`)[0].body = "Edited existing discussion";
  await assert.rejects(loadSecondaryWorkload(state.api, state.fixture, result), /Changed retained fixture comment/);
});

test("recovers lost non-client-ID acknowledgements by exact marker instead of duplicating records", async () => {
  for (const kind of ["objectives", "feedback", "comments"]) {
    const state = fixtureApi({ loseOnce: (route) => route.endsWith(`/${kind}`) });
    await assert.rejects(state.run(), /Response lost/);
    const acceptedCount = kind === "objectives" ? state.objectives.length : kind === "feedback" ? state.feedback.length : [...state.comments.values()].flat().length;
    assert.ok(acceptedCount > 0);
    const result = await state.run(); assert.equal(result.status, "complete");
    assert.equal(state.objectives.length, 6); assert.equal(state.feedback.length, 10);
    assert.equal([...state.comments.values()].flat().length, 80);
  }
});

test("refuses blind replay of a missing ambiguous server-generated creation", async () => {
  const state = fixtureApi({ loseOnce: (route) => route.endsWith("/objectives"), invisibleOnce: true });
  await assert.rejects(state.run(), /Response lost/);
  const count = state.mutations.length;
  await assert.rejects(state.run(), /Unresolved objective outcome/);
  assert.equal(state.objectives.length, 0); assert.equal(state.mutations.length, count);
});

test("does not restore review or replay a missing ambiguous feedback insertion", async () => {
  const state = fixtureApi({ loseOnce: (route) => route.endsWith("/feedback"), invisibleOnce: true });
  await assert.rejects(state.run(), /Response lost/);
  assert.equal(state.project.feedback_review_enabled, false);
  assert.equal(state.journal.settings.phase, "recovery-required");
  const count = state.mutations.length;
  await assert.rejects(state.run(), /Unresolved feedback outcome/);
  assert.equal(state.mutations.length, count);
});

test("rechecks the authenticated identity immediately before mutation", async () => {
  const state = fixtureApi();
  let checks = 0;
  await assert.rejects(enrichSecondaryWorkload({ api: state.api, fixture: state.fixture, apply: true, cohort: "legacy",
    getIdentity: async () => ++checks === 1 ? state.user : { ...state.user, id: "primary-user" },
    wait: async () => {}, persist: async () => {} }), /Wrong authenticated fixture ID/);
  assert.equal(state.mutations.length, 0);
});

test("keeps review disabled with recovery evidence until every new post has both completed markers", async () => {
  const state = fixtureApi({ reviewCompletes: false });
  await assert.rejects(state.run(), /completion markers unresolved/);
  assert.equal(state.project.feedback_review_enabled, false);
  assert.equal(state.journal.settings.phase, "recovery-required"); assert.equal(state.journal.status, "incomplete");
  state.feedback.forEach((row) => { row.analyzed_at = "completed"; row.classified_at = "completed"; });
  const result = await state.run(); assert.equal(result.status, "complete");
  assert.equal(state.project.feedback_review_enabled, true); assert.equal(state.feedback.length, 10);
});

test("does not disable review around unrelated unreviewed feedback", async () => {
  const state = fixtureApi(); state.feedback.push({ id: "existing-feedback", body: "Existing request", analyzed_at: null, classified_at: null });
  await assert.rejects(state.run(), /pre-existing unreviewed feedback/);
  assert.equal(state.mutations.length, 0);
});

async function scalingFixture() {
  const state = fixtureApi();
  state.legacyJournal = structuredClone(await state.run());
  state.cohort = "scaled"; state.journal = undefined;
  return state;
}
test("extends definitions while preserving every original small-cohort payload and planned-goal status", () => {
  const categories = ["a", "b", "c"];
  const legacy = secondaryDefinitions("fixture-user", categories, { cohort: "legacy" });
  const scaled = secondaryDefinitions("fixture-user", categories);
  for (const group of Object.keys(legacy)) for (const old of legacy[group]) assert.deepEqual(scaled[group].find((entry) => entry.key === old.key), old);
  assert.equal(scaled.triage.length, 120); assert.equal(scaled.feedback.length, 120);
  assert.equal(scaled.objectives.length, 30); assert.equal(scaled.tasks.length, 450);
  for (const objective of scaled.objectives) {
    const tasks = scaled.tasks.filter((task) => task.objectiveKey === objective.key);
    assert.equal(tasks.length, 15); assert.ok(tasks.some((task) => ["backlog", "todo"].includes(task.payload.status)));
    if (objective.payload.status === "planned") assert.ok(tasks.every((task) => ["backlog", "todo"].includes(task.payload.status)));
  }
  assert.equal(new Set([...scaled.triage, ...scaled.tasks].map((entry) => entry.payload.id)).size, 570);
  assert.ok([...scaled.triage, ...scaled.tasks].every((entry) => !secondaryOriginalIssueIds.includes(entry.payload.id)));
});
test("scales with a durable migration backup, exact source counts and unchanged old entities, then makes zero repeat mutations", async () => {
  const state = await scalingFixture(), firstMutations = state.mutations.length;
  const oldIssues = structuredClone([...state.originalIssues, ...state.issues]);
  const oldGoals = structuredClone(state.objectives), oldFeedback = structuredClone(state.feedback);
  const oldComments = structuredClone([...state.comments]);
  const preflight = await state.run(false);
  assert.equal(state.mutations.length, firstMutations); assert.equal(state.backup, undefined);
  assert.deepEqual(preflight.counts, { triage: 120, tasks: 450, feedback: 120, objectives: 30, comments: 1440 });
  assert.deepEqual(preflight.additions, { triage: 108, tasks: 438, feedback: 110, objectives: 24, comments: 1360 });
  const result = await state.run();
  assert.equal(result.marker, SCALED_SECONDARY_MARKER); assert.equal(result.sourceComplete, true);
  assert.deepEqual(result.counts, { triage: 120, tasks: 450, objectives: 30, feedback: 120, comments: 1440,
    allSourceIssues: 1206, allBoardCards: 1086, projectSourceIssues: 670, projectBoardCards: 550 });
  assert.equal(fingerprint(state.backup), fingerprint(state.legacyJournal));
  assert.ok(result.entities.objectives.every((entry) => entry.taskIds.length === 15));
  for (const issue of oldIssues) assert.deepEqual([...state.originalIssues, ...state.issues].find((entry) => entry.id === issue.id), issue);
  for (const goal of oldGoals) assert.deepEqual(state.objectives.find((entry) => entry.id === goal.id), goal);
  for (const feedback of oldFeedback) assert.deepEqual(state.feedback.find((entry) => entry.id === feedback.id), feedback);
  for (const [route, comments] of oldComments) assert.deepEqual(state.comments.get(route), comments);
  assert.equal(result.preservation.oldIssueCount, 660); assert.equal(result.preservation.beforeFingerprint, result.preservation.afterFingerprint);
  const count = state.mutations.length;
  assert.equal((await state.run()).lastRunMutations, 0); assert.equal(state.mutations.length, count);
});
test("retains real global truncation as incomplete source and recovers without shrinking or recreating the scaled fixture", async () => {
  const state = await scalingFixture(); state.globalCap = 1000;
  await assert.rejects(state.run(), /expected global 1206/);
  assert.equal(state.journal.status, "incomplete-source"); assert.equal(state.journal.counts.allSourceIssues, 1000);
  assert.equal(state.journal.counts.projectSourceIssues, 670); assert.equal(state.journal.counts.comments, 1440);
  assert.equal(state.project.feedback_review_enabled, true); assert.equal(state.journal.preservation.beforeFingerprint, state.journal.preservation.afterFingerprint);
  const count = state.mutations.length;
  state.globalCap = Infinity;
  const recovered = await state.run(); assert.equal(recovered.status, "complete"); assert.equal(recovered.lastRunMutations, 0);
  assert.equal(state.mutations.length, count); assert.equal(recovered.counts.allSourceIssues, 1206);
});
