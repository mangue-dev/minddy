import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, _electron } from "playwright";

const root = process.cwd();
const shared = (file) => import(pathToFileURL(path.join(root, "scripts/performance", file)).href);
const { openFixture, stableTabs, assertStableTabs, stableManifestPath } = await shared("stable-restored-tabs.mjs");
const { loadConnectedBoardWorkload, loadForgeWorkload, forgeLinkFingerprint } = await shared("measure-forge-navigation.mjs");
const { optionalSecondaryWorkload, secondaryReadiness, secondaryEvidence } = await shared("secondary-navigation-workload.mjs");
const { secondaryManifestPath } = await shared("enrich-secondary-workload.mjs");
const { assertScope } = await shared("seed.mjs");
const { boardReady } = await shared("board-readiness.mjs");
const { restoredDestinationReady, restoredPreparationMetadata, RESTORED_LOADING_SELECTOR } = await shared("restored-navigation-readiness.mjs");
assert.ok(process.argv.includes("--run-diagnostic"), "Explicit --run-diagnostic is required before fixture authentication");
const native = process.argv.includes("--electron"), allNine = process.argv.includes("--all-nine");
assert.ok(native || process.argv.includes("--headful"), "The diagnostic requires a visible private browser or isolated native renderer");
assert.ok(process.env.MINDDY_PERF_BUILD_ROOT, "An explicit actual product build root is required");
const label = process.env.MINDDY_PERF_LABEL ?? `min683-restored-after-independent-first-diagnostic-${native ? "native" : "web"}-1`;
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const output = path.join(root, "output/playwright/performance");
await mkdir(output, { recursive: true });
const resultPath = path.join(output, `${label}.json`);
const lockPath = path.join(output, "min683-independent-first-ui.lock");
const lockToken = randomUUID();
const lock = await open(lockPath, "wx");
await lock.writeFile(JSON.stringify({ token: lockToken, label, pid: process.pid, startedAt: new Date().toISOString() }));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fingerprint = (value) => hash(JSON.stringify(value));
const ordinaryScope = ["measure-restored-navigation.mjs", "restored-navigation-readiness.mjs", "board-readiness.mjs", "stable-restored-tabs.mjs",
  "measure-forge-navigation.mjs", "secondary-navigation-workload.mjs", "enrich-secondary-workload.mjs", "seed.mjs"];
const ordinaryHash = async () => fingerprint(await Promise.all(ordinaryScope.map((name) => readFile(path.join(root, "scripts/performance", name), "utf8"))));
const sourcePath = fileURLToPath(import.meta.url);
const targetAgeMs = 3000, maximumDispatchLatenessMs = 100;
const result = { label, protocol: "min683-excluded-independent-first-v2-prearmed-input", excludedFromComparison: "Independent first-click diagnosis; no ordinary latency or population percentile conclusions",
  timestamp: new Date().toISOString(), runtime: native ? "unpackaged Electron" : "Chromium", targetAgeMs, maximumDispatchLatenessMs,
  status: "running", cases: [], network: [], errors: [], cleanup: [], ordinaryDependencyScope: ordinaryScope,
  limitations: ["Every target has one observation in its own context/profile; no p95 is computed.",
    "A normal unclicked All launch precedes measured refresh. App-created caches survive only within that case and are never constructed by the diagnostic.",
    "Private renderer contexts do not reset database, application-server, CDN, or GitHub caches. This is a first-activation-after-refresh diagnostic, not a cold-backend benchmark.",
    "All readiness is observed independently, without waiting for DOMContentLoaded or All completion before the three-second target deadline.",
    "Passive instrumentation and any tab-strip scroll are prepared near age2800ms; thread deltas include that driver interval before the trusted click.",
    "Dispatch age and lateness are reported literally. Missing/disabled/covered or over-deadline targets are unavailable, never silently clicked later.",
    "Two animation frames are a paint opportunity, not hardware presentation. Probes add work; these data are excluded from ordinary comparisons.",
    "The file lock coordinates this diagnostic's native/web invocations; the operator must also reserve sole UI ownership across other tools."] };
