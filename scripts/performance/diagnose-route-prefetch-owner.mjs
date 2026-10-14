import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { openFixture, stableTabs, stableManifestPath, assertStableTabs } from "./stable-restored-tabs.mjs";
import { loadConnectedBoardWorkload, forgeLinkFingerprint } from "./measure-forge-navigation.mjs";
import { secondaryEvidence } from "./secondary-navigation-workload.mjs";
import { secondaryManifestPath } from "./enrich-secondary-workload.mjs";
import { assertScope } from "./seed.mjs";
import { boardReady } from "./board-readiness.mjs";
import { restoredDestinationReady, restoredRequestInitiatorMetadata, RESTORED_LOADING_SELECTOR } from "./restored-navigation-readiness.mjs";

// This standalone excluded attribution pass never edits the frozen v6 collector.
assert.ok(process.argv.includes("--run-diagnostic"), "Explicit --run-diagnostic is required before fixture authentication");
assert.ok(process.argv.includes("--headful"), "The attribution pass requires visible isolated Chromium");
assert.ok(process.env.MINDDY_PERF_BUILD_ROOT, "An explicit actual product build root is required");
const root = process.cwd();
const label = process.env.MINDDY_PERF_LABEL ?? "excluded-min683-route-prefetch-owner-1";
assert.match(label, /^excluded-[a-zA-Z0-9_-]+$/, "Every output label must start with excluded-");
const output = path.join(root, "output/playwright/performance");
await mkdir(output, { recursive: true });
const resultPath = path.join(output, `${label}.json`);
await readFile(resultPath).then(() => { throw new Error("Evidence label already exists; retain it and choose a new diagnostic label"); },
  (error) => { if (error.code !== "ENOENT") throw error; });
