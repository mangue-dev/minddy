import assert from "node:assert/strict";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EMAIL, MARKER } from "./seed.mjs";
import { assertStableTabs, stableManifestPath } from "./stable-restored-tabs.mjs";
import { assertSecondaryIdentity, assertSecondaryProject, fingerprint, secondaryManifestPath,
  SCALED_SECONDARY_MARKER, secondaryFixtureProjectIds, secondaryOriginalIssueIds } from "./enrich-secondary-workload.mjs";

export const ROUTINES_MARKER = "min683-routines-v1";
export const routinesManifestPath = path.resolve("output/playwright/performance/min683-routines-workload.json");
export const ROUTINE_PROMPT = `Review restored workspace readiness for the MIN-683 performance fixture.

<!-- ${ROUTINES_MARKER} -->

Inspect the complete triage, feedback and objective collections. Compare selected destinations with their authorized source data, identify visible loading, and record the current document versions. Preserve keyboard focus, scroll position, selection and unsaved drafts while checking navigation and synchronization. This synthetic routine stays paused for performance validation. Do not enable it, launch workers, modify project settings or run this instruction during fixture preparation.`;

export function routineDefinition(projectId) {
  assert.equal(projectId, secondaryFixtureProjectIds[0]);
  return { projectId, prompt: ROUTINE_PROMPT, promptMentions: [], enabled: false,
    trigger: { type: "schedule" }, frequency: "weekly", hour: 9, minute: 15,
    weekdays: [1], daysOfMonth: [], timezone: "Europe/Paris", maxSpendPercent: 1 };
}

function inertRoutine(row, fixture) {
  return row.project_id === fixture.projects[0] && row.owner_id === fixture.userId && row.enabled === false &&
    row.next_run_at === null && typeof row.title === "string" && row.title.trim().length > 0 &&
    typeof row.prompt === "string" && row.prompt.length >= 100 && row.timezone &&
    (row.trigger?.type ?? row.trigger_type ?? "schedule") === "schedule";
}

export function selectRoutine(rows, fixture, journal) {
  assert.ok(Array.isArray(rows));
  const marked = rows.filter(row => row.prompt?.includes(`<!-- ${ROUTINES_MARKER} -->`));
  assert.ok(marked.length <= 1, "Refuse duplicate marked routines");
  let selected;
  if (journal?.routineId) {
    selected = rows.find(row => row.id === journal.routineId);
    assert.ok(selected, "A previously accepted routine is missing; do not recreate it");
  } else if (marked.length) selected = marked[0];
  else if (["started", "ambiguous"].includes(journal?.operation?.phase)) {
    throw new Error("Unresolved routine creation; reconcile the journal before retrying");
  } else selected = rows.filter(row => inertRoutine(row, fixture)).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (selected) {
    assert.ok(inertRoutine(selected, fixture), "The representative routine must remain paused and fixture-owned");
    if (selected.prompt.includes(`<!-- ${ROUTINES_MARKER} -->`)) assertMarkedRoutine(selected, fixture);
    if (journal?.rowFingerprint) assert.equal(fingerprint(selected), journal.rowFingerprint, "The retained routine changed");
  }
  return selected;
}

function assertMarkedRoutine(row, fixture) {
  const wanted = routineDefinition(fixture.projects[0]);
  assert.equal(row.owner_id, fixture.userId); assert.equal(row.project_id, wanted.projectId);
  assert.equal(row.prompt, wanted.prompt); assert.equal(row.enabled, false); assert.equal(row.next_run_at, null);
  assert.equal(row.trigger?.type ?? row.trigger_type, "schedule");
  for (const [field, value] of Object.entries({ frequency: wanted.frequency, hour: wanted.hour, minute: wanted.minute,
    weekdays: wanted.weekdays, days_of_month: wanted.daysOfMonth, timezone: wanted.timezone,
    max_spend_percent: wanted.maxSpendPercent, prompt_mentions: [] })) assert.deepEqual(row[field], value);
  assert.equal(row.last_run_at ?? null, null); assert.equal(row.last_error ?? null, null);
}

async function assertOwner(api, fixture, getIdentity) {
  assertSecondaryIdentity(fixture, await getIdentity());
  const project = await api(`/api/projects/${fixture.projects[0]}`);
  assertSecondaryProject(project, fixture);
  const members = await api(`/api/projects/${fixture.projects[0]}/members`);
  assert.equal(members.isOwner, true);
  assert.deepEqual(members.members.map(row => row.user_id).sort(), [fixture.userId]);
  assert.equal(members.invitations.length, 0);
}

