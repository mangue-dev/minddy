// Recover only identities captured by a failed hot-journey journal. Never replay
// measured writes; read persistence before every conditional cleanup operation.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { loadEnv, requireEnv } from '../../captures/lib/env.mjs';
import { EMAIL, MARKER, id } from './seed.mjs';
loadEnv();
const label = process.argv[2];
assert.match(label ?? '', /^pass3d-[a-zA-Z0-9_-]+$/);
const output = path.resolve('output/playwright/performance');
const journal = JSON.parse(await readFile(`${output}/${label}-checks.json`, 'utf8'));
const fixture = JSON.parse(await readFile(`${output}/workload.json`, 'utf8'));
assert.equal(fixture.marker, MARKER);
assert.equal(journal.iconProject, fixture.projects[0]);
assert.equal(fixture.projects[0], id('project-0'));
if (journal.originalIssue) assert.equal(journal.originalIssue.id, fixture.firstIssue);
const base = process.env.MINDDY_PERF_BASE_URL ?? 'http://localhost:3111';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const cookies = [];
const auth = createServerClient(requireEnv('MINDDY_PUBLIC_SUPABASE_URL'), requireEnv('MINDDY_PUBLIC_SUPABASE_ANON_KEY'), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
const login = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv('CAPTURES_DEMO_PASSWORD') });
assert.equal(login.error, null);
assert.equal(login.data.user.id, fixture.userId);
assert.equal(login.data.user.user_metadata.performance_fixture, MARKER);
const proof = { journal: `${label}-checks.json`, verified: false, operations: [], startedAt: new Date().toISOString() };
const proofPath = `${output}/${label}-restoration-${Date.now()}.json`;
const save = () => writeFile(proofPath, JSON.stringify(proof, null, 2));
await save();
async function api(route, method = 'GET', body) {
  proof.operations.push({ route, method, at: Date.now() }); await save();
  const response = await fetch(`${base}${route}`, { method, headers: {
    Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  proof.operations.at(-1).status = response.status; await save();
  assert.ok(response.ok, `${method} ${route}: ${response.status}`);
  return response.json();
}
try {
  if (journal.originalIssue) {
    const issue = await api(`/api/issues/${fixture.firstIssue}`);
    assert.equal(issue.project_id, fixture.projects[0]);
    assert.ok([journal.originalIssue.title, journal.changedTitle, ...(journal.acceptedTitles ?? [])].includes(issue.title));
    proof.issueBefore = { id: issue.id, title: issue.title }; await save();
    if (issue.title !== journal.originalIssue.title) await api(`/api/issues/${issue.id}`, 'PATCH', { title: journal.originalIssue.title });
    assert.equal((await api(`/api/issues/${issue.id}`)).title, journal.originalIssue.title);
  }
  for (const spec of journal.ownedTabs) {
    const row = (await api('/api/me/app-tabs')).find((row) => row.id === spec.id);
    if (!row) continue;
    assert.ok(row.custom_name === spec.custom_name || row.href === '/home');
    await api(`/api/me/app-tabs/${row.id}`, 'DELETE', { revision: row.revision });
  }
  const project = await api(`/api/projects/${journal.iconProject}`);
  assert.equal(project.owner_id, fixture.userId);
  assert.ok(!project.icon_url || project.icon_url === journal.iconUrl || journal.iconVersions?.includes(project.icon_url));
  proof.iconBefore = project.icon_url; await save();
  if (project.icon_url) await api(`/api/projects/${journal.iconProject}/icon`, 'DELETE');
  assert.equal((await api(`/api/projects/${journal.iconProject}`)).icon_url, journal.originalIcon);
  assert.ok(!(await api('/api/me/app-tabs')).some((row) => journal.ownedTabs.some((tab) => row.id === tab.id)));
  proof.verified = true;
  console.log('Captured issue title, imported icon and owned tabs are restored and verified.');
} catch (error) {
  proof.error = error.message.split('\n')[0];
  console.error(proof.error);
  process.exitCode = 1;
} finally { proof.finishedAt = new Date().toISOString(); await save(); }
