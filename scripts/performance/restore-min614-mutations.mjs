import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServerClient } from '@supabase/ssr';
import { loadEnv, requireEnv } from '../../captures/lib/env.mjs';
import { EMAIL, MARKER, id } from './seed.mjs';

// Explicit scoped recovery. Inspect persistence first; never replay timed writes.
loadEnv();
const label = process.argv[2]; assert.match(label, /^pass3[bc]-[\w-]+$/);
const path = `output/playwright/performance/${label}-checks.json`;
const state = JSON.parse(await readFile(path, 'utf8'));
const fixture = JSON.parse(await readFile('output/playwright/performance/workload.json', 'utf8'));
assert.equal(fixture.marker, MARKER); assert.equal(state.fixture.issue, id('issue-0-2'));
const base = process.env.MINDDY_PERF_BASE_URL ?? 'http://localhost:3111';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const cookies = [];
const auth = createServerClient(requireEnv('MINDDY_PUBLIC_SUPABASE_URL'), requireEnv('MINDDY_PUBLIC_SUPABASE_ANON_KEY'), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
const signed = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv('CAPTURES_DEMO_PASSWORD') });
assert.equal(signed.error, null); assert.equal(signed.data.user.id, fixture.userId);
assert.equal(signed.data.user.user_metadata.performance_fixture, MARKER);
const save = () => writeFile(path, JSON.stringify(state, null, 2));
state.manualRestoration = { at: new Date().toISOString(), actions: [], verified: false }; await save();
const api = async (route, method = 'GET', body) => {
  if (method !== 'GET') { state.manualRestoration.actions.push({ route, method, at: Date.now() }); await save(); }
  const response = await fetch(`${base}${route}`, { method, headers: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (method === 'DELETE' && response.status === 404) return null;
  assert.ok(response.ok, `${method} ${route}: ${response.status}`); return response.status === 204 ? null : response.json();
};
const issue = state.fixture.issue;
assert.equal((await api(`/api/issues/${issue}`)).project_id, fixture.projects[0]);
if (state.relationScope) {
  const scope = state.relationScope;
  const matches = (relation) => relation.type === 'related' && (
    (relation.source_id === scope.source && relation.target_id === scope.target) ||
    (relation.source_id === scope.target && relation.target_id === scope.source));
  for (const relation of (await api(scope.path)).filter((relation) => !scope.originalIds.includes(relation.id) && matches(relation))) await api(`/api/issue-relations/${relation.id}`, 'DELETE');
  assert.deepEqual((await api(scope.path)).map((relation) => relation.id).sort(), scope.originalIds.slice().sort());
}
if (state.resourceScope) {
  const scope = state.resourceScope, route = `/api/issues/${scope.issue}/resources`;
  for (const resource of (await api(route)).filter((resource) => !scope.originalIds.includes(resource.id) && resource.file_name === scope.marker)) await api(`/api/resources/${resource.id}`, 'DELETE');
  assert.deepEqual((await api(route)).map((resource) => resource.id).sort(), scope.originalIds.slice().sort());
}
if (state.childOriginal) {
  const child = state.childOriginal, route = `/api/issues/${child.id}`;
  if ((await api(route)).parent_id !== child.parent_id) await api(route, 'PATCH', { parent_id: child.parent_id });
  assert.equal((await api(route)).parent_id, child.parent_id);
}
for (const comment of (await api(`/api/issues/${issue}/comments`)).filter((comment) => state.ownedComments.includes(comment.id))) await api(`/api/comments/${comment.id}`, 'DELETE');
const before = await api(`/api/issues/${issue}`);
if (before.title !== state.fixture.title || before.effort !== state.fixture.effort) await api(`/api/issues/${issue}`, 'PATCH', { title: state.fixture.title, effort: state.fixture.effort });
const comments = await api(`/api/issues/${issue}/comments`), restored = await api(`/api/issues/${issue}`);
assert.deepEqual(comments.map(({ id, body }) => ({ id, body })), state.fixture.originalComments);
assert.equal(restored.title, state.fixture.title); assert.equal(restored.effort, state.fixture.effort);
state.fixture.eventsAfter = (await api(`/api/issues/${issue}/events`)).length;
state.manualRestoration.verified = true; state.cleanup = true; await save();
console.log(JSON.stringify({ restored: true, originalComments: comments.length, actions: state.manualRestoration.actions.length, priorScenarioError: state.journeyError, priorCleanupError: state.cleanupError }));