const lockPath = path.join(output, "min683-route-prefetch-owner-ui.lock");
const token = randomUUID(), lock = await open(lockPath, "wx");
await lock.writeFile(JSON.stringify({ token, label, pid: process.pid, startedAt: new Date().toISOString() }));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fingerprint = (value) => hash(JSON.stringify(value));
const sourcePaths = [fileURLToPath(import.meta.url), ...[
  "stable-restored-tabs.mjs", "measure-forge-navigation.mjs", "secondary-navigation-workload.mjs",
  "enrich-secondary-workload.mjs", "seed.mjs", "board-readiness.mjs", "restored-navigation-readiness.mjs", "../../captures/lib/env.mjs",
].map((name) => path.join(root, "scripts/performance", name))];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async (file) => [path.relative(root, file), hash(await readFile(file))])));
const result = {
  label, protocol: "min683-excluded-route-prefetch-owner-v1", status: "running", timestamp: new Date().toISOString(),
  excludedFromComparison: "Five-second read-only source attribution with CDP headers and async stacks; no ordinary latency or acceptance conclusion",
  runtime: "headful isolated Chromium", windowMs: 5000, maximumEvents: 5000, droppedEvents: 0,
  requests: [], ownAllPublications: [], bookendHttp: [], bookends: [], cleanup: [], errors: [],
  limitations: [
    "One All startup only. No activation, hover, touch, refresh, content mutation or reseed. Only this run's exactly observed authorized All-view publication may be restored after browser close with a revision-guarded acknowledged PATCH.",
    "Header values, cookies, bodies, raw URL queries and cross-origin stack paths are never exported. Only whitelisted prefetch header booleans are retained.",
    "Next prefetch headers identify prefetch transport; a generic fetch wrapper alone does not prove the precise Link owner or viewport cause.",
    "Async stack depth16 is requested when supported; the existing sanitized metadata helper retains its own bounded four-parent/forty-frame projection.",
    "The clock covers five seconds from the driver navigation dispatch. DOM completeness is sampled independently; this is not a navigation benchmark.",
    "Private Chromium does not reset server, database, CDN or forge caches. This lock coordinates only this collector; root must reserve sole measurement ownership.",
  ],
};
let session, browser, context, cdp, page, originalTabs, specs, secondary, connected, forge, failure, backoff;
let phase = "excluded-setup";
const preservedPages = [], requestRows = new Map(), headerFlags = new Map();
const pending = new Set();
let collecting = false;
const immutableTab = ({ id, user_id, custom_name, pinned, position, href }) => ({ id, user_id, custom_name, pinned, position, href });
const tabContract = (tabs) => tabs.map(immutableTab).sort((left, right) => left.id.localeCompare(right.id));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Restore only this renderer's proven automatic All-view URL publication. */
async function restoreOwnAllViewPublication(current, fixture) {
  const original = originalTabs.find((tab) => tab.id === specs[0].id);
  const published = current.find((tab) => tab.id === original?.id);
  if (published?.href === original?.href) return current;
  phase = "excluded-fixture-bookend-own-all-view-cleanup";
  const entry = { phase, status: "checking", beforeFingerprint: fingerprint(tabContract(originalTabs)), currentFingerprint: fingerprint(tabContract(current)) };
  result.bookends.push(entry);
  try {
    assert.ok(!context, "The isolated renderer must close before destination cleanup");
    assert.equal(original.href, "/all");
    assert.ok(result.allDomGate?.selectedAll && result.allDomGate.selectedAllId === original.id);
    const ownPublication = result.ownAllPublications.at(-1);
    assert.ok(ownPublication, "Require this renderer's acknowledged saved-tab publication, independently of window.location");
    assert.equal(ownPublication.tabId, original.id);
    assert.equal(ownPublication.href, published.href);
    const observed = new URL(published.href, session.base);
    assert.equal(observed.origin, session.base); assert.equal(observed.pathname, "/all");
    assert.equal(observed.hash, ""); assert.equal(observed.searchParams.size, 1);
    const viewId = observed.searchParams.get("view");
    assert.ok(uuidPattern.test(viewId ?? ""));
    assert.equal(published.href, `/all?view=${viewId}`);
    await assertStableTabs(async () => current, fixture, specs);
    // Before writing, reject every unrecognized change to any of the ten tabs.
    const expectedPublication = originalTabs.map((tab) => tab.id === original.id ? { ...tab, href: published.href } : tab);
    assert.deepEqual(tabContract(current), tabContract(expectedPublication));
    const views = await readApi("/api/me/views");
    assert.ok(Array.isArray(views) && views.some((view) => view.id === viewId && view.project_id === null && view.user_id === fixture.userId));
    const revision = published.revision;
    assert.ok(Number.isSafeInteger(revision) && revision > 0);
    assert.ok(revision >= ownPublication.acknowledgedRevision);
    entry.ownPublicationAcknowledgedRevision = ownPublication.acknowledgedRevision;
    const route = `/api/me/app-tabs/${original.id}`;
    const request = { phase, method: "PATCH", path: route, observedAt: new Date().toISOString(), knownOwnAllPublication: true };
    result.bookendHttp.push(request);
    assert.ok(!backoff, "No cleanup write is allowed during observed backoff");
    let response;
    try { response = await session.api(route, "PATCH", { revision, patch: { href: original.href } }); }
    catch (error) {
      request.ok = false;
      const status = /: (\d{3})$/.exec(String(error?.message ?? ""));
      if (status) request.status = Number(status[1]);
      if (request.status === 429) backoff = { status: 429, retryAfterSeconds: null, observedAt: new Date().toISOString(),
        limitation: "Existing fixture API helper does not expose Retry-After; stop without retry" };
      throw new Error("Known-own cleanup request failed; retain the current server revision");
    }
    request.ok = true;
    const acknowledged = response.tab;
    assert.ok(acknowledged && !response.code, "Require the ordinary mutation acknowledgement wrapper");
    assert.deepEqual(immutableTab(acknowledged), immutableTab(original));
    assert.ok(Number.isSafeInteger(acknowledged.revision) && acknowledged.revision > revision);
    entry.publicationHref = published.href; entry.originalHref = original.href;
    entry.revisionBeforePatch = revision; entry.acknowledgedRevision = acknowledged.revision;
    entry.acknowledged = true;
    const after = await readApi("/api/me/app-tabs");
    assert.deepEqual(tabContract(after), tabContract(originalTabs));
    assert.equal(after.find((tab) => tab.id === original.id)?.revision, acknowledged.revision);
    const otherBefore = current.filter((tab) => tab.id !== original.id), otherAfter = after.filter((tab) => tab.id !== original.id);
    assert.deepEqual(tabContract(otherAfter), tabContract(otherBefore));
    entry.otherNineContractsUnchanged = true;
    entry.otherNineMetadataChanged = fingerprint(otherBefore) !== fingerprint(otherAfter);
    entry.currentFingerprint = fingerprint(tabContract(after)); entry.status = "passed";
    return after;
  } catch {
    entry.status = "failed"; result.failedBookend = phase;
    throw new Error("Known-own All destination cleanup failed; do not retry the write");
  }
}