let session, browser, activeContext, activeApp, activeProfile, originalTabs, specs, secondary, forge, connected, failure, backoff;
const preservedPages = [], createdTabs = new Set(), pendingNetwork = new Set();
const immutableTab = ({ id, user_id, custom_name, pinned, position }) => ({ id, user_id, custom_name, pinned, position });
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const safeFailure = (error) => ({ name: error?.name ?? "Error", message: String(error?.message ?? error).split("\n")[0] });

async function restoreTabs(destinations) {
  const { api, fixture } = session;
  let current = await api("/api/me/app-tabs");
  for (const tab of current) {
    assert.equal(tab.user_id, fixture.userId);
    if (!originalTabs.some((entry) => entry.id === tab.id)) {
      assert.ok(createdTabs.has(tab.id), "Refusing to delete an unrecognized tab");
      await api(`/api/me/app-tabs/${tab.id}`, "DELETE", { revision: tab.revision });
    }
  }
  for (const original of originalTabs) {
    current = await api("/api/me/app-tabs");
    const tab = current.find((entry) => entry.id === original.id);
    assert.ok(tab, "A stable fixture tab must not disappear");
    assert.deepEqual(immutableTab(tab), immutableTab(original), "Stable tab metadata must remain unchanged");
    const href = destinations.find((entry) => entry.id === tab.id).href;
    if (tab.href !== href) await api(`/api/me/app-tabs/${tab.id}`, "PATCH", { revision: tab.revision, patch: { href } });
  }
  await assertStableTabs(api, fixture, specs);
}

function installProbe({ boardSource, readySource, preparationSource, loadingSelector, allSpec, preparationSpecs }) {
  if (window.__independent) return;
  localStorage.setItem("cookie_consent", "declined");
  window.__restored = { loadingSelector, client: null, boardReady: new Function(`return (${boardSource})`)(),
    ready: new Function(`return (${readySource})`)(), longTasks: [], sample: null };
  const state = window.__independent = { documentIdentity: { timeOrigin: performance.timeOrigin, pathname: location.pathname,
    firstProbeAgeMs: performance.now() }, stopAll: false, allDOMReadyMs: null, allPaintOpportunityMs: null, preparationAtThreeSeconds: null };
  try { new PerformanceObserver((list) => window.__restored.longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))).observe({ type: "longtask", buffered: true }); }
  catch { /* Optional browser API. */ }
  const preparation = new Function(`return (${preparationSource})`)();
  setTimeout(() => {
    try { state.preparationAtThreeSeconds = preparation(preparationSpecs); }
    catch { state.preparationAtThreeSeconds = { targetRefreshAgeMs: 3000, observedRefreshAgeMs: performance.now(), error: "metadata_probe_failed" }; }
  }, Math.max(0, 3000 - performance.now()));
  const observeAll = () => {
    if (state.stopAll) return;
    if (!window.__restored.ready(allSpec)) { requestAnimationFrame(observeAll); return; }
    state.allDOMReadyMs = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!state.stopAll) state.allPaintOpportunityMs = performance.now(); }));
  };
  requestAnimationFrame(observeAll);
}

async function closeCase() {
  if (activeApp) {
    await activeApp.close();
    activeApp = undefined; activeContext = undefined;
  } else if (activeContext) {
    await activeContext.close();
    activeContext = undefined;
  }
  await Promise.allSettled(pendingNetwork);
  if (activeProfile) {
    await rm(activeProfile, { recursive: true, force: true });
    activeProfile = undefined;
  }
  return { isolatedContextClosed: !activeApp && !activeContext, isolatedNativeProfileRemoved: native ? !activeProfile : null };
}

