import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, _electron } from "playwright";
import { parseAllStartupTiming, verifyBoardResponse } from "./all-startup-timing-parser.mjs";

const root = process.cwd(), shared = (name) => import(pathToFileURL(path.join(root, "scripts/performance", name)).href);
const { openFixture, stableTabs, stableManifestPath, assertStableTabs } = await shared("stable-restored-tabs.mjs");
const { loadConnectedBoardWorkload, loadForgeWorkload, forgeLinkFingerprint } = await shared("measure-forge-navigation.mjs");
const { optionalSecondaryWorkload, secondaryEvidence } = await shared("secondary-navigation-workload.mjs");
const { secondaryManifestPath } = await shared("enrich-secondary-workload.mjs");
const { assertScope } = await shared("seed.mjs");
const { boardReady } = await shared("board-readiness.mjs");
const { restoredDestinationReady, RESTORED_LOADING_SELECTOR } = await shared("restored-navigation-readiness.mjs");
assert.ok(process.argv.includes("--run-diagnostic"), "Explicit --run-diagnostic is required before fixture authentication");
const native = process.argv.includes("--electron");
assert.ok(native || process.argv.includes("--headful"), "Use a visible private browser or an isolated native profile");
assert.ok(process.env.MINDDY_PERF_BUILD_ROOT, "An explicit actual product build root is required");
const label = process.env.MINDDY_PERF_LABEL ?? `min683-restored-after-all-startup-protocol-diagnostic-${native ? "native" : "web"}-1`;
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const output = path.join(root, "output/playwright/performance");
await mkdir(output, { recursive: true });
const lockPath = path.join(output, "min683-all-startup-ui.lock"), token = randomUUID(), lock = await open(lockPath, "wx");
await lock.writeFile(JSON.stringify({ token, label, pid: process.pid, startedAt: new Date().toISOString() }));
const hash = (value) => createHash("sha256").update(value).digest("hex"), fingerprint = (value) => hash(JSON.stringify(value));
const ordinaryScope = ["measure-restored-navigation.mjs", "restored-navigation-readiness.mjs", "board-readiness.mjs", "stable-restored-tabs.mjs",
  "measure-forge-navigation.mjs", "secondary-navigation-workload.mjs", "enrich-secondary-workload.mjs", "seed.mjs"];
const ordinaryHash = async () => fingerprint(await Promise.all(ordinaryScope.map((name) => readFile(path.join(root, "scripts/performance", name), "utf8"))));
const sourcePaths = [fileURLToPath(import.meta.url), fileURLToPath(new URL("./all-startup-timing-parser.mjs", import.meta.url))];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async (file) => [path.relative(root, file), hash(await readFile(file))])));
const result = { label, protocol: "min683-excluded-all-startup-v1", excludedFromComparison: "Header interception and request-scoped server instrumentation; no ordinary latency or acceptance conclusion",
  timestamp: new Date().toISOString(), runtime: native ? "unpackaged Electron" : "Chromium", status: "running", observations: [], requests: [], cleanup: [], errors: [],
  ordinaryDependencyScope: ordinaryScope, limitations: ["Authenticated production renderer launch and refresh are measured; this is not executable or installed signed-release startup.",
    "Only real renderer GET /api/me/board requests receive the exact diagnostic header. No measured full-board request is manufactured.",
    "DOM completeness plus two animation frames is a paint opportunity. Interception and server instrumentation can change latency.",
    "Server phase durations accumulate overlapping invocations and cannot be summed into total time. Start offsets use the server admission clock.",
    "A private context does not reset server, database or GitHub caches. A file lock coordinates this collector only; sole UI ownership remains an operator requirement."] };
let session, browser, context, app, profile, page, originalTabs, specs, secondary, connected, forge, failure, backoff;
let currentPhase = "excluded-setup";
const pages = [], createdTabs = new Set(), pending = new Set(), dispatches = new Map(), activeBoardRequests = new Set();
const immutableTab = ({ id, user_id, custom_name, pinned, position }) => ({ id, user_id, custom_name, pinned, position });
const safeFailure = () => ({ message: "Collector failed; inspect its fixed phase, request proof and cleanup metadata" });

async function restoreTabs(destinations) {
  const { api, fixture } = session;
  let current = await api("/api/me/app-tabs");
  for (const tab of current) {
    assert.equal(tab.user_id, fixture.userId);
    if (!originalTabs.some((original) => original.id === tab.id)) {
      assert.ok(createdTabs.has(tab.id), "Refuse deletion of an unrecognized tab");
      await api(`/api/me/app-tabs/${tab.id}`, "DELETE", { revision: tab.revision });
    }
  }
  for (const original of originalTabs) {
    current = await api("/api/me/app-tabs");
    const tab = current.find((value) => value.id === original.id);
    assert.ok(tab); assert.deepEqual(immutableTab(tab), immutableTab(original));
    const href = destinations.find((value) => value.id === original.id).href;
    if (tab.href !== href) await api(`/api/me/app-tabs/${tab.id}`, "PATCH", { revision: tab.revision, patch: { href } });
  }
  await assertStableTabs(api, fixture, specs);
}