/** Fixed phase names and fingerprints explain failures without exposing content. */
async function preserveBookend(name, beforeFingerprint, verify) {
  phase = `excluded-fixture-bookend-${name}`;
  const entry = { phase, beforeFingerprint, currentFingerprint: null, status: "checking" };
  result.bookends.push(entry);
  try { await verify(entry); entry.status = "passed"; }
  catch { entry.status = "failed"; result.failedBookend = phase; throw new Error("Fixture bookend failed"); }
}

async function readApi(route) {
  assert.ok(route.startsWith("/api/") && !route.includes("?") && !route.includes(".."));
  assert.ok(!backoff, "Respect observed backoff without additional fixture requests");
  const entry = { phase, method: "GET", path: route, observedAt: new Date().toISOString() };
  result.bookendHttp.push(entry);
  try {
    const value = await session.api(route);
    entry.ok = true;
    if (phase.startsWith("excluded-fixture-bookend-")) entry.responseFingerprint = fingerprint(value);
    return value;
  }
  catch (error) {
    entry.ok = false;
    const status = /: (\d{3})$/.exec(String(error?.message ?? ""));
    if (status) entry.status = Number(status[1]);
    if (entry.status === 429) backoff = { status: 429, retryAfterSeconds: null, observedAt: new Date().toISOString(),
      limitation: "Existing fixture API helper does not expose Retry-After; stop without retry" };
    throw new Error("Read-only fixture API failed");
  }
}

async function secondaryCollections(api, manifest) {
  const project = manifest.projectId;
  const issues = await api(`/api/projects/${project}/issues`);
  const objectives = await api(`/api/projects/${project}/objectives`);
  const feedback = await api(`/api/projects/${project}/feedback`);
  const posts = Array.isArray(feedback) ? feedback : feedback.posts;
  assert.ok(Array.isArray(issues) && Array.isArray(objectives) && Array.isArray(posts));
  for (const [group, rows, expected] of [["triage", issues, 120], ["tasks", issues, 450], ["objectives", objectives, 30], ["feedback", posts, 120]]) {
    assert.equal(manifest.entities[group].length, expected); assert.equal(manifest.counts[group], expected);
    const ids = new Set(rows.map((row) => row.id));
    assert.ok(manifest.entities[group].every((row) => ids.has(row.id)));
  }
  for (const objective of manifest.entities.objectives) assert.equal(issues.filter((issue) => issue.objective_id === objective.id).length, 15);
  return { fingerprint: fingerprint({ issues, objectives, feedback }), counts: {
    projectIssues: issues.length, objectives: objectives.length, feedback: posts.length,
    declaredTriage: manifest.entities.triage.length, declaredTasks: manifest.entities.tasks.length,
  } };
}

/** Project only presence/prefetch meaning; never copy a header name/value map. */
function prefetchFlags(headers = {}) {
  let nextRouterPrefetch = false, nextRouterSegmentPrefetch = false, purpose = false, purposePrefetch = false;
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (key === "next-router-prefetch") nextRouterPrefetch = true;
    if (key === "next-router-segment-prefetch") nextRouterSegmentPrefetch = true;
    if (key === "purpose") { purpose = true; purposePrefetch = String(value).toLowerCase().split(/[\s,]+/).includes("prefetch"); }
  }
  return { nextRouterPrefetch, nextRouterSegmentPrefetch, purpose, purposePrefetch };
}
function mergeFlags(left = {}, right = {}) {
  return Object.fromEntries(["nextRouterPrefetch", "nextRouterSegmentPrefetch", "purpose", "purposePrefetch"]
    .map((name) => [name, left[name] === true || right[name] === true]));
}
function track(task) {
  pending.add(task);
  void task.catch(() => { result.responseObserverFailed = true; }).finally(() => pending.delete(task));
}
function installObserver({ boardSource, readySource, loadingSelector, allSpec }) {
  localStorage.setItem("cookie_consent", "declined");
  window.__restored = { boardReady: new Function(`return (${boardSource})`)(), ready: new Function(`return (${readySource})`)(), loadingSelector };
  const state = window.__routePrefetchOwner = { timeOrigin: performance.timeOrigin, contentMs: null, paintMs: null, loadingFrames: 0 };
  const observe = () => {
    if (performance.now() > 5500) return;
    const visible = (node) => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]') && getComputedStyle(node).visibility !== "hidden";
    if ([...document.querySelectorAll(loadingSelector)].some(visible)) state.loadingFrames++;
    if (!window.__restored.ready(allSpec)) { requestAnimationFrame(observe); return; }
    state.contentMs = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => { state.paintMs = performance.now(); }));
  };
  requestAnimationFrame(observe);
}

