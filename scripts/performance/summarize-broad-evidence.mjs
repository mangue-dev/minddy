import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { auditEvidence, pairedComparisonEligibility, sampleStatistics } from "./summarize-restored-evidence.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");

/** A title shell and complete usable content remain separate observations. */
export function summarizeBroadMeasurements(measurements = []) {
  const groups = new Map();
  const observed = new Set();
  const splitFirst = new Set(["issue-open", "pr-activity-to-files", "pr-open-commits", "pr-change-file", "pr-files-to-activity",
    "project-switch", "project-return", "page-switch", "page-return", "cross-project-pages-return-back", "cross-project-pages-return-menu",
    "cross-project-pages-return", "cross-project-page-return", "cross-project-document-return", "cross-project-pages-switch-back",
    "cross-project-pages-switch-menu", "cross-project-pages-switch", "cross-project-page-switch", "cross-project-document-switch"]);
  for (const sample of measurements) {
    const identity = JSON.stringify([sample.name, sample.destinationNumber ?? null]);
    const phase = splitFirst.has(sample.name) ? observed.has(identity) ? "repeated" : "first-observed" : "as-named";
    observed.add(identity);
    const key = JSON.stringify([sample.name, sample.destinationNumber ?? null, phase]);
    const group = groups.get(key) ?? { name: sample.name, destinationNumber: sample.destinationNumber ?? null, phase, samples: [] };
    group.samples.push(sample); groups.set(key, group);
  }
  return [...groups.values()].map(({ samples, ...group }) => ({ ...group,
    observations: samples.length,
    ...(group.name === "issue-open" ? { shellPaintMs: sampleStatistics(samples.map((sample) => sample.paintMs)),
      fullUsableMs: sampleStatistics(samples.map((sample) => sample.completeMs)) } : {
      fullUsableMs: sampleStatistics(samples.map((sample) => sample.completeMs ?? sample.paintMs ?? sample.driverMs)),
    }),
    visibleShellLoadingObservations: samples.filter((sample) => sample.loadingFrames > 0).length,
    visibleFullContentLoadingObservations: samples.filter((sample) => sample.completeLoadingFrames > 0).length,
    maximumFullContentLoadingFrames: Math.max(0, ...samples.map((sample) => sample.completeLoadingFrames ?? 0)),
    observationsWithLongTasks: samples.filter((sample) => sample.longTasks?.length > 0).length,
    contentReadPhasesAtUsability: [...new Set(samples.flatMap((sample) => sample.contentReadPhasesAtUsability ?? []))],
  }));
}

/** Match actual builds, complete dataset identities, runtime and gate source. */
export function broadComparisonRecord(result) {
  return { effectiveSha: result.sha, build: result.build,
    eligibleForNavigationComparison: result.status === "passed" && Array.isArray(result.errors) && result.errors.length === 0 && !result.diagnostic && !result.excludedFromComparison &&
      result.runnerSourcesUnchanged === true && result.readinessProtocol === "min683-broad-v5-canonical-editable-content-no-hover",
    protocol: JSON.stringify([result.readinessProtocol, result.protocol, result.scenario]),
    runnerSourceHash: result.runnerSourceHash, runtime: result.runtime, versions: result.versions, viewport: result.viewport,
    workloadIdentity: result.workloadIdentity ? digest(JSON.stringify([result.workloadIdentity, result.workload])) : null,
    environmentFiles: result.environmentFiles, repetitions: result.repeats, focusValid: false };
}

export async function refreshBroadEvidence() {
  const input = path.resolve("output/playwright/performance");
  const evidence = path.resolve("docs/performance/min-683-broad-evidence");
  const reportPath = path.resolve("docs/performance/min-683-broad-results.json");
  await mkdir(evidence, { recursive: true });
  const runs = [];
  for (const name of (await readdir(input)).filter((name) => /^min683-broad-.*\.json$/.test(name) && !name.endsWith("-restoration-journal.json")).sort()) {
    const raw = await readFile(path.join(input, name));
    const result = JSON.parse(raw);
    if (!result.finishedAt) continue;
    const audited = Buffer.from(`${JSON.stringify(auditEvidence(result), null, 2)}\n`);
    const compressed = gzipSync(audited, { level: 9 });
    await writeFile(path.join(evidence, `${name}.gz`), compressed);
    runs.push({ name, status: result.status, diagnostic: !!result.diagnostic,
      ...broadComparisonRecord(result), sha: result.sha, build: result.build, sourceScope: result.runnerSourceHashScope,
      measurements: summarizeBroadMeasurements(result.measurements), cleanup: result.cleanup,
      failure: result.failure ?? null, rawSha256: digest(raw), auditedSha256: digest(audited), gzipSha256: digest(compressed),
      auditedEvidence: `min-683-broad-evidence/${name}.gz` });
  }
  const comparisons = [];
  for (const baseline of runs.filter((run) => run.name.includes("-before-"))) {
    for (const candidate of runs.filter((run) => run.name.includes("-after-") && run.runtime === baseline.runtime && run.protocol === baseline.protocol)) {
      comparisons.push({ baseline: baseline.name, candidate: candidate.name, ...pairedComparisonEligibility(baseline, candidate) });
    }
  }
  const report = { schemaVersion: 1, acceptanceComplete: false,
    interpretation: ["Issue title-shell paint is never a full usable-content measurement; its completeMs is summarized separately.",
      "Canonical accepted issue content remains usable during background reconciliation; read phases at usability and network request timings remain separate evidence.",
      "Each PR identity remains separate. Fewer than ten observations have no p95; laboratory p95 is not a population percentile.",
      "First observed issue, subview and repeated deep-journey groups are separate from later observations. First observed does not imply an isolated cold view; ten-loop groups leave nine repetitions with no p95.",
      "Combined cross-project workflows include driver work between trusted clicks and are not individual click-to-content timings.",
      "Excluded protocol probes validate predicates and preservation, not latency. Failed runs remain retained and ineligible.",
      "Strict comparisons require matching environment-file evidence, runtime, viewport, cohort, gate source and actual product manifests.",
      "This broad matrix does not establish real focus recovery, remote delivery or forced-quit draft safety."], runs, comparisons };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ reportPath, runs: runs.length, strictPairs: comparisons.filter((pair) => pair.eligibleForPairedNavigationConclusions).length }));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await refreshBroadEvidence();