const rowsHash = rows => fingerprint([...rows].sort((a, b) => a.id.localeCompare(b.id)));
async function capturePreserved(api, fixture, stable, secondary) {
  const tabs = await assertStableTabs(api, fixture, stable.specs);
  const projects = [], sources = [];
  for (const projectId of fixture.projects) {
    const route = `/api/projects/${projectId}`;
    const project = await api(route);
    assert.equal(project.owner_id, fixture.userId);
    assert.notEqual(project.automations_enabled, true);
    // The public project DTO normally omits archived rules. This rejects an
    // exposed unexpected rule set; it does not certify hidden archive absence.
    assert.ok(!project.automations || Array.isArray(project.automations) && project.automations.length === 0,
      "Refuse exposed archived automation rules");
    const issues = await api(`${route}/issues`);
    const objectives = await api(`${route}/objectives`);
    const { posts } = await api(`${route}/feedback`);
    const pages = await api(`${route}/pages`);
    assert.ok(Array.isArray(issues) && Array.isArray(objectives) && Array.isArray(posts) && Array.isArray(pages));
    sources.push(...issues);
    if (projectId === fixture.projects[0]) {
      assert.equal(objectives.length, 30); assert.equal(posts.length, 120);
      assert.equal(issues.filter(row => row.status === "triage").length, 120);
      for (const [group, rows] of [["triage", issues], ["tasks", issues], ["feedback", posts], ["objectives", objectives]]) {
        const expected = secondary.entities[group];
        assert.equal(expected.length, { triage: 120, tasks: 450, feedback: 120, objectives: 30 }[group]);
        for (const record of expected) assert.ok(rows.some(row => row.id === record.id), `Missing preserved ${group} record`);
      }
      for (const objective of secondary.entities.objectives) {
        assert.equal(objective.taskIds.length, 15);
        assert.equal(issues.filter(row => row.objective_id === objective.id).length, 15);
      }
      assert.equal(issues.length, secondary.counts.projectSourceIssues);
    }
    const versions = pages.map(row => {
      assert.equal(row.project_id, projectId); assert.ok(Number.isSafeInteger(row.version));
      return { id: row.id, version: row.version };
    }).sort((a, b) => a.id.localeCompare(b.id));
    projects.push({ projectId, project: fingerprint(project), issues: rowsHash(issues), objectives: rowsHash(objectives),
      feedback: rowsHash(posts), categories: rowsHash(await api(`${route}/categories`)), pages: rowsHash(pages), versions,
      git: fingerprint((await api(`${route}/git-link`)).link) });
  }
  const linkedId = stable.forge.project;
  assert.equal(new Set(sources.map(row => row.id)).size, sources.length);
  for (const originalId of secondaryOriginalIssueIds) assert.ok(sources.some(row => row.id === originalId), "Preserve every original fixture issue");
  const linkedIssues = await api(`/api/projects/${linkedId}/issues`);
  assert.equal(sources.length + linkedIssues.length, secondary.counts.allSourceIssues);
  const documents = [];
  for (const spec of stable.specs.filter(row => row.kind === "page")) {
    const document = await api(`/api/projects/${spec.projectId}/pages/${spec.pageId}`);
    assert.equal(document.project_id, spec.projectId); assert.equal(document.id, spec.pageId);
    assert.ok(Number.isSafeInteger(document.version));
    documents.push({ id: document.id, version: document.version, fingerprint: fingerprint(document) });
  }
  return { tabs: rowsHash(tabs), projects, documents, linkedIssues: rowsHash(linkedIssues),
    linkedGit: fingerprint((await api(`/api/projects/${linkedId}/git-link`)).link) };
}

async function routineReads(api, row, fixture) {
  const detail = await api(`/api/routines/${row.id}`);
  assert.equal(detail.isOwner, true); assert.equal(detail.routine.owner_id, fixture.userId);
  assert.equal(fingerprint(detail.routine), fingerprint(row), "List and detail must identify the same complete routine");
  const { runs } = await api(`/api/routines/${row.id}/runs`);
  assert.ok(Array.isArray(runs));
  assert.ok(runs.every(run => run.project_id === row.project_id && !["running", "queued"].includes(run.status)),
    "Do not adopt a routine with active executions");
  return { id: row.id, rowFingerprint: fingerprint(row), detailFingerprint: fingerprint(detail),
    runsFingerprint: fingerprint(runs), runCount: runs.length, runIds: runs.map(run => run.id),
    title: row.title, promptFingerprint: fingerprint(row.prompt), timezone: row.timezone,
    schedule: { frequency: row.frequency, hour: row.hour, minute: row.minute,
      weekdays: row.weekdays, daysOfMonth: row.days_of_month }, enabled: false };
}