function installObserver({ boardSource, readySource, allSpec, loadingSelector }) {
  if (window.__allStartup) return;
  localStorage.setItem("cookie_consent", "declined");
  window.__restored = { boardReady: new Function(`return (${boardSource})`)(), ready: new Function(`return (${readySource})`)(), loadingSelector };
  const state = window.__allStartup = { timeOrigin: performance.timeOrigin, pathname: location.pathname, contentMs: null, paintMs: null, loadingFrames: 0, longTasks: [] };
  try { new PerformanceObserver((list) => state.longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))).observe({ type: "longtask", buffered: true }); }
  catch { /* Optional browser API. */ }
  const observe = () => {
    const visible = (node) => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]') && getComputedStyle(node).visibility !== "hidden";
    if ([...document.querySelectorAll(loadingSelector)].some(visible)) state.loadingFrames++;
    if (!window.__restored.ready(allSpec)) { requestAnimationFrame(observe); return; }
    state.contentMs = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => { state.paintMs = performance.now(); }));
  };
  requestAnimationFrame(observe);
}

async function observeNavigation(phase, operation) {
  currentPhase = phase;
  const row = { phase, driverStartedAt: new Date().toISOString(), driverStartedWallMs: Date.now() };
  result.observations.push(row);
  await operation();
  const beganWaiting = Date.now();
  while (Date.now() - beganWaiting < 30000) {
    if (backoff) throw new Error("Actual HTTP backoff stops navigation");
    if (await page.evaluate(() => window.__allStartup?.paintMs != null)) break;
    await page.waitForTimeout(25);
  }
  row.renderer = await page.evaluate((allId) => {
    const navigation = performance.getEntriesByType("navigation")[0];
    return { ...window.__allStartup, observedAgeMs: performance.now(), documentReadyState: document.readyState,
      selectedAll: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.getAttribute("data-app-tab-id") === allId,
      navigation: navigation ? { type: navigation.type, responseStart: navigation.responseStart, responseEnd: navigation.responseEnd,
        domContentLoadedEventStart: navigation.domContentLoadedEventStart, domContentLoadedEventEnd: navigation.domContentLoadedEventEnd } : null };
  }, specs[0].id);
  assert.ok(row.renderer.paintMs != null && row.renderer.pathname === "/all" && row.renderer.selectedAll);
  // Complete response attribution is separate from the already-recorded UI availability.
  row.responseAttributionWaitBeganAt = new Date().toISOString();
  const attributionStart = Date.now();
  while (Date.now() - attributionStart < 30000) {
    if (backoff) throw new Error("Actual HTTP backoff stops response attribution");
    const dispatched = result.requests.filter((request) => request.phaseAtDispatch === phase);
    if (dispatched.length && !activeBoardRequests.size && !pending.size) break;
    await page.waitForTimeout(25);
  }
  const requests = result.requests.filter((request) => request.phaseAtDispatch === phase);
  row.successfulBoardResponses = requests.filter((request) => request.status === 200 && request.proof?.completeIssueSource && request.serverTiming).length;
  assert.ok(row.successfulBoardResponses > 0, "A phase needs a real successful complete and instrumented renderer board response");
  assert.ok(!activeBoardRequests.size && !pending.size && !requests.some((request) => request.status !== 200 || request.failed || request.proofError || request.timingError));
  row.completedAt = new Date().toISOString(); row.status = "complete-excluded-observation";
}

async function closeRenderer() {
  if (app) { await app.close(); app = undefined; context = undefined; }
  else if (context) { await context.close(); context = undefined; }
  await Promise.allSettled(pending);
  if (profile) { await rm(profile, { recursive: true, force: true }); profile = undefined; }
}

