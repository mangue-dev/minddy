// Summarize fixed paired cohorts without changing or discarding raw attempts.
import { readFile, readdir, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
const input = path.resolve('output/playwright/performance');
const output = path.resolve('docs/audits/desktop-perf-min-614-pass-3d-evidence');
await mkdir(output, { recursive: true });
const read = async (label, suffix = '') => JSON.parse(await readFile(`${input}/${label}${suffix}.json`, 'utf8'));
const stats = (values) => {
  const samples = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = samples.length;
  return n ? { n, min: samples[0], median: (samples[Math.floor((n - 1) / 2)] + samples[Math.ceil((n - 1) / 2)]) / 2, p95: samples[Math.ceil(n * .95) - 1], max: samples[n - 1] } : { n: 0 };
};
const prefixes = ['cold-board', 'cold-exact-board', 'hot-page-global', 'hot-late-project', 'hot-project-global', 'hidden-exact-700', 'hidden-exact-0'];
async function cohort(labels, upstreamName) {
  const upstream = (await readFile(`${input}/${upstreamName}`, 'utf8')).trim().split('\n').map(JSON.parse);
  const samples = []; const heaps = []; const launches = [];
  for (const label of labels) {
    const run = await read(label), checks = await read(label, '-checks');
    samples.push(...run.measurements);
    heaps.push(...checks.samples.map((sample) => sample.heap.used));
    const first = Math.min(...run.requests.map((r) => r.at));
    const last = Math.max(...run.requests.map((r) => r.at + (r.duration ?? 0)));
    const range = upstream.filter((r) => r.at >= first && r.at <= last);
    const upstreamOperations = {};
    for (const r of range) (upstreamOperations[r.operation] ??= []).push(r.headersMs);
    const counts = run.requests.reduce((counts, r) => { const key = `${r.method} ${r.path}`; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {});
    let overlapPairs = 0, maxInflight = 0;
    const events = [];
    for (let i = 0; i < run.requests.length; i++) {
      const r = run.requests[i]; if (!Number.isFinite(r.duration)) continue;
      events.push([r.at, 1], [r.at + r.duration, -1]);
      if (r.method !== 'GET' || r.path.includes('readiness')) continue;
      for (const other of run.requests.slice(i + 1)) {
        if (other.method === 'GET' && other.path === r.path && other.variant === r.variant && other.version === r.version && other.at >= r.at && other.at < r.at + r.duration) overlapPairs++;
      }
    }
    let inflight = 0;
    for (const [, delta] of events.sort((a, b) => a[0] - b[0] || a[1] - b[1])) { inflight += delta; maxInflight = Math.max(maxInflight, inflight); }
    const warm = run.measurements.filter((r) => r.name.startsWith('hot-'));
    const warmStart = Math.min(...warm.map((r) => r.startedAt));
    const warmEnd = Math.max(...warm.map((r) => r.readyAt + (r.inputMs ?? 0) + 350));
    const idle = checks.idle.map((r) => ({ durationMs: r.durationMs, scriptMs: (r.after.ScriptDuration - r.before.ScriptDuration) * 1000,
      requests: run.requests.filter((q) => q.at >= r.startedAt && q.at < r.startedAt + r.durationMs),
      upstream: upstream.filter((q) => q.at >= r.startedAt && q.at < r.startedAt + r.durationMs),
    }));
    launches.push({ label, buildSha: run.buildSha, buildId: run.buildId, runtime: run.runtime, dirty: run.dirty, sourceHeadDuringRun: run.sha, errors: run.errors,
      cleanup: checks.cleanup, completedCycles: checks.samples.length, counts,
      snapshotOpens: run.requests.filter((r) => r.operation === 'open').length,
      snapshotSeals: run.requests.filter((r) => r.operation === 'seal').length,
      iconRequests: run.requests.filter((r) => r.path.endsWith('/icon/content')),
      hotIconRequests: run.requests.filter((r) => r.path.endsWith('/icon/content') && r.at >= warmStart && r.at <= warmEnd),
      downloadedResponseBytes: run.requests.reduce((n, r) => n + (r.bytes?.responseBodySize ?? 0), 0),
      requestCount: run.requests.length, completedRequestCount: run.requests.filter((r) => Number.isFinite(r.duration)).length,
      samePathOverlapPairsExcludingReadiness: overlapPairs, maxMeasuredInflightRequests: maxInflight,
      upstreamHeaders: Object.fromEntries(Object.entries(upstreamOperations).map(([key, values]) => [key, stats(values)])),
      retainedCardCounts: checks.samples.map((r) => r.retained.reduce((n, v) => n + v.cards, 0)),
      decodedImageFailures: checks.samples.flatMap((r) => r.decoded.filter((image) => !image.complete || !image.width)),
      eventsBefore: checks.eventsBefore, eventsAfter: checks.eventsAfter, idle,
    });
  }
  return { labels, launches, heapBytes: stats(heaps), paths: Object.fromEntries(prefixes.map((prefix) => {
    const selected = samples.filter((r) => r.name === prefix || r.name.startsWith(`${prefix}-`));
    return [prefix, Object.fromEntries(['readyMs', 'firstVisibleMs', 'inputMs', 'scriptMs', 'styleMs', 'layoutMs', 'longTaskMs', 'maxFrameMs'].map((key) => [key, stats(selected.map((r) => r[key]))]))];
  })) };
}
const baseline = await cohort([3, 4, 5].map((n) => `pass3d-baseline-${n}`), 'pass3d-upstream-before.jsonl');
const candidate = await cohort([3, 5, 6].map((n) => `pass3d-after-${n}`), 'pass3d-upstream-final.jsonl');
const candidateAllObserved = await cohort([3, 4, 5, 6].map((n) => `pass3d-after-${n}`), 'pass3d-upstream-final.jsonl');
const evidence = [];
for (const name of (await readdir(input)).filter((name) => name.startsWith('pass3d-')).sort()) {
  const bytes = await readFile(path.join(input, name));
  const destination = name.endsWith('.png') ? name : `${name}.gz`;
  const saved = name.endsWith('.png') ? bytes : gzipSync(bytes, { level: 9 });
  await writeFile(path.join(output, destination), saved);
  evidence.push({ file: `desktop-perf-min-614-pass-3d-evidence/${destination}`, originalBytes: bytes.length, storedBytes: saved.length,
    sha256: createHash('sha256').update(saved).digest('hex'), originalSha256: createHash('sha256').update(bytes).digest('hex') });
}
await copyFile(path.join(input, 'workload.json'), path.join(output, 'workload.json'));
const fixture = await readFile(path.join(output, 'workload.json'));
evidence.push({ file: 'desktop-perf-min-614-pass-3d-evidence/workload.json', sha256: createHash('sha256').update(fixture).digest('hex') });
const result = { kind: 'MIN-614 phase 3d native production comparison', baseline, candidate, candidateAllObserved,
  contracts: { quantiles: 'Median midpoint and nearest-rank p95. Three completed fresh launches, ten repetitions per path. The failed fourth candidate and all calibration/diagnostic attempts are preserved separately and included in all-observed summaries.',
    hotClock: 'Existing driver matching membership/selected tab/URL/non-inert board plus two frames. inputMs is a separate Filters interaction. Script/style/layout counters include input and the historical 350 ms tail.',
    freshness: 'Ordinary unchanged-workload membership is distinct from hidden-exact title checks. Exact authority for every object/version is not inferred from a card count. Known invalidation, fetching, pause, absence or error is explicit in the UI.',
    requests: 'Page-origin requests only; API setup/cleanup are in journals/upstream records. Byte sums include HTTP response bodies and snapshots. Overlaps compare method/path/recorded variant/version, excluding readiness query batches; unrecorded URL parameters prevent claiming exact duplicate identities.',
    upstream: 'Actual upstream headers-completion operations within first/last page request timestamps; preparation and cleanup are not perfectly coextensive. Registry calls are actual envelope_data_keys HTTP requests, not cache hits or AES timing.',
    crypto: 'Successful local snapshot open requests map to one store.decrypt invocation in openLocalSnapshot; no AES duration or all repository decrypt-count comparison is inferred from this count.',
    cacheRestart: 'Supplemental renderer reload scenarios, not paired timings; reset CDP counters remain null. Process launch and fixture authentication are excluded from historical cold board clocks.',
  }, evidence };
await writeFile('docs/audits/desktop-perf-min-614-pass-3d-results.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ evidenceFiles: evidence.length, manifestBytes: Buffer.byteLength(JSON.stringify(result)), evidenceStoredBytes: evidence.reduce((n, e) => n + (e.storedBytes ?? 0), 0) }));