/** One optional ordinary POST; no PATCH, DELETE, run-now, reseed or version reset. */
export async function enrichRoutinesWorkload({ api, fixture, stable, secondary, getIdentity, apply = false,
  journal, persist = async () => {} }) {
  assert.equal(stable.userId, fixture.userId); assert.equal(stable.email, EMAIL); assert.equal(stable.marker, MARKER);
  assert.equal(secondary.marker, SCALED_SECONDARY_MARKER); assert.equal(secondary.status, "complete");
  assert.equal(secondary.userId, fixture.userId); assert.equal(secondary.email, EMAIL);
  assert.equal(secondary.projectId, fixture.projects[0]);
  assert.equal(secondary.counts.projectSourceIssues, 670); assert.equal(secondary.counts.allSourceIssues, 1206);
  if (journal) {
    assert.equal(journal.marker, ROUTINES_MARKER); assert.equal(journal.userId, fixture.userId);
    assert.equal(journal.projectId, fixture.projects[0]); assert.equal(journal.email, EMAIL);
    assert.equal(journal.inputFingerprint, fingerprint(routineDefinition(fixture.projects[0])));
  }
  await assertOwner(api, fixture, getIdentity);
  const before = await capturePreserved(api, fixture, stable, secondary);
  const { routines: initialRows } = await api("/api/routines");
  assert.ok(initialRows.every(row => !fixture.projects.includes(row.project_id) || row.enabled === false),
    "The synthetic fixture must retain no enabled routine");
  let row = selectRoutine(initialRows, fixture, journal);
  if (!apply) return { status: "review", reused: Boolean(row), wouldCreate: !row,
    titleGenerationCalls: row ? 0 : 1, wouldRun: false, preservationFingerprint: fingerprint(before) };
  journal ??= { marker: ROUTINES_MARKER, email: EMAIL, userId: fixture.userId, projectId: fixture.projects[0],
    inputFingerprint: fingerprint(routineDefinition(fixture.projects[0])), createdAt: new Date().toISOString() };
  if (journal.preservationBefore) assert.deepEqual(before, journal.preservationBefore, "Retained data changed since routine admission");
  else journal.preservationBefore = before;
  journal.status = "incomplete";
  await persist(journal);
  const initialRoutineHashes = initialRows.filter(saved => saved.id !== row?.id)
    .map(saved => ({ id: saved.id, fingerprint: fingerprint(saved) })).sort((a, b) => a.id.localeCompare(b.id));
  const initialHistories = [];
  for (const existing of initialRows) initialHistories.push({ id: existing.id,
    fingerprint: fingerprint(await api(`/api/routines/${existing.id}/runs`)) });
  let mutations = 0;
  if (!row) {
    await assertOwner(api, fixture, getIdentity);
    assert.deepEqual(await capturePreserved(api, fixture, stable, secondary), before, "Recheck preservation before the only mutation");
    assert.deepEqual((await api("/api/routines")).routines, initialRows, "Routine list changed before admission");
    journal.operation = { phase: "started", method: "POST", route: "/api/routines", startedAt: new Date().toISOString(),
      inputFingerprint: journal.inputFingerprint, titleGenerationCalls: 1 };
    await persist(journal);
    try {
      const created = await api("/api/routines", "POST", routineDefinition(fixture.projects[0]));
      row = created.routine; assertMarkedRoutine(row, fixture); assert.ok(inertRoutine(row, fixture)); mutations = 1;
      journal.routineId = row.id; journal.operation.phase = "accepted"; journal.operation.id = row.id;
      await persist(journal);
    } catch (error) {
      journal.operation.phase = "ambiguous"; journal.operation.status = error.status ?? null;
      journal.operation.retryAfter = error.retryAfter ?? null; await persist(journal); throw error;
    }
  }
  const { routines: afterRows } = await api("/api/routines");
  assert.equal(afterRows.length, initialRows.length + mutations);
  const fresh = afterRows.find(saved => saved.id === row.id);
  assert.ok(fresh); assert.equal(fingerprint(fresh), fingerprint(row));
  assert.deepEqual(afterRows.filter(saved => saved.id !== row.id).map(saved => ({ id: saved.id,
    fingerprint: fingerprint(saved) })).sort((a, b) => a.id.localeCompare(b.id)), initialRoutineHashes);
  const reads = await routineReads(api, fresh, fixture);
  if (journal.runsFingerprint) assert.equal(reads.runsFingerprint, journal.runsFingerprint, "Retained routine executions changed");
  if (journal.detailFingerprint) assert.equal(reads.detailFingerprint, journal.detailFingerprint, "Retained routine detail changed");
  if (mutations) assert.equal(reads.runCount, 0, "The added routine must have no execution");
  for (const history of initialHistories) assert.equal(fingerprint(await api(`/api/routines/${history.id}/runs`)), history.fingerprint);
  const after = await capturePreserved(api, fixture, stable, secondary);
  assert.deepEqual(after, before, "Preserve all current collections, Page versions, documents, tabs, settings and Git links");
  Object.assign(journal, reads, { routineId: fresh.id, status: "complete", reused: mutations === 0,
    lastRunMutations: mutations, preservationAfterFingerprint: fingerprint(after),
    initialRoutineHistories: initialHistories, completedAt: new Date().toISOString() });
  await persist(journal);
  return journal;
}

