import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const inputDirectory = path.resolve("output/playwright/performance");
const evidenceDirectory = path.resolve("docs/performance/min-683-restored-evidence");
const reportPath = path.resolve("docs/performance/min-683-restored-results.json");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baselineBuild = "IflZwyWntlTxQ6lF7WslG";
const baselineSha = "ca44a35e43f589a65ce0169eb820f511d47b8899";
const candidateStages = ["preparation", "serial-pr", "pages", "host", "admission", "authority", "two-slots"];

/** Keep first activations separate; fewer than ten observations have no p95. */
export function sampleStatistics(values) {
  const samples = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { count: samples.length, ...(samples.length ? { p50: samples[Math.ceil(samples.length * 0.5) - 1],
    p95: samples.length >= 10 ? samples[Math.ceil(samples.length * 0.95) - 1] : null, max: samples.at(-1) } : { p50: null, p95: null, max: null }) };
}

/** Fail closed on secrets; omit duplicate fixture paragraph text from evidence. */
export function auditEvidence(value, location = "$", removed = []) {
  if (Array.isArray(value)) return value.map((entry, index) => auditEvidence(entry, `${location}[${index}]`, removed));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      assert.ok(!/^(cookies?|authorization|headers|access_token|refresh_token|password|ciphertext)$/i.test(key), `Sensitive payload field: ${location}.${key}`);
      assert.ok(!["content", "body", "visibleContent"].includes(key), `Full content field: ${location}.${key}`);
      if (key === "bodyText") { result.bodyTextSha256 = sha256(String(entry)); removed.push(`${location}.${key}`); }
      else if (key === "cookieMetadata") {
        result.cookieMetadataSummary = { count: entry.length, persistentExpiryCount: entry.filter((cookie) => cookie.expires > 0).length };
        removed.push(`${location}.${key}`);
      } else if (key === "excludedDeviceOnlyAnalyticsPreference") {
        result.analyticsPreferenceConfiguredOnlyInExcludedSetup = true; removed.push(`${location}.${key}`);
      }
      else result[key] = auditEvidence(entry, `${location}.${key}`, removed);
    }
    return result;
  }
  if (typeof value === "string") {
    assert.ok(!/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(value), `JWT-like value: ${location}`);
    assert.ok(!/\b(?:sb_secret_|sbp_|ghp_|github_pat_)[A-Za-z0-9_]{12,}/.test(value), `Credential-like value: ${location}`);
  }
  return value;
}

export function summarizeMeasurements(measurements) {
  const groups = new Map();
  for (const sample of measurements ?? []) {
    const key = JSON.stringify([sample.name, sample.destination ?? "startup"]);
    const group = groups.get(key) ?? { name: sample.name, destination: sample.destination ?? "startup", observations: [] };
    group.observations.push(sample); groups.set(key, group);
  }
  return [...groups.values()].map(({ name, destination, observations }) => {
    const successful = observations.filter((sample) => sample.status === "complete" ||
      sample.status === undefined && Number.isFinite(sample.driverMs) && sample.contentMs === undefined);
    return { name, destination, observed: observations.length,
      failed: observations.filter((sample) => sample.status === "failed").length,
      blockedByPrerequisite: observations.filter((sample) => sample.status === "blocked-by-prerequisite").length,
      unsupported: observations.filter((sample) => sample.status?.startsWith("unsupported")).length,
      paintOpportunityMs: sampleStatistics(successful.map((sample) => sample.paintMs ?? sample.driverMs)),
      contentVisibleMs: sampleStatistics(successful.map((sample) => sample.contentMs)),
      visibleLoadingFrames: { samplesWithLoading: successful.filter((sample) => sample.loadingFrames > 0).length,
        maximum: Math.max(0, ...successful.map((sample) => sample.loadingFrames ?? 0)) },
      samplesWithLongTasks: successful.filter((sample) => sample.longTasks?.length > 0).length };
  });
}

