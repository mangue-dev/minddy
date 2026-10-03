// Recover incidental navigation tabs by persisted identity and captured request
// windows. Preserve every tab present in the previous cumulative audit.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServerClient } from '@supabase/ssr';
import { loadEnv, requireEnv } from '../../captures/lib/env.mjs';
import { EMAIL, MARKER } from './seed.mjs';
loadEnv();
const output = 'output/playwright/performance';
const fixture = JSON.parse(await readFile(`${output}/workload.json`, 'utf8'));
const prior = JSON.parse(await readFile('docs/audits/desktop-perf-min-614-pass-3c-results.json', 'utf8')).supplemental[35].restoration.preservedTabs;
assert.equal(prior.length, 65);
const labels = ['pass3d-explore-before', 'pass3d-native-regressions'];
const windows = [];
for (const label of labels) {
  const run = JSON.parse(await readFile(`${output}/${label}.json`, 'utf8'));
  const requests = run.requests.filter((r) => r.path === '/api/me/app-tabs' && r.method === 'POST' && r.status === 200);
  assert.equal(requests.length, 1);
  windows.push({ label, started: requests[0].at, finished: requests[0].at + requests[0].duration });
}
const cookies = [];
const auth = createServerClient(requireEnv('MINDDY_PUBLIC_SUPABASE_URL'), requireEnv('MINDDY_PUBLIC_SUPABASE_ANON_KEY'), {
  cookies: { getAll: () => [], setAll: (rows) => cookies.push(...rows) },
});
const signed = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv('CAPTURES_DEMO_PASSWORD') });
assert.equal(signed.error, null);
assert.equal(signed.data.user.id, fixture.userId);
assert.equal(signed.data.user.user_metadata.performance_fixture, MARKER);
const proof = { verified: false, windows, originalIds: prior.map((r) => r.id), owned: [], operations: [] };
const save = () => writeFile(`${output}/pass3d-navigation-tab-recovery.json`, JSON.stringify(proof, null, 2));
await save();
async function api(route, method = 'GET', body) {
  proof.operations.push({ route, method, at: Date.now() }); await save();
  const response = await fetch(`http://localhost:3111${route}`, { method, headers: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  proof.operations.at(-1).status = response.status; await save();
  assert.ok(response.ok, `${method} ${route}: ${response.status}`); return response.json();
}
try {
  const rows = await api('/api/me/app-tabs');
  const newRows = rows.filter((row) => !proof.originalIds.includes(row.id));
  assert.equal(newRows.length, 2);
  for (const row of newRows) {
    assert.equal(row.user_id, fixture.userId);
    assert.equal(row.href, '/pull-requests?pr=1cc65567-f510-4795-a9b8-275c9cc9eca6');
    assert.equal(row.custom_name, null); assert.equal(row.pinned, false);
    const created = Date.parse(row.created_at);
    const window = windows.find((w) => created >= w.started && created <= w.finished);
    assert.ok(window, 'An unrecognized new tab must not be removed');
    proof.owned.push({ ...row, capturedRequest: window });
  }
  await save();
  for (const row of proof.owned) await api(`/api/me/app-tabs/${row.id}`, 'DELETE', { revision: row.revision });
  const after = await api('/api/me/app-tabs');
  assert.deepEqual(after.map((row) => row.id).sort(), proof.originalIds.slice().sort());
  proof.verified = true;
  console.log('Exactly two measured navigation tabs removed; all 65 prior account tabs preserved.');
} catch (error) { proof.error = error.message.split('\n')[0]; process.exitCode = 1; console.error(proof.error); }
finally { await save(); }