try {
  session = await openFixture();
  const { fixture, base, cookies } = session;
  const api = readApi;
  assert.equal(fixture.email, "captures-demo+min540@minddy.app");
  // All cohort reads occur before the five-second window and after browser close.
  const stable = JSON.parse(await readFile(stableManifestPath, "utf8"));
  forge = stable.forge;
  assert.ok(forge?.project && forge.prs?.length === 5);
  const currentLink = await api(`/api/projects/${forge.project}/git-link`);
  assert.equal(forgeLinkFingerprint(currentLink.link), forge.linkFingerprint);
  specs = stableTabs(fixture, forge);
  assert.equal(stable.userId, fixture.userId); assert.equal(stable.email, fixture.email);
  assert.equal(stable.marker, fixture.marker); assert.deepEqual(stable.specs, specs);
  originalTabs = await assertStableTabs(api, fixture, specs);
  for (const spec of specs) assert.equal(originalTabs.find((tab) => tab.id === spec.id).href, spec.href,
    "The read-only attribution runner refuses a noncanonical destination instead of normalizing it");
  secondary = JSON.parse(await readFile(secondaryManifestPath, "utf8"));
  assert.equal(secondary.status, "complete"); assert.equal(secondary.userId, fixture.userId);
  assert.equal(secondary.email, fixture.email); assert.equal(secondary.projectId, fixture.projects[0]);
  result.secondaryCollectionsBefore = await secondaryCollections(api, secondary);
  connected = await loadConnectedBoardWorkload(api, fixture, secondary);
  for (const spec of specs.filter((entry) => entry.kind === "page")) {
    const href = `/api/projects/${spec.projectId}/pages/${spec.pageId}`, body = await api(href);
    assertScope("pages", body, fixture.userId);
    assert.equal(body.content.content.length, 80);
    preservedPages.push({ href, fingerprint: fingerprint(body), version: body.version });
  }
  const productRoot = process.env.MINDDY_PERF_BUILD_ROOT;
  result.product = JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8"));
  assert.equal(result.product.build, (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim());
  assert.match(result.product.sha, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(result.product.environmentFiles).sort(), [".env", ".env.local", ".env.production", ".env.production.local"].sort());
  assert.match(result.product.environmentFiles[".env"], /^[a-f0-9]{64}$/);
  assert.ok(Object.values(result.product.environmentFiles).every((value) => value === null || /^[a-f0-9]{64}$/.test(value)));
  result.collectorSourceHashes = await sourceHashes();
  result.manifestHashes = { stable: hash(await readFile(stableManifestPath)), secondary: hash(await readFile(secondaryManifestPath)) };
  result.workload = { verifiedIdentity: fixture.email, marker: fixture.marker, tabCount: specs.length,
    tabFingerprint: fingerprint(originalTabs), sourceIssues: connected.sourceIssues, cards: connected.cards,
    contentFingerprint: connected.contentFingerprint, secondaryFingerprint: fingerprint(secondaryEvidence(secondary)),
    secondaryCounts: secondary.counts, pageVersions: preservedPages.map(({ version, fingerprint }) => ({ version, fingerprint })) };
  browser = await chromium.launch({ headless: false });
  result.versions = { node: process.versions.node, chromium: browser.version(), headless: false };
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US", colorScheme: "light" });
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
  const allSpec = { ...specs[0], cards: connected.cards, cardIds: connected.cardIds };
  await context.addInitScript(installObserver, { boardSource: boardReady.toString(), readySource: restoredDestinationReady.toString(), loadingSelector: RESTORED_LOADING_SELECTOR, allSpec });
  page = await context.newPage();
  page.on("pageerror", () => { result.rendererError = true; });
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    // This observer sees only this isolated renderer's exact own-All PATCH.
    // No other request payload or response body is read or retained here.
    if (request.method() !== "PATCH" || url.origin !== base || url.pathname !== `/api/me/app-tabs/${allSpec.id}` || url.search) return;
    let publication;
    try {
      const text = request.postData();
      if (!text || Buffer.byteLength(text) > 16_384) return;
      const body = JSON.parse(text);
      const href = body?.patch?.href;
      if (typeof href !== "string" || !/^\/all\?view=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(href)) return;
      if (!Number.isSafeInteger(body.revision) || body.revision < 1) return;
      publication = { tabId: allSpec.id, href, requestRevision: body.revision };
    } catch { return; }
    track((async () => {
      const response = await request.response();
      if (response?.status() !== 200) return;
      const acknowledgement = await response.json();
      const tab = acknowledgement?.tab;
      if (acknowledgement.code || tab?.id !== publication.tabId || tab.href !== publication.href ||
          !Number.isSafeInteger(tab.revision) || tab.revision <= publication.requestRevision) {
        result.rejectedOwnPublicationAcknowledgements = (result.rejectedOwnPublicationAcknowledgements ?? 0) + 1;
        return;
      }
      // Retain only the whitelisted URL/identity/revision acknowledgement.
      // Sorting handles out-of-order response callbacks without replaying writes.
      result.ownAllPublications.push({ ...publication, method: "PATCH", status: 200,
        acknowledgedRevision: tab.revision, observedAt: new Date().toISOString() });
      result.ownAllPublications.sort((left, right) => left.acknowledgedRevision - right.acknowledgedRevision);
    })());
  });
  page.on("response", (response) => {
    if (!collecting || new URL(response.url()).origin !== base || ![403, 429].includes(response.status())) return;
    track((async () => {
      const raw = await response.headerValue("retry-after");
      const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.max(0, Math.ceil((Date.parse(raw) - Date.now()) / 1000)) : null;
      // A 403 with no Retry-After is an explicit denial, not proof of quota.
      if (response.status() === 403 && raw === null) { result.observedExplicitDenial = true; return; }
      backoff ??= { status: response.status(), retryAfterSeconds: Number.isFinite(seconds) ? seconds : null, observedAt: new Date().toISOString() };
      const active = context; context = undefined;
      await active?.close();
    })());
  });
  cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  try { await cdp.send("Debugger.enable"); await cdp.send("Debugger.setAsyncCallStackDepth", { maxDepth: 16 }); result.asyncStackDepth16Supported = true; }
  catch { result.asyncStackDepth16Supported = false; }
  cdp.on("Network.requestWillBeSentExtraInfo", (event) => {
    if (!collecting) return;
    if (!headerFlags.has(event.requestId) && headerFlags.size >= result.maximumEvents) { result.droppedEvents++; return; }
    const flags = mergeFlags(headerFlags.get(event.requestId), prefetchFlags(event.headers));
    headerFlags.set(event.requestId, flags);
    const row = requestRows.get(event.requestId); if (row) row.prefetchHeaders = mergeFlags(row.prefetchHeaders, flags);
  });
  cdp.on("Network.requestWillBeSent", (event) => {
    if (!collecting) return;
    const metadata = restoredRequestInitiatorMetadata(event, base);
    if (!metadata) return;
    if (result.requests.length >= result.maximumEvents) { result.droppedEvents++; return; }
    const row = { ...metadata, event: "Network.requestWillBeSent", observedWallMs: Date.now(),
      prefetchHeaders: mergeFlags(headerFlags.get(event.requestId), prefetchFlags(event.request.headers)) };
    requestRows.set(event.requestId, row); result.requests.push(row);
  });
  cdp.on("Network.responseReceived", (event) => {
    if (!collecting) return;
    const row = requestRows.get(event.requestId);
    if (row) Object.assign(row, { status: event.response.status, responseTimestamp: event.timestamp,
      mimeType: event.response.mimeType, fromDiskCache: event.response.fromDiskCache === true, fromServiceWorker: event.response.fromServiceWorker === true });
  });
  cdp.on("Network.loadingFinished", (event) => {
    if (!collecting) return;
    const row = requestRows.get(event.requestId); if (row) Object.assign(row, { finishedTimestamp: event.timestamp, encodedBytes: event.encodedDataLength });
  });
  cdp.on("Network.loadingFailed", (event) => {
    if (!collecting) return;
    const row = requestRows.get(event.requestId); if (row) Object.assign(row, { failedTimestamp: event.timestamp, failed: true, canceled: event.canceled === true });
  });
  phase = "excluded-five-second-all-startup";
  const started = Date.now(); collecting = true;
  result.navigationStartedAt = new Date(started).toISOString(); result.navigationStartedWallMs = started;
  await page.goto(`${base}/all`, { waitUntil: "commit", timeout: 30000 });
  await page.waitForTimeout(Math.max(0, result.windowMs - (Date.now() - started)));
  collecting = false;
  result.captureEndedAt = new Date().toISOString(); result.observedWindowMs = Date.now() - started;
  if (backoff) throw new Error("Observed HTTP backoff stops attribution");
  result.allDomGate = await page.evaluate((spec) => {
    const selectedAllId = document.querySelector('[data-app-tab-id][aria-selected="true"]')?.getAttribute("data-app-tab-id") ?? null;
    const relative = location.pathname + location.search + location.hash;
    // Export only the exact authorized cleanup shape; never arbitrary query data.
    const relativeHref = /^\/all(?:\?view=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i.test(relative) ? relative : null;
    return { ...window.__routePrefetchOwner,
      readyAtCaptureEnd: window.__restored?.ready(spec) === true, pathnameIsAll: location.pathname === "/all",
      selectedAll: selectedAllId === spec.id, selectedAllId, relativeHref, unexpectedRelativeHref: relativeHref === null,
      observedAgeMs: performance.now(), documentReadyState: document.readyState };
  }, allSpec);
  assert.ok(result.allDomGate.readyAtCaptureEnd && result.allDomGate.pathnameIsAll && result.allDomGate.selectedAll,
    "Full usable All must be verified independently of prefetch request attribution");
  assert.ok(!result.rendererError && !result.responseObserverFailed && !result.droppedEvents);
  result.summary = { sameOriginRequests: result.requests.length,
    routeRscRequests: result.requests.filter((row) => !row.path.startsWith("/api/") && row.hasRscQuery).length,
    nextRouterPrefetchRequests: result.requests.filter((row) => row.prefetchHeaders.nextRouterPrefetch).length,
    segmentPrefetchRequests: result.requests.filter((row) => row.prefetchHeaders.nextRouterSegmentPrefetch).length,
    purposePrefetchRequests: result.requests.filter((row) => row.prefetchHeaders.purposePrefetch).length };
  result.status = "complete-excluded-attribution";
} catch {
  failure = true;
  result.status = backoff ? "stopped-for-http-backoff" : "failed-excluded-attribution";
  result.failure = { phase, message: "Attribution failed; preserve sanitized request evidence and fixture bookends" };
} finally {
  collecting = false;
  await context?.close().then(() => { context = undefined; result.cleanup.push({ isolatedContextClosed: true }); }).catch(() => { failure = true; result.status = "failed-cleanup"; });
  await browser?.close().catch(() => { failure = true; result.status = "failed-cleanup"; });
  await Promise.allSettled(pending);
  if (session && originalTabs && !backoff) try {
    const { fixture } = session;
    const api = readApi;
    phase = "excluded-fixture-bookend-tabs";
    const capturedTabs = await api("/api/me/app-tabs");
    const tabsAfterOwnCleanup = await restoreOwnAllViewPublication(capturedTabs, fixture);
    await preserveBookend("tabs", fingerprint(tabContract(originalTabs)), async (entry) => {
      const current = tabsAfterOwnCleanup;
      entry.rawBeforeFingerprint = fingerprint(originalTabs); entry.rawCurrentFingerprint = fingerprint(current);
      entry.currentFingerprint = fingerprint(tabContract(current));
      entry.rawMetadataChanged = entry.rawBeforeFingerprint !== entry.rawCurrentFingerprint;
      entry.missingTabCount = originalTabs.filter((before) => !current.some((tab) => tab.id === before.id)).length;
      entry.unrecognizedTabCount = current.filter((after) => !originalTabs.some((tab) => tab.id === after.id)).length;
      entry.changedContractFields = originalTabs.flatMap((before) => {
        const after = current.find((tab) => tab.id === before.id);
        if (!after) return [];
        const fields = ["id", "user_id", "custom_name", "pinned", "position", "href"].filter((field) => before[field] !== after[field]);
        return fields.length ? [{ id: before.id, fields }] : [];
      });
      entry.revisionChanges = originalTabs.flatMap((before) => {
        const after = current.find((tab) => tab.id === before.id);
        if (!after || before.revision === after.revision) return [];
        const safeRevision = (value) => typeof value === "number" || typeof value === "string" && /^\d+$/.test(value) ? value : null;
        return [{ id: before.id, beforeRevision: safeRevision(before.revision), currentRevision: safeRevision(after.revision) }];
      });
      entry.timestampChanges = originalTabs.filter((before) => {
        const after = current.find((tab) => tab.id === before.id);
        return after && (before.updated_at !== after.updated_at || before.created_at !== after.created_at);
      }).length;
      // Use the ordinary collectors' identity/metadata/destination contract.
      // Revisions, timestamps and enriched labels are observed, never reset.
      await assertStableTabs(async () => current, fixture, specs);
      assert.deepEqual(tabContract(current), tabContract(originalTabs));
    });
    for (const [index, saved] of preservedPages.entries()) await preserveBookend(`page-${index}`, saved.fingerprint, async (entry) => {
      const current = await api(saved.href);
      entry.currentFingerprint = fingerprint(current);
      entry.beforeVersion = saved.version; entry.currentVersion = current.version;
      assert.equal(entry.currentFingerprint, saved.fingerprint);
    });
    if (secondary) await preserveBookend("secondary-collections", result.secondaryCollectionsBefore?.fingerprint ?? null, async (entry) => {
      const current = await secondaryCollections(api, secondary);
      entry.currentFingerprint = current.fingerprint;
      entry.beforeCounts = result.secondaryCollectionsBefore.counts; entry.currentCounts = current.counts;
      assert.deepEqual(current, result.secondaryCollectionsBefore);
    });
    if (connected) await preserveBookend("complete-board", fingerprint(connected), async (entry) => {
      const current = await loadConnectedBoardWorkload(api, fixture, secondary);
      entry.currentFingerprint = fingerprint(current);
      assert.deepEqual(current, connected);
    });
    await preserveBookend("git-link", forge.linkFingerprint, async (entry) => {
      const { link } = await api(`/api/projects/${forge.project}/git-link`);
      entry.currentFingerprint = forgeLinkFingerprint(link);
      assert.equal(entry.currentFingerprint, forge.linkFingerprint);
    });
    result.cleanup.push({ exactTenTabContractsAndDestinationsUnchanged: true, revisionAndEnrichmentChangesRecordedOnly: true, fullPagesAndVersionsUnchanged: true,
      secondaryCollectionsUnchanged: true, commentsNotRefetched: true, completeIssueSourceUnchanged: true, githubConnectionUnchanged: true });
  } catch { failure = true; result.status = "failed-preservation"; result.cleanup.push({ fullPreservationVerified: false }); }
  if (backoff) result.cleanup.push({ fixtureBookendDeferredForBackoff: true, noRetryOrRestorationWrite: true });
  if (result.collectorSourceHashes) result.collectorSourcesUnchanged = await sourceHashes().then((value) => fingerprint(value) === fingerprint(result.collectorSourceHashes), () => false);
  if (result.manifestHashes) result.manifestsUnchanged = await Promise.all([readFile(stableManifestPath), readFile(secondaryManifestPath)])
    .then(([stable, secondary]) => hash(stable) === result.manifestHashes.stable && hash(secondary) === result.manifestHashes.secondary, () => false);
  if (result.collectorSourcesUnchanged === false || result.manifestsUnchanged === false) { failure = true; result.status = "failed-changed-source-or-cohort"; }
  if (backoff) result.backoff = backoff;
  await session?.close().catch(() => { failure = true; result.status = "failed-cleanup"; });
  result.summary ??= { sameOriginRequests: result.requests.length,
    routeRscRequests: result.requests.filter((row) => !row.path.startsWith("/api/") && row.hasRscQuery).length,
    nextRouterPrefetchRequests: result.requests.filter((row) => row.prefetchHeaders.nextRouterPrefetch).length,
    segmentPrefetchRequests: result.requests.filter((row) => row.prefetchHeaders.nextRouterSegmentPrefetch).length,
    purposePrefetchRequests: result.requests.filter((row) => row.prefetchHeaders.purposePrefetch).length };
  result.finishedAt = new Date().toISOString();
  // Never overwrite a failed attribution with a later retry bearing the same label.
  await writeFile(resultPath, JSON.stringify(result, null, 2), { flag: "wx" });
  await lock.close(); assert.equal(JSON.parse(await readFile(lockPath, "utf8")).token, token); await rm(lockPath);
  console.log(JSON.stringify({ resultPath, status: result.status }));
}
if (failure || result.status !== "complete-excluded-attribution") process.exitCode = 1;
