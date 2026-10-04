import assert from 'node:assert/strict';
import { readFile, open, stat, writeFile } from 'node:fs/promises';
import { createServerClient } from '@supabase/ssr';
import { loadEnv, requireEnv } from '../../captures/lib/env.mjs';
import { EMAIL, MARKER, id } from './seed.mjs';

// Sequential server attribution, outside native measurements and heavy profiling.
loadEnv();
const base = process.env.MINDDY_PERF_BASE_URL ?? 'http://localhost:3111';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
assert.equal(new URL(base).origin, base);
const label = process.env.MINDDY_PERF_LABEL ?? 'pass3-chain-control-after';
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const log = requireEnv('MINDDY_PERF_SERVER_LOG');
const fixture = JSON.parse(await readFile('output/playwright/performance/workload.json', 'utf8'));
assert.equal(fixture.marker, MARKER);
assert.equal(fixture.firstIssue, id('issue-0-0'));
assert.deepEqual(fixture.projects, Array.from({ length: 6 }, (_, index) => id(`project-${index}`)));
const cookies = [];
const auth = createServerClient(requireEnv('MINDDY_PUBLIC_SUPABASE_URL'), requireEnv('MINDDY_PUBLIC_SUPABASE_ANON_KEY'), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
const signed = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv('CAPTURES_DEMO_PASSWORD') });
assert.equal(signed.error, null);
assert.equal(signed.data.user.id, fixture.userId);
assert.equal(signed.data.user.user_metadata.performance_fixture, MARKER);
const headers = { Cookie: `${cookies.map(({ name, value }) => `${name}=${value}`).join('; ')}; NEXT_LOCALE=en` };
const verified = await fetch(`${base}/api/issues/${fixture.firstIssue}`, { headers });
assert.equal(verified.status, 200);
assert.equal((await verified.json()).project_id, fixture.projects[0]);
const samples = [];
for (let run = -1; run < 30; run++) {
  // Alternate order to avoid always favoring the second request's warm state.
  for (const variant of run % 2 ? ['chain', 'full'] : ['full', 'chain']) {
    const offset = (await stat(log)).size;
    const started = performance.now();
    const sample = { run, warmup: run === -1, variant, at: Date.now() };
    try {
      const response = await fetch(`${base}/api/issues/${fixture.firstIssue}/automation${variant === 'chain' ? '?view=chain' : ''}`, { headers, signal: AbortSignal.timeout(15000) });
      sample.status = response.status;
      if (response.ok) {
        const body = await response.json();
        if (variant === 'chain') assert.deepEqual(Object.keys(body), ['chain']);
        else assert.ok('enabled' in body && 'plannedModes' in body && 'estimate' in body);
        sample.chainPresent = body.chain !== null;
      }
    } catch (error) { sample.error = error.name; }
    sample.elapsedMs = performance.now() - started;
    const bytes = (await stat(log)).size - offset;
    const file = await open(log, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      await file.read(buffer, 0, bytes, offset);
      sample.upstream = buffer.toString().trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    } finally { await file.close(); }
    samples.push(sample);
  }
}
await writeFile(`output/playwright/performance/${label}.json`, JSON.stringify({ label, kind: 'supplemental-server-attribution', timestamp: new Date().toISOString(), samples }, null, 2));
for (const variant of ['full', 'chain']) {
  const successful = samples.filter((sample) => !sample.warmup && sample.variant === variant && sample.status === 200 && !sample.error);
  console.log(JSON.stringify({ variant, successful: successful.length, failed: 30 - successful.length, elapsedMs: successful.map((sample) => sample.elapsedMs), calls: successful.map((sample) => sample.upstream.length) }));
}