/** Query success at a fixed observation age remains metadata, not UI or write readiness. */
export function preparationSnapshotSummary(snapshot) {
  if (!snapshot) return null;
  return { targetRefreshAgeMs: snapshot.targetRefreshAgeMs, observedRefreshAgeMs: snapshot.observedRefreshAgeMs,
    queryClientFound: snapshot.queryClientFound, restoredTabCount: snapshot.restoredTabCount, error: snapshot.error ?? null,
    destinations: snapshot.destinations?.map(({ id, kind, selectedDetailId, queries, page }) => ({ id, kind, selectedDetailId,
      declaredQueryCount: queries.length, successfulAcceptedQueryCount: queries.filter((query) => query.status === "success" && query.hasData && !query.invalidated).length,
      missingKeys: queries.filter((query) => query.status === "missing").map((query) => query.key),
      errorKeys: queries.filter((query) => query.status === "error").map((query) => query.key),
      invalidatedKeys: queries.filter((query) => query.invalidated).map((query) => query.key),
      fetchingKeys: queries.filter((query) => query.fetchStatus === "fetching").map((query) => query.key),
      collectionCounts: queries.filter((query) => Object.keys(query.collections).length).map(({ key, collections }) => ({ key, collections })),
      ...(page ? { page } : {}) })),
    interpretation: "Metadata only; neither complete visible usable content nor an acquired fresh write basis is inferred" };
}

export function classification(name, value) {
  if (name.includes("protocol-diagnostic") || value.protocol?.startsWith("min683-excluded-")) return {
    stage: "diagnostic", eligibleForNavigationComparison: false,
    reason: value.excludedFromComparison ?? "Readiness and interaction diagnosis only; no ordinary latency conclusions" };
  if (name.includes("smoke")) return { stage: "diagnostic", eligibleForNavigationComparison: false,
    reason: name.endsWith("smoke.json") ? "Overlapping exploratory refresh failure; incomplete protocol and duplicate tab cleanup retained" : "Explicit diagnostic; duplicate long-task observers and invalid headless focus retained" };
  if (value.status === "failed") return { stage: "failed-run", eligibleForNavigationComparison: false,
    reason: "Failed runs are retained and excluded from successful comparisons" };
  const stage = name.includes("before-") ? "baseline" : candidateStages.find((stage) => name.includes(`${stage}-`)) ?? "unclassified";
  return { stage, eligibleForNavigationComparison: !value.excludedFromComparison,
    reason: value.excludedFromComparison ?? "Complete-content ordinary run; individual acceptance and focus validity remain separate" };
}

export function pairedComparisonEligibility(baseline, candidate) {
  const sourceKnown = (run) => /^[a-f0-9]{40}$/.test(run.effectiveSha ?? "") && typeof run.build === "string" && run.build.length > 0 &&
    !["unknown", "unavailable"].includes(run.build) && (run.build !== baselineBuild || run.effectiveSha === baselineSha);
  const protocolMatches = baseline.protocol === candidate.protocol;
  const runnerSourceHashMatches = !!candidate.runnerSourceHash && candidate.runnerSourceHash === baseline.runnerSourceHash;
  const runtimeVersionsMatch = baseline.runtime === candidate.runtime && JSON.stringify(candidate.versions) === JSON.stringify(baseline.versions);
  const viewportMatches = JSON.stringify(candidate.viewport) === JSON.stringify(baseline.viewport);
  const workloadIdentityMatches = !!candidate.workloadIdentity && candidate.workloadIdentity === baseline.workloadIdentity;
  const eligibleForPairedNavigationConclusions = baseline.eligibleForNavigationComparison && candidate.eligibleForNavigationComparison &&
    sourceKnown(baseline) && sourceKnown(candidate) && protocolMatches && runnerSourceHashMatches && runtimeVersionsMatch && viewportMatches && workloadIdentityMatches;
  return { protocolMatches, runnerSourceHashMatches, runtimeVersionsMatch, viewportMatches, workloadIdentityMatches,
    productSourcesKnown: sourceKnown(baseline) && sourceKnown(candidate), eligibleForPairedNavigationConclusions,
    repetitionsMatch: baseline.repetitions === candidate.repetitions,
    eligibleForMatchedWarmConclusions: eligibleForPairedNavigationConclusions && baseline.repetitions === candidate.repetitions,
    eligibleForPairedFocusConclusions: eligibleForPairedNavigationConclusions && baseline.repetitions === candidate.repetitions && baseline.focusValid && candidate.focusValid };
}

