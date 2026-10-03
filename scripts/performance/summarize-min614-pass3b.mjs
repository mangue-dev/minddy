import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const root = 'output/playwright/performance', assets = 'docs/audits/assets';
const beforeLabels = (process.env.MINDDY_PERF_BEFORE_LABELS ?? 'pass3b-before-2,pass3b-before-4,pass3b-before-5').split(',');
const afterLabels = (process.env.MINDDY_PERF_AFTER_LABELS ?? 'pass3b-after-1,pass3b-after-2,pass3b-after-3').split(',');
const files = await readdir(root);
const read = async (label) => JSON.parse(await readFile(`${root}/${label}.json`, 'utf8'));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const group = (name) => name.replace(/-\d+$/, '');
function metrics(rows) {
  const result = { count: rows.length, failures: rows.filter((row) => row.error).length };
  for (const key of ['firstVisibleMs', 'readyMs', 'inputMs', 'serverConfirmationMs', 'persistedReadMs', 'reconciliationMs', 'failedAfterMs', 'longTasks', 'longTaskMs', 'maxFrameMs', 'scriptMs', 'styleMs', 'layoutMs']) {
    const values = rows.map((row) => row[key]).filter(Number.isFinite).sort((a, b) => a - b), n = values.length;
    if (n) result[key] = { median: n % 2 ? values[Math.floor(n / 2)] : (values[n / 2 - 1] + values[n / 2]) / 2, p95: values[Math.ceil(n * .95) - 1], max: values.at(-1), count: n };
  }
  result.longTaskCount = rows.reduce((total, row) => total + (row.longTaskSamples?.length ?? 0), 0);
  result.frameStallCount = rows.reduce((total, row) => total + (row.frameStalls?.length ?? 0), 0);
  return result;
}
async function primary(labels) {
  assert.equal(labels.length, 3);
  const runs = [];
  for (const label of labels) {
    const run = await read(label), checks = await read(`${label}-checks`);
    assert.ok(run.native && run.pass3b && !run.diagnostic && !run.cpuProfile && checks.cleanup);
    assert.deepEqual(run.errors, []);
    for (const name of ['menu-first-visible', 'loaded-warm-open', 'comment-create', 'editor-first-visible', 'comment-edit', 'comment-delete', 'effort', 'hidden-board-return', 'hidden-comment-reopen', 'filtered-loaded-open', 'scrolled-loaded-open']) assert.equal(run.measurements.filter((row) => group(row.name) === name).length, 10, `${label}: ${name}`);
    for (const name of ['comment-create', 'comment-edit', 'comment-delete', 'effort']) assert.equal(checks.stages.filter((row) => row.name === name).length, 10);
    assert.deepEqual(checks.failures, []); runs.push({ ...run, checks });
  }
  const names = [...new Set(runs.flatMap((run) => run.measurements.map((row) => group(row.name))))];
  return { runs, summary: Object.fromEntries(names.map((name) => [name, { ...metrics(runs.flatMap((run) => run.measurements.filter((row) => group(row.name) === name))), perLaunch: runs.map((run) => ({ label: run.label, ...metrics(run.measurements.filter((row) => group(row.name) === name)) })) }])), stages: Object.fromEntries(['comment-create', 'comment-edit', 'comment-delete', 'effort'].map((name) => [name, { ...metrics(runs.flatMap((run) => run.checks.stages.filter((row) => row.name === name))), perLaunch: runs.map((run) => ({ label: run.label, ...metrics(run.checks.stages.filter((row) => row.name === name)) })) }])) };
}
const before = await primary(beforeLabels), after = await primary(afterLabels), selected = new Set([...beforeLabels, ...afterLabels]);
const supplemental = [];
for (const file of files.filter((file) => /^pass3b-.*\.json$/.test(file) && !/-(cpu|trace|checks)\.json$/.test(file))) {
  const label = file.slice(0, -5); if (selected.has(label)) continue;
  const data = await read(label); supplemental.push({ ...data, ...(files.includes(`${label}-checks.json`) ? { checks: await read(`${label}-checks`) } : {}) });
}
// The interrupted first diagnostic has a durable journal and emitted observations.
if (!files.includes('pass3b-calibration-before.json')) supplemental.push({ label: 'pass3b-calibration-before', kind: 'interrupted-heavy-diagnostic', measurements: (await readFile(`${root}/pass3b-calibration-before.log`, 'utf8')).split('\n').filter((line) => line.startsWith('{"name":')).map((line) => JSON.parse(line)), checks: await read('pass3b-calibration-before-checks') });
const artifacts = [];
for (const file of files.filter((file) => /^pass3b-.*-(cpu|trace)\.json$/.test(file))) {
  const raw = await readFile(`${root}/${file}`), zipped = gzipSync(raw), artifact = `${assets}/min-614-${file}.gz`;
  await writeFile(artifact, zipped);
  const item = { file, artifact, bytes: raw.length, sha256: hash(raw), compressedBytes: zipped.length, compressedSha256: hash(zipped) };
  if (file.endsWith('-cpu.json')) {
    const profile = JSON.parse(raw), nodes = new Map(profile.nodes.map((node) => [node.id, node])), totals = new Map();
    for (let index = 0; index < (profile.samples ?? []).length; index++) { const name = nodes.get(profile.samples[index])?.callFrame.functionName || '(anonymous)'; totals.set(name, (totals.get(name) ?? 0) + profile.timeDeltas[index] / 1000); }
    item.topSelfMs = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 20);
  }
  artifacts.push(item);
}
const upstream = {};
for (const phase of ['before', 'after']) {
  const raw = await readFile(`${root}/pass3b-upstream-${phase}.jsonl`), zipped = gzipSync(raw), artifact = `${assets}/min-614-pass-3b-upstream-${phase}.jsonl.gz`;
  await writeFile(artifact, zipped); const rows = raw.toString().trim().split('\n').map((line) => JSON.parse(line));
  upstream[phase] = { artifact, bytes: raw.length, sha256: hash(raw), compressedBytes: zipped.length, compressedSha256: hash(zipped), count: rows.length, errors: rows.filter((row) => row.status >= 400 || row.error) };
  const runs = phase === 'before' ? before.runs : after.runs;
  upstream[phase].commentCreateWindows = runs.flatMap((run) => run.checks.stages.filter((stage) => stage.name === 'comment-create').map((stage) => ({ label: run.label, run: stage.run, operations: rows.filter((row) => row.at >= stage.start && row.at <= stage.start + stage.serverConfirmationMs) })));
}
const logs = [];
for (const file of files.filter((file) => /^pass3b-.*\.log$/.test(file))) { const raw = await readFile(`${root}/${file}`); logs.push({ file, bytes: raw.length, sha256: hash(raw), ...(/(?:tests|lint|typecheck|english|access|schema|build|restore|probe|retained-verification)/.test(file) ? { output: raw.toString() } : {}) }); }
const evidence = { measuredAt: new Date().toISOString(), method: 'Three fresh native production launches and ten warm observations per main scenario in each implementation. Failed/interrupted/profile/injected runs are separate and preserved. No outlier removal. First visibility precedes the historical two frames; legacy menu input also includes closure. Persisted-read verification follows the existing 350 ms observation tail and is not minimum commit latency. Upstream windows may include concurrent background operations and are not request-correlated SQL profiles.', before, after, supplemental, upstream, artifacts, logs, provenance: await read('pass3b-provenance') };
await writeFile('docs/audits/desktop-perf-min-614-pass-3b-results.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ before: before.summary, after: after.summary, stages: { before: before.stages, after: after.stages } }, null, 2));
