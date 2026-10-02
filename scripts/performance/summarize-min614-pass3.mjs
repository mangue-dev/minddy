import assert from "node:assert/strict";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = 'output/playwright/performance';
const beforeLabels = (process.env.MINDDY_PERF_BEFORE_LABELS ?? 'pass3-before-9,pass3-before-10,pass3-before-12').split(',');
const afterLabels = (process.env.MINDDY_PERF_AFTER_LABELS ?? 'pass3-after-1,pass3-after-2,pass3-after-3').split(',');
const read = async (label) => {
  const result = JSON.parse(await readFile(`${root}/${label}.json`, 'utf8'));
  if (result.errors) result.errors = result.errors.map((error) => error.split('\n')[0]);
  return result;
};
const required = ['issue-warm-complete', 'activity-expand', 'issue-return', 'issue-scrolled', 'issue-filtered', 'issue-switch', 'retained-board-return', 'retained-issue-open', 'property-optimistic', 'comment-optimistic', 'comment-edit', 'hidden-update-board', 'hidden-update-issue'];
const group = (name) => name.replace(/-\d+$/, '');
const median = (values) => {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
function metrics(samples) {
  const result = { count: samples.length };
  for (const key of ['readyMs', 'inputMs', 'longTasks', 'longTaskMs', 'maxFrameMs', 'scriptMs', 'styleMs', 'layoutMs', 'persistedMs']) {
    const values = samples.map((row) => row[key]).filter((value) => Number.isFinite(value)).toSorted((a, b) => a - b);
    if (values.length) result[key] = { median: median(values), p95: values[Math.ceil(values.length * .95) - 1], max: values.at(-1) };
  }
  result.longTaskCount = samples.reduce((sum, row) => sum + (row.longTaskSamples?.length ?? 0), 0);
  result.frameStallCount = samples.reduce((sum, row) => sum + (row.frameStalls?.length ?? 0), 0);
  return result;
}
async function primary(labels) {
  assert.equal(labels.length, 3);
  const runs = [];
  for (const label of labels) {
    const run = await read(label), checks = await read(`${label}-checks`);
    assert.ok(run.native && run.pass3 && !run.diagnostic && !run.cpuProfile);
    assert.deepEqual(run.errors, []);
    assert.ok(checks.cleanup);
    assert.equal(run.measurements.filter((row) => row.name === 'issue-cold-complete').length, 1);
    for (const name of required) assert.equal(run.measurements.filter((row) => group(row.name) === name).length, 10, `${label}: ${name}`);
    for (const name of ['property-confirmation', 'comment-confirmation']) assert.equal(checks.mutations.filter((row) => row.name === name).length, 10);
    runs.push({ ...run, checks });
  }
  const names = [...new Set(runs.flatMap((run) => run.measurements.map((row) => group(row.name))))];
  return { runs, summary: Object.fromEntries(names.map((name) => [name, {
    ...metrics(runs.flatMap((run) => run.measurements.filter((row) => group(row.name) === name))),
    perLaunch: runs.map((run) => ({ label: run.label, ...metrics(run.measurements.filter((row) => group(row.name) === name)) })),
  }])), confirmations: Object.fromEntries(['property-confirmation', 'comment-confirmation'].map((name) => [name, {
    ...metrics(runs.flatMap((run) => run.checks.mutations.filter((row) => row.name === name))),
    perLaunch: runs.map((run) => ({ label: run.label, ...metrics(run.checks.mutations.filter((row) => row.name === name)) })),
  }])) };
}
const before = await primary(beforeLabels), after = await primary(afterLabels);
const primaryLabels = new Set([...beforeLabels, ...afterLabels]);
const files = await readdir(root);
const supplemental = [];
for (const file of files.filter((name) => /^pass3-.*\.json$/.test(name) && !/-(cpu|trace|checks|inventory)\.json$/.test(name))) {
  const label = file.slice(0, -5);
  if (!primaryLabels.has(label)) {
    const data = await read(label);
    if (Array.isArray(data.measurements)) supplemental.push({ ...data, checks: files.includes(`${label}-checks.json`) ? await read(`${label}-checks`) : null });
  }
}
const diagnostics = [];
for (const file of files.filter((name) => /^pass3-.*-(cpu|trace)\.json$/.test(name))) {
  const contents = await readFile(`${root}/${file}`);
  const item = { file, bytes: (await stat(`${root}/${file}`)).size, sha256: createHash('sha256').update(contents).digest('hex') };
  const data = JSON.parse(contents);
  if (file.endsWith('-cpu.json')) {
    const nodes = new Map(data.nodes.map((node) => [node.id, node])), totals = new Map();
    for (let index = 0; index < (data.samples ?? []).length; index++) {
      const frame = nodes.get(data.samples[index])?.callFrame;
      const name = frame?.functionName || '(anonymous)';
      totals.set(name, (totals.get(name) ?? 0) + data.timeDeltas[index] / 1000);
    }
    item.selfMs = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 20);
  } else {
    item.events = data.traceEvents.filter((event) => ['UpdateLayoutTree', 'Layout', 'MinorGC', 'MajorGC'].includes(event.name)).map(({ name, dur, args }) => ({ name, ms: (dur ?? 0) / 1000, ...(args?.beginData?.elementCount ? { elementCount: args.beginData.elementCount } : {}) }));
  }
  diagnostics.push(item);
}
const upstream = {};
for (const phase of ['before', 'after']) upstream[phase] = (await readFile(`${root}/pass3-upstream-${phase}.jsonl`, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const repositories = {};
for (const phase of ['before', 'after']) repositories[phase] = await read(`min614-repositories-pass3-${phase}`);
const evidence = { measuredAt: new Date().toISOString(), method: 'Median averages the middle two values; p95 uses nearest rank. Primary warm rows each contain 30 observations: 10 in each of three fresh native launches. Cold rows contain three observations. Readiness excludes the separate input probe and 350 ms observation tail. Counter deltas include both. Failed and heavy diagnostic runs are supplemental.', before, after, supplemental, diagnostics, upstream, repositories };
await writeFile('docs/audits/desktop-perf-min-614-pass-3-results.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ before: before.summary, after: after.summary, confirmations: { before: before.confirmations, after: after.confirmations } }, null, 2));