async function main() {
  const { loadEnv, requireEnv } = await import("../../captures/lib/env.mjs");
  const { createServerClient } = await import("@supabase/ssr");
  const { request } = await import("playwright");
  loadEnv();
  const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname)); assert.equal(new URL(base).origin, base);
  const fixture = JSON.parse(await readFile(path.resolve("output/playwright/performance/workload.json"), "utf8"));
  const stable = JSON.parse(await readFile(stableManifestPath, "utf8"));
  const secondary = JSON.parse(await readFile(secondaryManifestPath, "utf8"));
  const cookies = [];
  const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: { getAll: () => cookies, setAll: values => { for (const value of values) {
      const index = cookies.findIndex(saved => saved.name === value.name);
      if (index < 0) cookies.push(value); else cookies[index] = value;
    } } },
  });
  const signedIn = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
  if (signedIn.error) throw new Error(`Fixture sign-in failed: ${signedIn.error.code}`);
  assertSecondaryIdentity(fixture, signedIn.data.user);
  const client = await request.newContext({ baseURL: base, extraHTTPHeaders: {
    Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
  } });
  const api = async (route, method = "GET", data) => {
    assert.ok(route.startsWith("/api/") && !route.includes(".."));
    assert.ok(method === "GET" || method === "POST" && route === "/api/routines", "Only one paused routine creation is permitted");
    const response = await client.fetch(route, { method, ...(data === undefined ? {} : { data }) });
    if (!response.ok()) {
      const error = new Error(`${method} ${route}: ${response.status()}; stop and respect Retry-After before retrying`);
      error.status = response.status(); error.retryAfter = response.headers()["retry-after"] ?? null; throw error;
    }
    return response.json();
  };
  const apply = process.argv.includes("--apply"), lockPath = `${routinesManifestPath}.lock`;
  let lock;
  try {
    let journal;
    try { journal = JSON.parse(await readFile(routinesManifestPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (apply) {
      await mkdir(path.dirname(routinesManifestPath), { recursive: true });
      lock = await open(lockPath, "wx"); await lock.writeFile(String(process.pid));
    }
    const result = await enrichRoutinesWorkload({ api, fixture, stable, secondary, apply, journal,
      getIdentity: async () => { const { data, error } = await auth.auth.getUser();
        if (error) throw new Error(`Fixture identity check failed: ${error.code}`); return data.user; },
      persist: async value => { const temporary = `${routinesManifestPath}.tmp`;
        await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, routinesManifestPath); },
    });
    console.log(JSON.stringify({ status: result.status, routineId: result.routineId, reused: result.reused,
      wouldCreate: result.wouldCreate, titleGenerationCalls: result.titleGenerationCalls,
      mutations: result.lastRunMutations ?? 0, runCount: result.runCount, enabled: result.enabled,
      rowFingerprint: result.rowFingerprint, runsFingerprint: result.runsFingerprint,
      manifestPath: apply ? routinesManifestPath : undefined }));
  } finally {
    await client.dispose();
    if (lock) { await lock.close(); await unlink(lockPath); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
