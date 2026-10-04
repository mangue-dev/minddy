import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = 'output/playwright/performance', assets = 'docs/audits/assets';
await mkdir(assets, { recursive: true });
const files = (await readdir(root)).filter((name) => name.startsWith('pass3f-') && /\.(json|jsonl|log|png)$/.test(name)).sort();
const read = async (name) => JSON.parse(await readFile(`${root}/${name}`, 'utf8'));
const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const scrub = (value) => JSON.parse(JSON.stringify(value).replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, (id) => `fixture-${hash(id).slice(0, 10)}`));
function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b), n = sorted.length;
  return n ? { n, median: n % 2 ? sorted[n >> 1] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2, p95: sorted[Math.ceil(n * .95) - 1], max: sorted.at(-1), min: sorted[0] } : { n: 0 };
}
function metrics(samples) {
  const clocks = Object.fromEntries(['accepted', 'destinationFrame', 'availableContent', 'usableExactScenario', 'secondaryReconciled'].map((key) => [key, stats(samples.map((s) => Number.isFinite(s.clocks.gesture) && Number.isFinite(s.clocks[key]) ? s.clocks[key] - s.clocks.gesture : null))]));
  return { n: samples.length, deadlineFailures: samples.filter((s) => s.deadlineError).length, clocks, missingGestures: samples.filter((s) => !Number.isFinite(s.clocks.gesture)).length, skeletonSamples: samples.filter((s) => s.skeletonFrames > 0).length,
    classification: Object.fromEntries(['hot-dom', 'data-available-unmounted', 'cold'].map((key) => [key, samples.filter((s) => s.classification === key).length])),
    old: Object.fromEntries(['readyMs', 'scriptMs', 'styleMs', 'layoutMs', 'longTasks', 'longTaskMs', 'maxFrameMs'].map((key) => [key, stats(samples.map((s) => s.old[key]))])), heap: stats(samples.map((s) => s.heap)) };
}
const all = [], originals = [], verification = [], cpuProfiles = [];
await mkdir(`${root}/pass3f-private-archives`, { recursive: true });
for (const name of files) {
  const raw = await readFile(`${root}/${name}`);
  const original = { file: name, bytes: raw.length, sha256: hash(raw), publication: 'original retained locally; private identifiers and bodies omitted from public copy' };
  if (/\.(log|jsonl)$/.test(name) || /-(cpu|trace)\.json$/.test(name)) {
    const zipped = gzipSync(raw, { level: 9 }); await writeFile(`${root}/pass3f-private-archives/${name}.gz`, zipped);
    original.localCompressedFile = `pass3f-private-archives/${name}.gz`; original.compressedBytes = zipped.length; original.compressedSha256 = hash(zipped);
  }
  originals.push(original);
  if (name.endsWith('-cpu.json')) {
    const r = JSON.parse(raw), gc = new Set(r.nodes.filter((node) => node.callFrame.functionName === '(garbage collector)').map((node) => node.id));
    cpuProfiles.push({ file: name, durationUs: r.endTime - r.startTime, samples: r.samples.length, sampledGcUs: r.samples.reduce((sum, id, i) => sum + (gc.has(id) ? r.timeDeltas[i] : 0), 0), scope: 'Supplemental instrumentation; sampled renderer GC, not total process GC time' });
  }
  if (/-navigation-(checks|state|preparation)\.json$/.test(name)) {
    const r = JSON.parse(raw);
    verification.push(scrub({ file: name, checks: r.checks?.map(({ before, after, returned, ...check }) => ({ ...check, ...(typeof before === 'string' ? { beforeSelectionLength: before.length } : {}), ...(typeof after === 'string' ? { afterSelectionLength: after.length } : {}), ...(returned ? { returned: { ...returned, value: undefined, valueLength: returned.value?.length } } : {}) })), cleanup: r.cleanup, error: r.error?.split('\n')[0], requests: r.requests, activationAt: r.activationAt, lossGate: r.lossGate ? { dropped: r.lossGate.dropped, missedTargetEvents: r.lossGate.missedTargetEvents } : undefined, issueCaptured: Boolean(r.issue) }));
  }
  if (!name.endsWith('-navigation.json')) continue;
  const r = JSON.parse(raw), label = name.replace(/-navigation.json$/, '');
  const master = files.includes(`${label}.json`) ? await read(`${label}.json`) : null;
  all.push(scrub({ label, definition: r.definition, samples: r.samples, workload: { triage: r.workload.triage, feedback: r.workload.feedback, forgeFiles: r.workload.forgeFiles }, cleanup: r.cleanup, error: r.error,
    idle: r.idle, deadlineFailures: r.deadlineFailures, failedSample: r.failedSample, buildSha: master?.buildSha, buildId: master?.buildId, checkoutSha: master?.sha, dirty: master?.dirty, runtime: master?.runtime, timestamp: master?.timestamp, errors: master?.errors,
    measurements: master?.measurements, requests: master?.requests, navigationTabs: master?.navigationTabs }));
}
function cohort(prefix) {
  const runs = [1, 2, 3].map((i) => all.find((r) => r.label === `${prefix}-${i}`));
  assert.ok(runs.every((r) => r?.cleanup && !r.error && r.samples.length === 131));
  assert.ok(runs.every((r) => !r.errors?.length));
  const baseline = all.find((r) => r.label === 'pass3f-matched-before-1');
  for (const r of runs) assert.deepEqual(r.workload, baseline.workload, 'Same populated workload');
  const samples = runs.flatMap((r) => r.samples), warm = samples.filter((s) => s.name.startsWith('navigation-') && !s.alreadyActive);
  const byIndex = (rows) => Object.fromEntries([...new Set(rows.map((s) => s.index))].sort((a, b) => a - b).map((index) => [index, metrics(rows.filter((s) => s.index === index))]));
  const requestCounts = Object.fromEntries([...new Set(runs.flatMap((r) => r.requests.map((request) => request.path)))].sort().map((path) => [path, runs.reduce((n, r) => n + r.requests.filter((req) => req.path === path).length, 0)]));
  return { labels: runs.map((r) => r.label), workload: runs[0].workload, builds: runs.map((r) => ({ label: r.label, source: r.buildSha, buildId: r.buildId, checkout: r.checkoutSha, dirty: r.dirty, runtime: r.runtime })), warm: byIndex(warm), coldActivations: byIndex(samples.filter((s) => s.name.startsWith('explore-cold'))),
    classes: Object.fromEntries(['hot-dom', 'data-available-unmounted', 'cold'].map((key) => [key, metrics(warm.filter((s) => s.classification === key))])),
    alreadyActiveClicks: metrics(samples.filter((s) => s.name.startsWith('navigation-') && s.alreadyActive)), coldBoardRenderer: runs.map((r) => r.measurements.find((s) => s.name === 'cold-board')), heap: stats(samples.map((s) => s.heap)), requestCounts,
    perLaunch: runs.map((r) => ({ label: r.label, warm: byIndex(r.samples.filter((s) => s.name.startsWith('navigation-') && !s.alreadyActive)) })) };
}
const prefixes = { before: 'pass3f-final-before', after: 'pass3f-final-observed-after' };
const before = cohort(prefixes.before), after = cohort(prefixes.after);
const idle = {};
for (const phase of ['before', 'after']) {
  const runs = [1, 2, 3].map((i) => all.find((r) => r.label === `${prefixes[phase]}-${i}`));
  assert.ok(runs.every((r) => r?.cleanup && r.idle?.[0]?.scenarioProbeDisabled));
  idle[phase] = runs.map((r) => {
    const sample = r.idle[0], asMap = (value) => Object.fromEntries(value.metrics.map(({ name, value }) => [name, value])), b = asMap(sample.before), a = asMap(sample.after);
    const start = r.samples.at(-1).old.readyAt + 1350, end = start + sample.durationMs;
    return { label: r.label, durationMs: sample.durationMs, approximateApiCount: r.requests.filter((request) => request.at >= start && request.at <= end).length, metrics: Object.fromEntries(['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'JSHeapUsedSize', 'Nodes', 'Documents', 'LayoutCount', 'RecalcStyleCount'].map((key) => [key, { before: b[key], after: a[key], delta: a[key] - b[key] }])) };
  });
}
const upstream = {};
for (const phase of ['before', 'after']) {
  const name = `${prefixes[phase]}-upstream.jsonl`, rows = (await readFile(`${root}/${name}`, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const runs = all.filter((r) => (phase === 'before' ? before.labels : after.labels).includes(r.label));
  const windows = runs.map((r) => ({ label: r.label, start: r.samples[0].old.startedAt, end: r.samples.at(-1).old.readyAt + 350 }));
  const selected = rows.filter((row) => windows.some((w) => row.at >= w.start && row.at <= w.end));
  upstream[phase] = { windows, rows, counts: Object.fromEntries([...new Set(selected.map((r) => r.operation))].sort().map((operation) => [operation, selected.filter((r) => r.operation === operation).length])), failed: selected.filter((r) => r.failed || r.status >= 400).length, githubStarts: selected.filter((r) => r.phase === 'start').length };
}
const decrypt = {};
for (const phase of ['before', 'after']) {
  const log = await readFile(`${root}/${prefixes[phase]}-server.log`, 'utf8');
  const entries = [...log.matchAll(/\[data-decrypt\] \{([\s\S]*?)\n\}/g)].map(([, body]) => Object.fromEntries([...body.matchAll(/(\w+): '([^']*)'/g)].map(([, key, value]) => [key, value])));
  const signatures = entries.map((entry) => [entry.actor_id, entry.scope_id, entry.table, entry.column, entry.row_id].join('|'));
  decrypt[phase] = { auditRecords: entries.length, uniqueIdentities: new Set(signatures).size, repeatedIdentities: signatures.length - new Set(signatures).size, byTable: Object.fromEntries([...new Set(entries.map((entry) => entry.table))].sort().map((table) => [table, entries.filter((entry) => entry.table === table).length])), scope: 'Whole matched production server lifetime, including startup/fixture verification/cleanup/background. No request-correlated duration, actual AES timing or cross-request authority-sharing claim.' };
}
const publicBytes = Buffer.from(JSON.stringify({ runs: all, verification, cpuProfiles, upstream })), compressed = gzipSync(publicBytes, { level: 9 });
const artifact = `${assets}/min-614-pass-3f-navigation-samples.json.gz`; await writeFile(artifact, compressed);
const imageArtifact = `${assets}/min-614-pass-3f-navigation-light.png`, imageBytes = await readFile(imageArtifact);
const evidence = { measuredAt: new Date().toISOString(), method: 'Nearest-rank p95; all completed matched samples and extremes retained. Gesture-to-rAF predicate durations exclude driver preparation. Failed/exploratory/profile launches remain separate in the compressed sample archive.', before, after, idle, decrypt, upstream: Object.fromEntries(Object.entries(upstream).map(([phase, { rows, ...rest }]) => [phase, { ...rest, archivedRows: rows.length }])),
  visual: { artifact: imageArtifact, bytes: imageBytes.length, sha256: hash(imageBytes), scope: 'Final native state check; DOM-only light theme for the image, account dark theme retained in ordinary samples' }, verification, cpuProfiles, attempts: all.map((r) => ({ label: r.label, samples: r.samples.length, error: r.error, cleanup: r.cleanup, source: r.buildSha, buildId: r.buildId, accepted: [...before.labels, ...after.labels].includes(r.label) })),
  archive: { artifact, bytes: publicBytes.length, sha256: hash(publicBytes), compressedBytes: compressed.length, compressedSha256: hash(compressed), omissions: ['Workload document bodies, stored PR metadata/URLs, complete failure DOM, account/project/tab/issue/page identifiers (stable pseudonyms instead).', 'Raw server decrypt logs and CPU/trace stacks remain in original local artifacts with checksums; no claim of request-correlated crypto time or React render counts.'] }, originals };
await writeFile('docs/audits/desktop-perf-min-614-pass-3f-results.json', JSON.stringify(evidence, null, 2) + '\n');
for (const index of Object.keys(before.warm)) console.log(JSON.stringify({ index, before: before.warm[index].clocks.usableExactScenario, after: after.warm[index].clocks.usableExactScenario }));