try {
  session = await openFixture();
  const { api, fixture, base, cookies } = session;
  forge = await loadForgeWorkload(api); specs = stableTabs(fixture, forge);
  const manifest = JSON.parse(await readFile(stableManifestPath, "utf8"));
  assert.equal(manifest.userId, fixture.userId); assert.equal(manifest.email, fixture.email); assert.equal(manifest.marker, fixture.marker); assert.deepEqual(manifest.specs, specs);
  originalTabs = await assertStableTabs(api, fixture, specs);
  secondary = await optionalSecondaryWorkload(api, fixture); assert.equal(secondary?.status, "complete");
  connected = await loadConnectedBoardWorkload(api, fixture, secondary);
  for (const spec of specs.filter((value) => value.kind === "page")) {
    const href = `/api/projects/${spec.projectId}/pages/${spec.pageId}`, body = await api(href);
    assertScope("pages", body, fixture.userId); assert.equal(body.content.content.length, 80);
    pages.push({ href, fingerprint: fingerprint(body), version: body.version });
  }
  const productRoot = process.env.MINDDY_PERF_BUILD_ROOT;
  result.product = JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8"));
  assert.equal(result.product.build, (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim());
  assert.match(result.product.sha, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(result.product.environmentFiles).sort(), [".env", ".env.local", ".env.production", ".env.production.local"].sort());
  assert.match(result.product.environmentFiles[".env"], /^[a-f0-9]{64}$/);
  assert.ok(Object.values(result.product.environmentFiles).every((value) => value === null || /^[a-f0-9]{64}$/.test(value)));
  result.sha = result.product.sha; result.build = result.product.build; result.environmentFiles = result.product.environmentFiles;
  result.collectorSourceHashes = await sourceHashes(); result.ordinaryDependencyHash = await ordinaryHash();
  result.secondaryManifestSha256 = hash(await readFile(secondaryManifestPath));
  result.workload = { sourceIssues: connected.sourceIssues, kanbanCards: connected.cards, contentFingerprint: connected.contentFingerprint,
    secondaryFingerprint: fingerprint(secondaryEvidence(secondary)), secondaryCounts: secondary.counts, stableTabs: specs.length };
  await restoreTabs(specs);
  if (native) {
    profile = await mkdtemp(path.join(tmpdir(), "minddy-min683-all-startup-"));
    const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    Object.assign(env, { MINDDY_DESKTOP_ORIGIN: base, MINDDY_DESKTOP_TEST_USER_DATA: profile });
    app = await _electron.launch({ args: [`--user-data-dir=${profile}`, path.join(root, "desktop")], cwd: path.join(root, "desktop"), env, timeout: 30000 });
    const runtime = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, userData: app.getPath("userData"), sessionData: app.getPath("sessionData"), electron: process.versions.electron, chromium: process.versions.chrome }));
    assert.equal(runtime.packaged, false); assert.equal(runtime.userData, profile); assert.equal(runtime.sessionData, profile);
    result.versions = { electron: runtime.electron, chromium: runtime.chromium, packaged: false }; context = app.context();
  } else {
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US", colorScheme: "light" });
    result.versions = { chromium: browser.version(), headless: false };
  }
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
  const observer = { boardSource: boardReady.toString(), readySource: restoredDestinationReady.toString(), allSpec: { ...specs[0], cards: connected.cards, cardIds: connected.cardIds }, loadingSelector: RESTORED_LOADING_SELECTOR };
  await context.addInitScript(installObserver, observer);
  page = native ? await app.firstWindow() : await context.newPage();
  await page.addInitScript(installObserver, observer); page.setDefaultTimeout(30000);
  page.on("pageerror", () => { result.rendererError = true; });
  await context.route((url) => url.origin === base && url.pathname === "/api/me/board", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.continue();
    const entry = { route: "/api/me/board", type: "actual-renderer-board-get", phaseAtDispatch: currentPhase,
      dispatchObservedWallMs: Date.now(), dispatchObservedAt: new Date().toISOString(), diagnosticHeaderAdded: true };
    dispatches.set(request, entry); activeBoardRequests.add(request); result.requests.push(entry);
    await route.continue({ headers: { ...await request.allHeaders(), "x-minddy-performance-diagnostic": "all-startup-v1" } });
  });
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (url.origin !== base) return;
    const task = (async () => {
      const response = await request.response(), status = response?.status();
      if (request.method() === "POST" && url.pathname === "/api/me/app-tabs" && response?.ok()) {
        const payload = request.postDataJSON(); if (typeof payload?.id === "string") createdTabs.add(payload.id);
      }
      if ([403, 429].includes(status)) {
        const raw = await response.headerValue("retry-after");
        const seconds = raw !== null && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.max(0, Math.ceil((Date.parse(raw) - Date.now()) / 1000)) : null;
        backoff = { resourceType: url.pathname === "/api/me/board" ? "board" : "other-same-origin", status,
          retryAfterSeconds: Number.isFinite(seconds) ? seconds : null, observedAt: new Date().toISOString() };
      }
      const entry = dispatches.get(request); if (!entry) return;
      const timing = request.timing();
      Object.assign(entry, { status, finishedObservedWallMs: Date.now(), timing,
        requestSentWallMs: timing.requestStart >= 0 ? timing.startTime + timing.requestStart : null,
        responseHeadersWallMs: timing.responseStart >= 0 ? timing.startTime + timing.responseStart : null,
        responseEndWallMs: timing.responseEnd >= 0 ? timing.startTime + timing.responseEnd : null });
      if (response?.ok()) {
        try {
          entry.serverTiming = parseAllStartupTiming(await response.headerValue("server-timing"));
          const required = ["auth", "issues", "issues_db", "issues_decode", "projects", "categories", "objectives", "relations",
            "members", "members_db", "members_identity", "members_avatar", "integrations", "integrations_decode", "json"];
          assert.ok(required.every((name) => entry.serverTiming.phases[name]), "Every enabled fixture read phase must be observed");
        }
        catch { entry.timingError = "fixed_server_timing_missing_or_invalid"; }
        try { entry.proof = verifyBoardResponse(await response.json(), connected, forgeLinkFingerprint); }
        catch { entry.proofError = "complete_response_identity_or_content_mismatch"; }
      }
    })().catch(() => { result.responseObserverFailed = true; }).finally(() => { pending.delete(task); activeBoardRequests.delete(request); });
    pending.add(task);
  });
  page.on("requestfailed", (request) => {
    const entry = dispatches.get(request); if (entry) Object.assign(entry, { failed: true, finishedObservedWallMs: Date.now(), timing: request.timing() });
    activeBoardRequests.delete(request);
  });
  await observeNavigation("authenticated-renderer-launch", () => page.goto(`${base}/all`, { waitUntil: "domcontentloaded" }));
  if (backoff) throw new Error("Actual HTTP backoff stops refresh");
  await observeNavigation("renderer-refresh", () => page.reload({ waitUntil: "domcontentloaded" }));
  assert.ok(!result.rendererError && !result.responseObserverFailed && !backoff);
  result.status = "complete-excluded-diagnostic";
} catch (error) {
  failure = error; result.status = backoff ? "stopped-for-http-backoff" : "failed"; result.failure = safeFailure(); result.failedPhase = currentPhase;
  const observation = result.observations.at(-1); if (observation && !observation.status) observation.status = "failed-excluded-observation";
}
finally {
  await closeRenderer().then(() => result.cleanup.push({ isolatedRendererClosed: true, isolatedNativeProfileRemoved: native ? !profile : null }), () => {
    result.status = "failed-cleanup"; failure ??= new Error("Renderer cleanup failed");
    result.cleanup.push({ isolatedRendererClosed: !app && !context, isolatedNativeProfileRemoved: native ? !profile : null });
  });
  if (browser) await browser.close().catch(() => { result.status = "failed-cleanup"; failure ??= new Error("Browser cleanup failed"); });
  if (session && originalTabs) try {
    assert.ok(!app && !context, "Do not restore fixture destinations while an unclosed renderer may still write them");
    const { api, fixture } = session;
    await restoreTabs(originalTabs);
    for (const saved of pages) assert.equal(fingerprint(await api(saved.href)), saved.fingerprint);
    if (secondary) assert.deepEqual(secondaryEvidence(await optionalSecondaryWorkload(api, fixture)), secondaryEvidence(secondary));
    if (connected) assert.deepEqual(await loadConnectedBoardWorkload(api, fixture, secondary), connected);
    const { link } = await api(`/api/projects/${forge.project}/git-link`); assert.equal(forgeLinkFingerprint(link), forge.linkFingerprint);
    result.cleanup.push({ stableTenTabsRestored: true, completeSecondaryCohortUnchanged: true, completeIssueSourceUnchanged: true, pageBodiesAndVersionsUnchanged: true, githubConnectionUnchanged: true });
  } catch { result.status = "failed-preservation"; failure ??= new Error("Fixture preservation failed"); result.cleanup.push({ completePreservationVerified: false }); }
  if (result.collectorSourceHashes) result.collectorSourcesUnchanged = await sourceHashes().then((value) => fingerprint(value) === fingerprint(result.collectorSourceHashes), () => false);
  if (result.ordinaryDependencyHash) result.ordinaryDependenciesUnchanged = await ordinaryHash().then((value) => value === result.ordinaryDependencyHash, () => false);
  if (result.secondaryManifestSha256) result.secondaryManifestUnchanged = await readFile(secondaryManifestPath).then((value) => hash(value) === result.secondaryManifestSha256, () => false);
  if ([result.collectorSourcesUnchanged, result.ordinaryDependenciesUnchanged, result.secondaryManifestUnchanged].includes(false)) result.status = "failed-changed-source-or-cohort";
  if (backoff) result.backoff = backoff;
  await session?.close().catch(() => { result.status = "failed-cleanup"; result.cleanup.push({ fixtureApiContextClosed: false }); });
  result.finishedAt = new Date().toISOString();
  const resultPath = path.join(output, `${label}.json`);
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  await lock.close(); assert.equal(JSON.parse(await readFile(lockPath, "utf8")).token, token); await rm(lockPath);
  console.log(JSON.stringify({ resultPath, status: result.status }));
}
if (failure || result.status !== "complete-excluded-diagnostic") process.exitCode = 1;