async function runCase(spec) {
  const row = { destination: { id: spec.id, kind: spec.kind, href: spec.href, projectId: spec.projectId, pageId: spec.pageId }, status: "running", network: [] };
  result.cases.push(row);
  const { base, cookies } = session;
  let page;
  try {
    await restoreTabs(specs);
    if (native) {
      activeProfile = await mkdtemp(path.join(tmpdir(), "minddy-min683-independent-"));
      const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
      // Open windows without taking focus (unpackaged test bench only, see lib/desktop/test-background.ts).
  Object.assign(env, { MINDDY_DESKTOP_ORIGIN: base, MINDDY_DESKTOP_TEST_USER_DATA: activeProfile, MINDDY_DESKTOP_TEST_BACKGROUND: "1" });
      // The optional local HTTP/2 proxy (h2-proxy.mjs) uses a self-signed localhost certificate.
      const tlsArgs = base.startsWith("https:") ? ["--ignore-certificate-errors"] : [];
      activeApp = await _electron.launch({ args: [...tlsArgs, `--user-data-dir=${activeProfile}`, path.join(root, "desktop")], cwd: path.join(root, "desktop"), env, timeout: 30000 });
      const runtime = await activeApp.evaluate(({ app }) => ({ packaged: app.isPackaged, userData: app.getPath("userData"), sessionData: app.getPath("sessionData"),
        electron: process.versions.electron, chromium: process.versions.chrome }));
      assert.equal(runtime.packaged, false); assert.equal(runtime.userData, activeProfile); assert.equal(runtime.sessionData, activeProfile);
      row.versions = { electron: runtime.electron, chromium: runtime.chromium };
      activeContext = activeApp.context();
    } else {
      activeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", locale: "en-US",
        ignoreHTTPSErrors: base.startsWith("https:") });
      row.versions = { chromium: browser.version(), headless: false };
    }
    await activeContext.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
    await activeContext.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
    const probe = { boardSource: boardReady.toString(), readySource: restoredDestinationReady.toString(), preparationSource: restoredPreparationMetadata.toString(),
      loadingSelector: RESTORED_LOADING_SELECTOR, allSpec: specs[0], preparationSpecs: specs.map(({ id, kind, href, projectId, pageId, prId, title, bodyText }) => ({ id, kind, href, projectId, pageId, prId, title, bodyText })) };
    await activeContext.addInitScript(installProbe, probe);
    page = native ? await activeApp.firstWindow() : await activeContext.newPage();
    await page.addInitScript(installProbe, probe);
    page.setDefaultTimeout(15000);
    page.on("pageerror", () => { row.rendererError = true; });
    page.on("requestfinished", (request) => {
      if (!request.url().startsWith(base)) return;
      const task = (async () => {
        const response = await request.response();
        const entry = { path: new URL(request.url()).pathname, method: request.method(), status: response?.status(), ...request.timing() };
        if (entry.method === "POST" && entry.path === "/api/me/app-tabs" && response?.ok()) {
          const payload = request.postDataJSON();
          if (typeof payload?.id === "string") createdTabs.add(payload.id);
        }
        if ([403, 429].includes(entry.status)) {
          const raw = await response.headerValue("retry-after");
          const seconds = raw !== null && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.max(0, Math.ceil((Date.parse(raw) - Date.now()) / 1000)) : null;
          backoff = { path: entry.path, status: entry.status, retryAfterSeconds: Number.isFinite(seconds) ? seconds : null, observedAt: new Date().toISOString() };
          entry.backoff = backoff;
        }
        if (entry.method === "GET" && entry.path === `/api/pull-requests/${forge.prs[0].prId}` && response?.ok()) {
          const capability = (await response.json()).viewer?.capability;
          if (typeof capability === "string") {
            const canComment = ["read", "write"].includes(capability);
            (row.prPermissions ??= []).push({ prId: forge.prs[0].prId, capability, canComment,
              source: "actual-renderer-detail-response", observedAt: new Date().toISOString() });
            await page.evaluate(({ id, allowed }) => {
              if (window.__restored) (window.__restored.prPermissions ??= {})[id] = allowed;
            }, { id: forge.prs[0].prId, allowed: canComment });
          }
        }
        row.network.push(entry);
      })().catch(() => { row.networkProbeError = true; }).finally(() => pendingNetwork.delete(task));
      pendingNetwork.add(task);
    });
    page.on("requestfailed", (request) => { if (request.url().startsWith(base)) row.network.push({ path: new URL(request.url()).pathname,
      method: request.method(), failed: request.failure()?.errorText, ...request.timing() }); });
    const cdp = await activeContext.newCDPSession(page);
    await cdp.send("Performance.enable");
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
    // Only the unclicked natural All prelude may populate this context's cache.
    await page.goto(`${base}/all`, { waitUntil: "commit" });
    await page.waitForFunction(() => window.__independent?.allPaintOpportunityMs != null);
    await page.waitForFunction(() => !!window.__independent.preparationAtThreeSeconds);
    row.prelude = await page.evaluate(() => ({ ageMs: performance.now(), allDOMReadyMs: window.__independent.allDOMReadyMs,
      allPaintOpportunityMs: window.__independent.allPaintOpportunityMs, pathname: location.pathname,
      documentIdentity: window.__independent.documentIdentity }));
    assert.equal(row.prelude.pathname, "/all");
    if (backoff) throw new Error("Actual HTTP backoff stops further independent cases");
    await page.reload({ waitUntil: "commit" });
    await page.waitForFunction(() => !!window.__independent);
    row.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio }));
    // Prepare the passive measurement before the deadline, without activation,
    // hover, or waiting for All. Thread deltas include this early driver baseline.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, Math.max(0, 2800 - performance.now()))));
    row.passiveSetup = await page.evaluate((id) => {
      document.querySelector(`[data-app-tab-id="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      return { ageMs: performance.now(), timeOrigin: performance.timeOrigin };
    }, spec.id);
    await frames(page);
    const beforeMetrics = await metrics();
    await page.evaluate((spec) => {
      window.__restored.sample = null;
      document.addEventListener("pointerdown", (event) => {
        if (!event.isTrusted) return;
        window.__independent.stopAll = true;
        const sample = window.__restored.sample = { start: performance.now(), timeOrigin: performance.timeOrigin, contentMs: null, paintMs: null,
          loadingFrames: 0, status: "waiting", trusted: event.isTrusted, actualPointerTabId: event.target.closest('[data-app-tab-id]')?.getAttribute('data-app-tab-id') ?? null };
        if (sample.actualPointerTabId !== spec.id) { sample.status = "misdirected-input"; return; }
        const observe = () => {
          if (window.__restored.sample !== sample || sample.stopped) return;
          const visible = (node) => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]') && getComputedStyle(node).visibility !== "hidden";
          if ([...document.querySelectorAll(window.__restored.loadingSelector)].some(visible)) sample.loadingFrames++;
          if (!window.__restored.ready(spec)) { requestAnimationFrame(observe); return; }
          sample.contentMs = performance.now() - sample.start;
          requestAnimationFrame(() => requestAnimationFrame(() => { sample.paintMs = performance.now() - sample.start; sample.status = "complete"; }));
        };
        requestAnimationFrame(observe);
      }, { capture: true, once: true });
    }, spec);
    row.threadBaselineAgeMs = await page.evaluate(() => performance.now());
    for (;;) {
      const age = await page.evaluate(() => performance.now());
      if (age >= targetAgeMs) break;
      if (backoff) throw new Error("Actual HTTP backoff stops further independent cases");
      await page.waitForTimeout(Math.max(1, Math.ceil(targetAgeMs - age)));
    }
    row.deadlineObservation = await page.evaluate((id) => {
      const tab = document.querySelector(`[data-app-tab-id="${id}"]`), box = tab?.getBoundingClientRect();
      const point = box ? { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 25) } : null;
      const hit = point ? document.elementFromPoint(point.x, point.y) : null;
      const navigation = performance.getEntriesByType("navigation")[0];
      return { observedAgeMs: performance.now(), timeOrigin: performance.timeOrigin,
        documentIdentity: window.__independent.documentIdentity, documentReadyState: document.readyState,
        navigation: navigation ? { type: navigation.type, startTime: navigation.startTime, responseStart: navigation.responseStart,
          responseEnd: navigation.responseEnd, domContentLoadedEventStart: navigation.domContentLoadedEventStart,
          domContentLoadedEventEnd: navigation.domContentLoadedEventEnd, loadEventEnd: navigation.loadEventEnd } : null,
        allDOMReadyMs: window.__independent.allDOMReadyMs,
        allPaintOpportunityMs: window.__independent.allPaintOpportunityMs, preparationAtThreeSeconds: window.__independent.preparationAtThreeSeconds,
        tabPresent: !!tab, disabled: !!tab?.disabled || tab?.getAttribute("aria-disabled") === "true",
        visible: !!tab?.getClientRects().length && !tab.closest('[inert], [aria-hidden="true"]'),
        box: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null, unscrolledHitPoint: point,
        unscrolledExpectedContainsHit: !!tab && !!hit && (tab === hit || tab.contains(hit)),
        unscrolledHitTabId: hit?.closest('[data-app-tab-id]')?.getAttribute('data-app-tab-id') ?? null };
    }, spec.id);
    if (!row.deadlineObservation.tabPresent || !row.deadlineObservation.visible || row.deadlineObservation.disabled || backoff) {
      row.status = backoff ? "blocked-by-http-backoff" : "unavailable-at-deadline"; return;
    }
    const locator = page.locator(`[data-app-tab-id="${spec.id}"]`);
    const box = await locator.boundingBox();
    assert.ok(box, "A measured target must have a visible rectangle");
    const point = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 25) };
    row.beforeDispatch = await page.evaluate(({ id, point }) => {
      const tab = document.querySelector(`[data-app-tab-id="${id}"]`), hit = document.elementFromPoint(point.x, point.y);
      return { ageMs: performance.now(), expectedContainsHit: !!tab && !!hit && (tab === hit || tab.contains(hit)),
        hitTabId: hit?.closest('[data-app-tab-id]')?.getAttribute('data-app-tab-id') ?? null,
        disabled: !!tab?.disabled || tab?.getAttribute("aria-disabled") === "true", selectedTabId: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.getAttribute('data-app-tab-id') };
    }, { id: spec.id, point });
    if (!row.beforeDispatch.expectedContainsHit || row.beforeDispatch.disabled || row.beforeDispatch.ageMs - targetAgeMs > maximumDispatchLatenessMs) {
      row.status = "unavailable-or-late-dispatch"; return;
    }
    const dispatchAge = await page.evaluate(() => performance.now());
    row.driverDispatchAgeMs = dispatchAge; row.driverDispatchLatenessMs = dispatchAge - targetAgeMs;
    if (backoff) { row.status = "blocked-by-http-backoff"; return; }
    if (row.driverDispatchLatenessMs > maximumDispatchLatenessMs) { row.status = "late-driver-dispatch-not-performed"; return; }
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
    const waitStart = Date.now();
    while (Date.now() - waitStart < 10000) {
      if (backoff) break;
      if (await page.evaluate(() => window.__restored.sample?.paintMs != null || window.__restored.sample?.status === "misdirected-input")) break;
      await page.waitForTimeout(25);
    }
    row.sample = await page.evaluate(() => {
      const sample = window.__restored.sample;
      if (!sample) return null;
      sample.stopped = true;
      return { ...sample, selectedTabId: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.getAttribute('data-app-tab-id'),
        pathname: location.pathname, visibleReadPhases: [...document.querySelectorAll('[data-query-read-phase]')].filter((node) => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]')).map((node) => node.getAttribute('data-query-read-phase')),
        longTasks: window.__restored.longTasks.filter((entry) => entry.startTime >= sample.start),
        preparationAtThreeSeconds: window.__independent.preparationAtThreeSeconds };
    });
    const afterMetrics = await metrics();
    row.thread = Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"].map((name) => [name, afterMetrics[name] - beforeMetrics[name]]));
    row.status = row.sample?.status === "complete" && row.sample.selectedTabId === spec.id && !row.rendererError && !row.networkProbeError && !backoff
      ? "complete" : backoff ? "blocked-by-http-backoff" : "failed-complete-content-or-input-gate";
    row.actualClickAgeMs = row.sample?.start ?? null;
    row.actualClickLatenessMs = row.sample ? row.sample.start - targetAgeMs : null;
    if (row.actualClickLatenessMs > maximumDispatchLatenessMs) row.deadlineMissed = true;
  } catch (error) { row.status = "failed"; row.failure = safeFailure(error); }
  finally {
    try {
      Object.assign(row, await closeCase());
      await restoreTabs(specs);
    } catch (error) {
      row.status = "failed-cleanup";
      row.cleanupFailure = safeFailure(error);
      row.isolatedContextClosed = !activeApp && !activeContext;
      row.isolatedNativeProfileRemoved = native ? !activeProfile : null;
      failure ??= error;
    } finally {
      row.finishedAt = new Date().toISOString();
      console.log(JSON.stringify({ destination: row.destination.kind, pageId: row.destination.pageId, status: row.status,
        clickAgeMs: row.actualClickAgeMs, paintMs: row.sample?.paintMs, backoff: !!backoff }));
    }
  }
}

try {
  session = await openFixture();
  const { api, fixture } = session;
  forge = await loadForgeWorkload(api); specs = stableTabs(fixture, forge);
  const manifest = JSON.parse(await readFile(stableManifestPath, "utf8"));
  assert.equal(manifest.userId, fixture.userId); assert.equal(manifest.email, fixture.email); assert.equal(manifest.marker, fixture.marker);
  assert.deepEqual(manifest.specs, specs);
  originalTabs = await assertStableTabs(api, fixture, specs);
  secondary = await optionalSecondaryWorkload(api, fixture);
  assert.equal(secondary?.status, "complete", "The full secondary cohort must be quiescent and verified");
  connected = await loadConnectedBoardWorkload(api, fixture, secondary);
  const productRoot = process.env.MINDDY_PERF_BUILD_ROOT;
  result.product = JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8"));
  assert.equal(result.product.build, (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim());
  assert.match(result.product.sha, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(result.product.environmentFiles).sort(), [".env", ".env.local", ".env.production", ".env.production.local"].sort());
  assert.match(result.product.environmentFiles[".env"], /^[a-f0-9]{64}$/);
  assert.ok(Object.values(result.product.environmentFiles).every((value) => value === null || /^[a-f0-9]{64}$/.test(value)));
  result.sha = result.product.sha; result.build = result.product.build; result.environmentFiles = result.product.environmentFiles;
  result.ordinaryDependencyHash = await ordinaryHash(); result.diagnosticSourcePath = path.relative(root, sourcePath);
  result.diagnosticSourceSha256 = hash(await readFile(sourcePath));
  result.secondaryManifestSha256 = hash(await readFile(secondaryManifestPath));
  result.workload = { fixtureUserId: fixture.userId, marker: fixture.marker, sourceFingerprint: connected.contentFingerprint,
    globalSourceIssues: connected.sourceIssues, globalKanbanCards: connected.cards, secondary: secondaryEvidence(secondary), tabCount: specs.length };
  const messages = JSON.parse(await readFile(path.join(root, "messages/en.json"), "utf8"));
  for (const spec of specs) {
    if (spec.kind === "all") Object.assign(spec, { cards: connected.cards, cardIds: connected.cardIds });
    if (spec.kind === "board") Object.assign(spec, { cards: connected.perProject[spec.projectId].cards, cardIds: connected.perProject[spec.projectId].cardIds });
    if (["triage", "feedback", "objectives"].includes(spec.kind)) spec.secondary = secondaryReadiness(secondary, spec.kind);
    if (spec.kind === "routines") { spec.emptyTitles = [messages.Routines.emptyTitle]; spec.unavailableTitles = [messages.Routines.emptyNoExecutionBackend,
      messages.Routines.emptyNoScheduler, messages.Routines.emptyNoProject, messages.Routines.emptyNoRepo, messages.Routines.emptyNotOwner]; }
    if (spec.kind === "pr") Object.assign(spec, forge.prs[0], { files: forge.files, commits: forge.commits });
    if (spec.kind === "page") {
      const href = `/api/projects/${spec.projectId}/pages/${spec.pageId}`, body = await api(href);
      assertScope("pages", body, fixture.userId); assert.equal(body.content.content.length, 80);
      spec.title = body.title; spec.bodyText = body.content.content.find((block) => block.type === "paragraph")?.content?.find((node) => node.type === "text")?.text;
      assert.ok(spec.bodyText); preservedPages.push({ href, fingerprint: fingerprint(body), version: body.version });
    }
  }
  const targets = allNine ? specs.slice(1) : specs.filter((spec) => ["board", "page"].includes(spec.kind));
  assert.equal(targets.length, allNine ? 9 : 3, "Use the exact explicit independent-target selection");
  result.targetSelection = allNine ? "all-nine" : "project-and-two-pages";
  if (!native) browser = await chromium.launch({ headless: false });
  for (const target of targets) {
    if (backoff) break;
    await runCase(target);
    if (result.cases.at(-1)?.cleanupFailure) throw new Error("Independent case cleanup failed; no later context may start");
  }
  result.status = backoff ? "stopped-for-http-backoff" : result.cases.every((entry) => entry.status === "complete" && !entry.deadlineMissed) ? "complete-excluded-diagnostic" : "incomplete-excluded-diagnostic";
} catch (error) { failure = error; result.status = error.cleanupFailure ? "failed-cleanup" : "failed"; result.failure = safeFailure(error); }
finally {
  await closeCase().catch((error) => { result.status = "failed-cleanup"; failure ??= error; result.cleanup.push({ failure: safeFailure(error) }); });
  if (browser) await browser.close().catch((error) => { result.status = "failed-cleanup"; failure ??= error; result.cleanup.push({ failure: safeFailure(error) }); });
  if (session && originalTabs && !activeApp && !activeContext) try {
    const { api, fixture } = session;
    await restoreTabs(originalTabs);
    for (const saved of preservedPages) assert.equal(fingerprint(await api(saved.href)), saved.fingerprint, "Preserve complete Page bodies and versions");
    if (secondary) assert.deepEqual(secondaryEvidence(await optionalSecondaryWorkload(api, fixture)), secondaryEvidence(secondary), "Preserve every secondary entity and all1440comments");
    if (connected) assert.deepEqual(await loadConnectedBoardWorkload(api, fixture, secondary), connected, "Preserve all original and shared issue source data");
    const { link } = await api(`/api/projects/${forge.project}/git-link`);
    assert.equal(forgeLinkFingerprint(link), forge.linkFingerprint, "Preserve the existing GitHub connection");
    result.cleanup.push({ stableTabsAndOriginalDestinationsRestored: true, pageBodiesAndVersionsUnchanged: true,
      completeSecondaryCohortUnchanged: true, completeGlobalIssueSourceUnchanged: true, githubConnectionUnchanged: true });
  } catch (error) { result.status = "failed-preservation"; result.cleanup.push({ failure: safeFailure(error) }); failure ??= error; }
  if (result.ordinaryDependencyHash) result.ordinaryDependenciesUnchanged = await ordinaryHash().then((value) => value === result.ordinaryDependencyHash, () => false);
  if (result.diagnosticSourceSha256) result.diagnosticSourceUnchanged = hash(await readFile(sourcePath)) === result.diagnosticSourceSha256;
  if (result.secondaryManifestSha256) result.secondaryManifestUnchanged = hash(await readFile(secondaryManifestPath)) === result.secondaryManifestSha256;
  if (result.ordinaryDependenciesUnchanged === false || result.diagnosticSourceUnchanged === false) result.status = "failed-changed-source";
  if (result.secondaryManifestUnchanged === false) result.status = "failed-changed-fixture-manifest";
  if (backoff) result.backoff = backoff;
  await session?.close();
  result.finishedAt = new Date().toISOString();
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  await lock.close();
  const actualLock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(actualLock.token, lockToken, "Never remove another process's UI reservation");
  await rm(lockPath);
  console.log(JSON.stringify({ resultPath, status: result.status, cases: result.cases.length }));
}
if (failure || result.status !== "complete-excluded-diagnostic") process.exitCode = 1;