export async function refreshRestoredEvidence() {
  await mkdir(evidenceDirectory, { recursive: true });
  const names = (await readdir(inputDirectory)).filter((name) => /^(min683-restored-(baseline|before|preparation|serial-pr|pages|host|admission|authority|two-slots)|min683-executable-).*\.json$/.test(name)).sort();
  const runs = [];
  for (const name of names) {
    const originalBytes = await readFile(path.join(inputDirectory, name));
    const value = JSON.parse(originalBytes);
    if (!value.finishedAt) continue;
    const removedFields = [];
    const audited = auditEvidence(value, "$", removedFields);
    const auditedBytes = Buffer.from(`${JSON.stringify(audited)}\n`);
    const gzipBytes = gzipSync(auditedBytes, { level: 9 });
    const evidenceName = `${name}.gz`;
    await writeFile(path.join(evidenceDirectory, evidenceName), gzipBytes);
    const category = classification(name, value);
    const declaredSha = value.sha ?? value.product?.sha;
    // This one failed pre-cookie launcher recorded HEAD after it advanced while
    // the explicit baseline production build remained unchanged. Never infer a
    // source correction for another unknown or mismatched product manifest.
    const historicalMislabel = name === "min683-restored-before-native-1.json" && value.status === "failed" &&
      value.build === baselineBuild && declaredSha === "7bbb186b44a4c0b5a8ce6ecbb8b0a8ce7d31bc59";
    const correctedSha = historicalMislabel ? baselineSha : declaredSha;
    runs.push({ label: value.label, filename: name, ...category, runtime: value.runtime, timestamp: value.timestamp, status: value.status,
      declaredSha, effectiveSha: correctedSha, build: value.build,
      ...(correctedSha !== declaredSha ? { provenanceCorrection: "HEAD had advanced while the unchanged baseline build was measured; retain original declared SHA in raw evidence" } : {}),
      versions: value.versions, viewport: value.viewport, protocol: value.protocol, runnerSourceHash: value.runnerSourceHash ?? null,
      secondaryCohort: value.workload?.secondary ? { kind: "populated", marker: value.workload.secondary.marker,
        fingerprint: value.workload.secondary.fingerprint, counts: value.workload.secondary.counts } : value.datasetInProgress
        ? { kind: "growing-excluded-diagnostic", marker: value.marker, independentSyntheticSourceCount: value.independentSyntheticSourceCount, globalSourceCount: value.globalSourceCount }
        : { kind: "empty", description: "Triage, feedback and objectives had no fixture entries; these runs do not establish populated-secondary readiness." },
      runnerSourceHashScope: value.runnerSourceHashScope ?? (!value.runnerSourceHash ? "Not recorded" : value.protocol === "min683-real-executable-startup-v1"
        ? ["measure-executable-startup.mjs"]
        : ["measure-restored-navigation.mjs", "restored-navigation-readiness.mjs", "board-readiness.mjs", "stable-restored-tabs.mjs"]),
      workloadIdentity: value.workload ? sha256(JSON.stringify({ counts: value.workload.fixtureCounts,
        tabs: value.workload.stableTabs?.map(({ id, href, kind, projectId, pageId, title, bodyText }) => ({ id, href, kind, projectId, pageId, title, bodyText })),
        connectedBoard: value.workload.connectedBoard, forge: value.workload.forge, secondary: value.workload.secondary })) : null,
      workingDiffHash: value.workingDiffHash ?? null, repetitions: value.repeats,
      focusValid: value.focus?.validFocusTransition === true, focusProtocol: value.focusProtocol ?? null,
      remoteMutationVerified: value.focus?.receivedRemoteMutation === true,
      preparationSinceRefreshMs: value.preparationAtFirstActivation?.sinceRefreshMs ?? null,
      ...(value.refreshPreparationAtThreeSeconds || value.launchPreparationAtThreeSeconds ? { fixedRendererPreparation: {
        launch: preparationSnapshotSummary(value.launchPreparationAtThreeSeconds), refresh: preparationSnapshotSummary(value.refreshPreparationAtThreeSeconds) } } : {}),
      failure: value.failure?.split("\n")[0] ?? null, cleanup: value.cleanup, acceptance: value.acceptance,
      summaries: summarizeMeasurements(value.measurements),
      ...(value.launches ? { executableStartup: { setupExcluded: value.setupExcluded, measuredLaunches: value.launches.length,
        successfulLaunches: value.launches.filter((launch) => launch.status === "complete").length,
        startupWithinThreeSeconds: value.startupWithinThreeSeconds ?? false,
        naturalDestinations: value.launches.map((launch) => launch.targetKind ?? null),
        ...(value.launches.some((launch) => launch.preparationAtProcessThreeSeconds) ? { fixedProcessPreparation: value.launches.map((launch) => ({
          round: launch.round, ...launch.preparationAtProcessThreeSeconds,
          renderer: preparationSnapshotSummary(launch.preparationAtProcessThreeSeconds?.renderer) })) } : {}),
        executableToUsefulInterfaceMs: sampleStatistics(value.launches.filter((launch) => launch.status === "complete").map((launch) => launch.executableToUsefulInterfaceMs)),
        cookiePersistenceVerified: value.launches.length > 0 && value.launches.every((launch) => launch.cookiePersistenceVerified) } } : {}),
      evidence: { path: `min-683-restored-evidence/${evidenceName}`, originalRawSha256: sha256(originalBytes),
        auditedJsonSha256: sha256(auditedBytes), gzipSha256: sha256(gzipBytes), removedFields,
        audit: "No response bodies, auth values, full fixture documents or credential-like strings; duplicate fixture paragraphs replaced by hashes" } });
  }
  const comparisons = [];
  for (const candidate of runs.filter((run) => candidateStages.includes(run.stage) && run.eligibleForNavigationComparison)) {
    const baselines = runs.filter((run) => run.stage === "baseline" && run.runtime === candidate.runtime && run.protocol === candidate.protocol && run.eligibleForNavigationComparison);
    const baseline = baselines.find((run) => pairedComparisonEligibility(run, candidate).eligibleForPairedNavigationConclusions) ?? baselines.at(-1);
    if (!baseline) continue;
    const eligibility = pairedComparisonEligibility(baseline, candidate);
    comparisons.push({ baseline: baseline.label, candidate: candidate.label, ...eligibility,
      limitation: !eligibility.runnerSourceHashMatches ? "Changed runner source hashes require protocol review or a matching baseline; no paired causal conclusion is drawn"
        : !eligibility.repetitionsMatch ? "First-activation protocol matches, but warm repetition counts differ. Do not infer a causal warm/focus percentile improvement; population p95 and daily feel remain unvalidated"
          : "One first activation per destination; warm sample counts are recorded per journey. Population p95 and daily feel remain unvalidated",
      journeys: candidate.summaries.map((after) => {
        const before = baseline.summaries.find((item) => item.name === after.name && item.destination === after.destination);
        return { name: after.name, destination: after.destination,
          before: before?.paintOpportunityMs ?? null, after: after.paintOpportunityMs,
          beforeLoading: before?.visibleLoadingFrames ?? null, afterLoading: after.visibleLoadingFrames };
      }) });
  }
  const incrementalComparisons = [];
  for (const comparison of comparisons) {
    const candidate = runs.find((run) => run.label === comparison.candidate);
    const previousStage = candidateStages[candidateStages.indexOf(candidate.stage) - 1];
    if (!previousStage) continue;
    const previous = runs.filter((run) => run.stage === previousStage && run.runtime === candidate.runtime && run.protocol === candidate.protocol &&
      run.eligibleForNavigationComparison && run.runnerSourceHash === candidate.runnerSourceHash).at(-1);
    if (!previous) continue;
    incrementalComparisons.push({ beforeStage: previousStage, afterStage: candidate.stage, baseline: previous.label, candidate: candidate.label,
      ...pairedComparisonEligibility(previous, candidate), journeys: candidate.summaries.map((after) => {
        const before = previous.summaries.find((item) => item.name === after.name && item.destination === after.destination);
        return { name: after.name, destination: after.destination, before: before?.paintOpportunityMs ?? null, after: after.paintOpportunityMs,
          beforeLoading: before?.visibleLoadingFrames ?? null, afterLoading: after.visibleLoadingFrames };
      }) });
  }
  const report = { schemaVersion: 1, protocol: "min683-restored-evidence-v1", acceptanceComplete: false,
    interpretation: ["Readiness is visible complete usable content plus two-frame paint opportunity; a shell is insufficient.",
      "First activations, repeated alternation, focus return and renderer startup are summarized separately.",
      "Renderer startup is not executable startup. Failed and explicitly diagnostic runs do not enter successful comparisons.",
      "p95 is omitted below ten observations. Even ten lab observations do not establish population p95.",
      "Focus recovery is unvalidated when the automation runtime did not actually lose focus.",
      "Ordinary focus runs do not prove remote mutation delivery, permissions recovery, autosave or daily feel.",
      "Fixed three-second preparation records its actual observation age and missing data before any activation. Cache metadata does not establish visible usable content or fresh write authority.",
      "Large secondary collections require their complete authorized source; UI detail journeys use the explicitly recorded bounded deterministic sample.",
      "Historical v1 ordinary runner hashes cover four files; historical v1 executable hashes cover that runner alone. New protocols record their actual dependency scope. Different hashes and empty/populated datasets are not silently treated as equivalent."],
    variants: [...new Map(runs.map((run) => [run.build, { sha: run.effectiveSha, build: run.build }])).values()], runs, comparisons, incrementalComparisons };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ reportPath, evidenceDirectory, runs: runs.length, comparisons: comparisons.length,
    validPairedNavigationComparisons: comparisons.filter((item) => item.eligibleForPairedNavigationConclusions).length }));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await refreshRestoredEvidence();
