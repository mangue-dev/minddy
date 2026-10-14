import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, _electron } from "playwright";
import { openFixture, stableTabs, stableManifestPath, assertStableTabs } from "./stable-restored-tabs.mjs";
import { loadConnectedBoardWorkload, loadForgeWorkload, forgeLinkFingerprint } from "./measure-forge-navigation.mjs";
import { assertScope } from "./seed.mjs";
import { boardReady } from "./board-readiness.mjs";
import { restoredDestinationReady, restoredPreparationMetadata, restoredRequestInitiatorMetadata, restoredFailureDiagnostics, RESTORED_LOADING_SELECTOR } from "./restored-navigation-readiness.mjs";
import { optionalSecondaryWorkload, secondaryReadiness, secondaryEvidence, secondaryJourneyIds } from "./secondary-navigation-workload.mjs";
import { installRestoredInputDiagnostic } from "./restored-input-diagnostic.mjs";

// Reuse the verified ten-tab fixture. No reseeding, content writes, paid work,
// personal browser profile or tab creation belongs to this read-only protocol.
assert.ok(process.argv.includes("--run-diagnostic"), "Input diagnosis requires explicit --run-diagnostic; no fixture session is opened otherwise");
assert.ok(process.argv.includes("--headful") || process.argv.includes("--electron"), "Input diagnosis requires a visible browser or native renderer");
const genuineFocus = process.argv.includes("--genuine-focus");
assert.ok(!genuineFocus || !process.argv.includes("--electron"), "--genuine-focus diagnoses the same-window web-tab protocol only");
const label = process.env.MINDDY_PERF_LABEL ?? "min683-restored-input-diagnostic";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const repeats = Number(process.env.MINDDY_PERF_REPEATS ?? 10);
const inactiveMs = Number(process.env.MINDDY_PERF_INACTIVE_MS ?? 16000);
assert.ok(Number.isInteger(repeats) && repeats > 0 && repeats <= 100);
assert.ok(Number.isInteger(inactiveMs) && inactiveMs >= 1000 && inactiveMs <= 60000);
const traceRequestInitiators = process.argv.includes("--trace-request-initiators");
assert.ok(!traceRequestInitiators || process.argv.includes("--diagnostic"), "Request-initiator tracing requires --diagnostic and cannot enter ordinary comparisons");
const output = path.resolve("output/playwright/performance");
await mkdir(output, { recursive: true });
const resultPath = path.join(output, `${label}.json`);
const result = { label, protocol: "min683-restored-v1-full-content", runtime: process.argv.includes("--electron") ? "unpackaged Electron" : "Chromium",
  timestamp: new Date().toISOString(), repeats, inactiveMs, immediateRefresh: process.argv.includes("--immediate-refresh"),
  excludedFromComparison: "Instrumented pointer/session diagnosis; never include in ordinary latency comparisons",
  diagnostic: true, inputFocusVariant: genuineFocus ? "genuine-same-window-tab" : "historical-separate-window-attempt",
  status: "running", measurements: [], network: [], resources: [], errors: [], cleanup: [],
  limitations: ["DOM readiness plus two animation frames is a paint opportunity, not a pixel presentation timestamp.",
    "CDP Performance metrics and DOM probes run in both comparison variants; their instrumentation cost is included.",
    "Executable startup is measured separately from authenticated renderer startup; cookie setup is excluded.",
    "This read-only pass does not validate remote mutations, optimistic persistence, autosave departure or permissions revocation."] };
let session, browser, context, page, userData, originalTabs, specs, forge, secondary, connectedBoard, preservedPages = [], failure;
let browserCdp, distractionTargetId, originalTargetId;
let executableStart;
const pendingNetwork = new Set();
const rendererCreatedTabs = new Set();
const failedPrerequisites = new Map();
const tabFields = ({ id, user_id, custom_name, pinned, position }) => ({ id, user_id, custom_name, pinned, position });
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const runnerHash = async () => fingerprint(await Promise.all(result.runnerSourceHashScope.map((file) => readFile(path.resolve("scripts/performance", file), "utf8"))));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  session = await openFixture();
  const { base, fixture, api } = session;
  forge = await loadForgeWorkload(api);
  specs = stableTabs(fixture, forge);
  const manifest = JSON.parse(await readFile(stableManifestPath, "utf8"));
  assert.equal(manifest.userId, fixture.userId);
  assert.equal(manifest.email, fixture.email);
  assert.equal(manifest.marker, fixture.marker);
  assert.deepEqual(manifest.specs, specs, "Normalize the stable fixture before measuring");
  originalTabs = await assertStableTabs(api, fixture, specs);
  // The measured application may persist its selected document. Restore only
  // these known fixture destinations with revision guards, preserving tab metadata.
  for (const spec of specs) {
    const tab = originalTabs.find((value) => value.id === spec.id);
    if (tab.href !== spec.href) await api(`/api/me/app-tabs/${spec.id}`, "PATCH", { revision: tab.revision, patch: { href: spec.href } });
  }
  originalTabs = await assertStableTabs(api, fixture, specs);
  secondary = await optionalSecondaryWorkload(api, fixture);
  connectedBoard = await loadConnectedBoardWorkload(api, fixture, secondary);
  result.protocol = secondary ? secondary.marker === "min683-secondary-scaled-v2"
    ? "min683-restored-v4-scaled-preactivation-snapshot" : "min683-restored-v4-bounded-preactivation-snapshot" : "min683-restored-v4-complete-preactivation-snapshot";
  result.inheritedOrdinaryProtocol = result.protocol;
  result.protocol = "min683-excluded-restored-input-v2";
  const parentBytes = await readFile(path.resolve("output/playwright/performance/min683-restored-after-scaled-page-coherence-web-1.json"));
  const parentEvidence = JSON.parse(parentBytes);
  result.parentEvidence = { filename: "min683-restored-after-scaled-page-coherence-web-1.json", rawSha256: createHash("sha256").update(parentBytes).digest("hex"),
    sha: parentEvidence.sha, build: parentEvidence.build, historicalRunnerSourceHash: parentEvidence.runnerSourceHash, status: parentEvidence.status };
  const productRoot = process.env.MINDDY_PERF_BUILD_ROOT ?? process.cwd();
  const build = (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim();
  const product = process.env.MINDDY_PERF_BUILD_ROOT ? JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8")) : { sha: git("rev-parse", "HEAD"), build };
  assert.equal(product.build, build);
  assert.match(product.sha, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(product.environmentFiles ?? {}).sort(), [".env", ".env.local", ".env.production", ".env.production.local"].sort(), "New measurements require the actual build's environment-file hashes");
  assert.match(product.environmentFiles[".env"], /^[a-f0-9]{64}$/);
  assert.ok(Object.values(product.environmentFiles).every((value) => value === null || /^[a-f0-9]{64}$/.test(value)));
  result.environmentFiles = product.environmentFiles;
  result.runnerSourceHashScope = ["diagnose-restored-input.mjs", "restored-input-diagnostic.mjs", "restored-navigation-readiness.mjs", "board-readiness.mjs", "stable-restored-tabs.mjs",
    "measure-forge-navigation.mjs", "secondary-navigation-workload.mjs", "enrich-secondary-workload.mjs", "seed.mjs"];
  Object.assign(result, { sha: product.sha, build, runnerSha: git("rev-parse", "HEAD"), runnerSourceHash: await runnerHash(), workingDiffHash: fingerprint(git("diff", "--binary")),
    workload: { fixtureCounts: fixture.counts, stableTabs: specs, connectedBoard, forge, fixtureAccount: fixture.email, secondary: secondaryEvidence(secondary) } });
  const messages = JSON.parse(await readFile(path.resolve("messages/en.json"), "utf8"));
  for (const spec of specs) {
    if (spec.kind === "all") { spec.cards = connectedBoard.cards; spec.cardIds = connectedBoard.cardIds; }
    if (spec.kind === "board") { spec.cards = connectedBoard.perProject[spec.projectId].cards; spec.cardIds = connectedBoard.perProject[spec.projectId].cardIds; }
    if (secondary && ["triage", "feedback", "objectives"].includes(spec.kind)) spec.secondary = secondaryReadiness(secondary, spec.kind);
    if (spec.kind === "routines") {
      spec.emptyTitles = [messages.Routines.emptyTitle];
      spec.unavailableTitles = [messages.Routines.emptyNoExecutionBackend, messages.Routines.emptyNoScheduler,
        messages.Routines.emptyNoProject, messages.Routines.emptyNoRepo, messages.Routines.emptyNotOwner];
    }
    if (spec.kind === "pr") Object.assign(spec, forge.prs[0], { files: forge.files, commits: forge.commits });
    if (spec.kind === "page") {
      const href = `/api/projects/${spec.projectId}/pages/${spec.pageId}`;
      const body = await api(href);
      assertScope("pages", body, fixture.userId);
      assert.equal(body.content.content.length, 80);
      spec.title = body.title;
      spec.bodyText = body.content.content.find((block) => block.type === "paragraph")?.content?.find((node) => node.type === "text")?.text;
      assert.ok(spec.bodyText);
      preservedPages.push({ href, fingerprint: fingerprint(body), version: body.version });
    }
  }
  result.secondaryDetailSampling = { method: "Deterministic first, second, middle and last; selected initial details are verified separately",
    collections: specs.filter((spec) => spec.secondary).map((spec) => ({ kind: spec.kind, completeListCount: spec.secondary.listIds.length,
      sampledIds: spec.secondary.journeyIds })),
    ...(secondary ? { resolvedFeedbackIds: secondaryJourneyIds(secondary.readiness.feedback.listIds.filter((id) =>
      !specs.find((spec) => spec.kind === "feedback").secondary.listIds.includes(id))) } : {}) };
  if (process.argv.includes("--electron")) {
    userData = await mkdtemp(path.join(tmpdir(), "minddy-min683-restored-"));
    const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    Object.assign(env, { MINDDY_DESKTOP_ORIGIN: base, MINDDY_DESKTOP_TEST_USER_DATA: userData });
    executableStart = performance.now();
    browser = await _electron.launch({ args: [`--user-data-dir=${userData}`, path.resolve("desktop")], cwd: path.resolve("desktop"), env, timeout: 30000 });
    const processReadyMs = performance.now() - executableStart;
    const runtime = await browser.evaluate(({ app, BrowserWindow }) => ({ packaged: app.isPackaged, userData: app.getPath("userData"), sessionData: app.getPath("sessionData"),
      electron: process.versions.electron, chromium: process.versions.chrome,
      windows: BrowserWindow.getAllWindows().map((window) => ({ id: window.id, visible: window.isVisible(), loading: window.webContents.isLoading(), hasLoadedURL: !!window.webContents.getURL() })) }));
    assert.equal(runtime.packaged, false);
    assert.equal(path.resolve(runtime.userData), userData);
    assert.equal(path.resolve(runtime.sessionData), userData);
    result.versions = { electron: runtime.electron, chromium: runtime.chromium };
    result.executableStartup = { processReadyMs, firstWindowMainProcessObservedMs: performance.now() - executableStart,
      mainProcessWindowsBeforeCookieSetup: runtime.windows, authenticationInjectionExcluded: true,
      executableToUsefulInterfaceMs: null, totalExecutableUsefulnessPending: true,
      authentication: "Fixture cookies are injected after process launch; renderer navigation is measured separately" };
    context = browser.context();
  } else {
    browser = await chromium.launch({ headless: !process.argv.includes("--headful") });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", locale: "en-US" });
    page = await context.newPage();
    result.versions = { chromium: browser.version() };
  }
  await context.addCookies(session.cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
  if (process.argv.includes("--electron")) {
    result.executableStartup.cookieSetupCompleteMs = performance.now() - executableStart;
    const afterCookies = await browser.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => ({ id: window.id,
      visible: window.isVisible(), loading: window.webContents.isLoading(), hasLoadedURL: !!window.webContents.getURL() })));
    // An existing or in-flight renderer could already have consumed its auth
    // state. Only an absent renderer proves cookies preceded its initial load.
    const cookiesPrecededInitialLoad = result.executableStartup.mainProcessWindowsBeforeCookieSetup.length === 0 && afterCookies.length === 0;
    result.executableStartup.cookieInjectionPrecededInitialRendererLoad = cookiesPrecededInitialLoad;
    page = await browser.firstWindow();
    result.executableStartup.playwrightPageObservedMs = performance.now() - executableStart;
    if (cookiesPrecededInitialLoad) {
      const initialHome = await page.waitForFunction(() => location.pathname === "/home" && document.visibilityState === "visible" &&
        [...document.querySelectorAll('[contenteditable="true"][aria-placeholder*="Numo"]')].some((node) => node.getClientRects().length && !node.closest('[inert]')) &&
        [...document.querySelectorAll('h1')].some((node) => node.getClientRects().length), null, { timeout: 10000 }).then(() => true, () => false);
      if (initialHome) {
        await frames();
        Object.assign(result.executableStartup, { authenticationInjectionExcluded: false, totalExecutableUsefulnessPending: false,
          executableToUsefulInterfaceMs: performance.now() - executableStart, initialHomeVerified: true });
      }
    }
  }
  const probe = ({ boardSource, readinessSource, preparationSource, preparationSpecs, loadingSelector }) => {
    if (window.__restored) return;
    localStorage.setItem("cookie_consent", "declined");
    window.__restored = { loadingSelector, longTasks: [], sample: null,
      boardReady: new Function(`return (${boardSource})`)(), ready: new Function(`return (${readinessSource})`)() };
    try { new PerformanceObserver((list) => window.__restored.longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))).observe({ type: "longtask", buffered: true }); } catch { /* Optional performance API. */ }
    const preparation = new Function(`return (${preparationSource})`)();
    setTimeout(() => {
      try { window.__restored.preparationAtThreeSeconds = preparation(preparationSpecs); }
      catch (error) { window.__restored.preparationAtThreeSeconds = { targetRefreshAgeMs: 3000, observedRefreshAgeMs: performance.now(), error: error.message }; }
    }, Math.max(0, 3000 - performance.now()));
  };
  const probeArgs = { boardSource: boardReady.toString(), readinessSource: restoredDestinationReady.toString(),
    preparationSource: restoredPreparationMetadata.toString(), preparationSpecs: specs.map(({ id, kind, href, projectId, pageId, prId, title, bodyText }) =>
      ({ id, kind, href, projectId, pageId, prId, title, bodyText })), loadingSelector: RESTORED_LOADING_SELECTOR };
  await context.addInitScript(probe, probeArgs);
  await page.addInitScript(probe, probeArgs);
  const inputProbeArgs = { owner: fixture.userId, tabIds: specs.map((spec) => spec.id), wrapActivate: process.argv.includes("--trace-session-activate") };
  await context.addInitScript(installRestoredInputDiagnostic, inputProbeArgs);
  await page.addInitScript(installRestoredInputDiagnostic, inputProbeArgs);
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("requestfinished", (req) => {
    if (!req.url().startsWith(base)) return;
    const task = (async () => {
      const response = await req.response();
      if (req.method() === "POST" && new URL(req.url()).pathname === "/api/me/app-tabs" && response?.ok()) {
        const body = req.postDataJSON();
        if (typeof body?.id === "string") rendererCreatedTabs.add(body.id);
      }
      const retryAfter = await response?.headerValue("retry-after");
      const pr = forge.prs.find((entry) => new URL(req.url()).pathname === `/api/pull-requests/${entry.prId}`);
      if (pr && req.method() === "GET" && response?.ok()) {
        const body = await response.json();
        const capability = body.viewer?.capability;
        if (typeof capability === "string") {
          const canComment = ["read", "write"].includes(capability);
          (result.prPermissions ??= {})[pr.prId] = { capability, canComment, source: "actual-renderer-detail-response" };
          const spec = specs.find((entry) => entry.kind === "pr");
          if (spec.prId === pr.prId) spec.canComment = canComment;
          await page.evaluate(({ prId, canComment }) => {
            if (window.__restored) (window.__restored.prPermissions ??= {})[prId] = canComment;
          }, { prId: pr.prId, canComment });
        }
      }
      result.network.push({ path: new URL(req.url()).pathname, method: req.method(), status: response?.status(), ...req.timing(),
        ...(retryAfter === null || retryAfter === undefined ? {} : { retryAfter }) });
    })().catch((error) => result.errors.push(`Network probe: ${error.message}`)).finally(() => pendingNetwork.delete(task));
    pendingNetwork.add(task);
  });
  page.on("requestfailed", (req) => result.network.push({ path: new URL(req.url()).pathname, method: req.method(), failed: req.failure()?.errorText, ...req.timing() }));
  const cdp = await context.newCDPSession(page);
  if (traceRequestInitiators) {
    result.requestInitiators = { diagnosticOnly: true, maximumEvents: 5000, droppedEvents: 0, events: [] };
    cdp.on("Network.requestWillBeSent", (event) => {
      const metadata = restoredRequestInitiatorMetadata(event, base);
      if (!metadata) return;
      if (result.requestInitiators.events.length < result.requestInitiators.maximumEvents) result.requestInitiators.events.push(metadata);
      else result.requestInitiators.droppedEvents++;
    });
    await cdp.send("Network.enable");
  }
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const metricDelta = (before, after) => Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "LayoutCount", "RecalcStyleCount"]
    .map((key) => [key, after[key] - before[key]]));
  async function startup(name, refresh) {
    const start = performance.now();
    if (refresh) await page.reload({ waitUntil: "domcontentloaded" });
    else await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
    const rendererDOMLoadedMs = performance.now() - start;
    const spec = specs[0];
    await page.waitForFunction((spec) => window.__restored.ready(spec), spec, { polling: "raf" });
    await frames();
    const driverMs = performance.now() - start;
    result.measurements.push({ name, driverMs, rendererDOMLoadedMs,
      navigation: await page.evaluate(() => {
        const entry = performance.getEntriesByType("navigation")[0];
        return { pathname: location.pathname, timeOrigin: performance.timeOrigin, domContentLoadedEventEnd: entry.domContentLoadedEventEnd, responseEnd: entry.responseEnd,
          longTasks: window.__restored.longTasks };
      }) });
    if (!refresh && !result.immediateRefresh) {
      await page.waitForFunction(() => !!window.__restored.preparationAtThreeSeconds);
      result.launchPreparationAtThreeSeconds = await page.evaluate(() => window.__restored.preparationAtThreeSeconds);
    }
    assert.equal(await page.locator('[data-app-tab-id]').count(), specs.length, "All stable tabs must be restored");
    return driverMs;
  }
  await startup("authenticated-renderer-launch", false);
  result.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio }));
  const launchRemaining = result.immediateRefresh ? 0 : await page.evaluate(() => Math.max(0, 3000 - performance.now()));
  if (launchRemaining) await page.waitForTimeout(launchRemaining);
  await startup("refresh-full-board", true);
  // Navigation timeOrigin begins at refresh, so the first click has a precise
  // lower bound of three seconds without adding three seconds after readiness.
  const remaining = await page.evaluate(() => Math.max(0, 3000 - performance.now()));
  if (remaining) await page.waitForTimeout(remaining);
  await page.waitForFunction(() => !!window.__restored.preparationAtThreeSeconds);
  result.refreshPreparationAtThreeSeconds = await page.evaluate(() => window.__restored.preparationAtThreeSeconds);
  result.preparationAtFirstActivation = await page.evaluate(() => ({ sinceRefreshMs: performance.now(),
    resources: performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).origin === location.origin)
      .map((entry) => ({ path: new URL(entry.name).pathname, startTime: entry.startTime, responseEnd: entry.responseEnd })) }));
  async function activate(spec, name, target, afterInput) {
    const prerequisite = `${spec.id}:${spec.detailId ?? "initial"}:${spec.prSubview ?? "default"}`;
    if (failedPrerequisites.has(prerequisite)) {
      result.measurements.push({ name, destination: spec.custom_name, kind: spec.kind, status: "blocked-by-prerequisite",
        prerequisiteFailure: failedPrerequisites.get(prerequisite) });
      return;
    }
    const before = await metrics();
    const locator = target ?? page.locator(`[data-app-tab-id="${spec.id}"]`);
    await locator.scrollIntoViewIfNeeded();
    await frames();
    const box = await locator.boundingBox();
    assert.ok(box, `Stable tab has no click target: ${spec.custom_name}`);
    assert.ok(box.x + box.width / 2 >= 0 && box.x + box.width / 2 < result.viewport.width, "The click must land in the viewport");
    await page.evaluate((spec) => {
      window.__restored.sample = null;
      if (window.__restored.collectionProof) delete window.__restored.collectionProof[spec.id];
      document.addEventListener("pointerdown", (event) => {
        if (!event.isTrusted) return;
        const sample = window.__restored.sample = { start: performance.now(), timeOrigin: performance.timeOrigin, contentMs: null, paintMs: null, loadingFrames: 0, status: "waiting" };
        const observe = () => {
          if (window.__restored.sample !== sample || sample.stopped) return;
          const visible = (node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden" && !node.closest('[inert], [aria-hidden="true"]');
          if ([...document.querySelectorAll(window.__restored.loadingSelector)].some(visible)) sample.loadingFrames++;
          if ([...document.querySelectorAll('h1, h2, h3, p')].some((node) => visible(node) && node.textContent.trim() === "Numo work is unavailable")) {
            sample.status = "unsupported-plan-gate"; sample.contentMs = performance.now() - sample.start; sample.paintMs = sample.contentMs; return;
          }
          if (spec.unavailableTitles?.some((title) => [...document.querySelectorAll('h1, h2, h3, p')].some((node) => visible(node) && node.textContent.trim() === title))) {
            sample.status = "unsupported-instance-or-account"; sample.contentMs = performance.now() - sample.start; sample.paintMs = sample.contentMs; return;
          }
          if (!window.__restored.ready(spec)) { requestAnimationFrame(observe); return; }
          sample.contentMs = performance.now() - sample.start;
          requestAnimationFrame(() => requestAnimationFrame(() => { sample.paintMs = performance.now() - sample.start; sample.status = "complete"; }));
        };
        requestAnimationFrame(observe);
      }, { capture: true, once: true });
    }, spec);
    const inputBefore = await page.evaluate((input) => window.__restoredInput.arm(input), { expectedTabId: spec.id, kind: spec.kind, name,
      x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 25), driverRect: box });
    const driverStart = performance.now();
    // A single CDP sequence prevents mouseenter intent from preceding the click.
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 25), button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 25), button: "left", clickCount: 1 });
    await afterInput?.();
    let error;
    try { await page.waitForFunction(() => window.__restored.sample?.paintMs != null, null, { polling: "raf", timeout: 10000 }); }
    catch (cause) { error = cause; await page.evaluate(() => { if (window.__restored.sample) window.__restored.sample.stopped = true; }); }
    const sample = await page.evaluate((spec) => {
      const sample = window.__restored.sample;
      return { ...sample, longTasks: window.__restored.longTasks.filter((entry) => sample && entry.startTime >= sample.start),
        resources: performance.getEntriesByType("resource").filter((entry) => sample && new URL(entry.name).origin === location.origin && entry.startTime >= sample.start)
          .map((entry) => ({ path: new URL(entry.name).pathname, startMs: entry.startTime - sample.start, responseEndMs: entry.responseEnd - sample.start, transferSize: entry.transferSize })),
        visibility: document.visibilityState, selectedTab: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId,
        activeReadState: document.querySelector('[data-app-view-active="true"]')?.dataset.boardReadState ?? null,
        visibleReadPhases: [...document.querySelectorAll('[data-query-read-phase]')].filter((node) =>
          node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]')).map((node) => node.dataset.queryReadPhase),
        ...(spec.kind === "pr" ? { prBusinessState: { prId: spec.prId, canComment: window.__restored.prPermissions?.[spec.prId] ?? null,
          source: window.__restored.prPermissions?.[spec.prId] === undefined ? "unobserved" : "actual-renderer-detail-response" } } : {}),
        ...(spec.secondary ? { collectionProof: window.__restored.collectionProof?.[spec.id] ?? null } : {}),
        usableControls: { editableInputs: [...document.querySelectorAll('textarea, [contenteditable="true"]')].filter((node) =>
          node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]') && !node.disabled && !node.readOnly).length,
          disabledButtons: [...document.querySelectorAll('button:disabled, button[aria-disabled="true"]')].filter((node) =>
            node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]')).length },
        visibleContent: [...document.querySelectorAll('h1, h2, h3, p')].filter((node) => node.getClientRects().length && !node.closest('[inert]')).map((node) => node.textContent.trim()).filter(Boolean).slice(0, 8) };
    }, spec);
    // Fixture text is allowed for diagnosis; never persist arbitrary shared data.
    delete sample.visibleContent;
    if (!error && sample.selectedTab !== spec.id) error = new Error("Pointer input did not activate the intended stable tab");
    if (error) sample.failureDiagnostics = await page.evaluate(({ source, spec }) => new Function(`return (${source})`)()(spec),
      { source: restoredFailureDiagnostics.toString(), spec }).catch((cause) => ({ probeError: cause.message }));
    const inputAfter = await page.evaluate(() => window.__restoredInput.read());
    const knownVisiblePage = specs.find((candidate) => candidate.kind === "page" && new URL(candidate.href, base).pathname === new URL(page.url()).pathname);
    if (error && knownVisiblePage && await page.locator(`[data-app-view-active="true"] [data-page-surface-id="${knownVisiblePage.pageId}"]:visible`).count() === 1) {
      const screenshot = `${label}-sample-${result.measurements.length}-fixture-page.png`;
      await page.locator('[data-app-view-active="true"]').screenshot({ path: path.join(output, screenshot) }).then(() => { sample.diagnosticScreenshot = screenshot; },
        (cause) => { sample.diagnosticScreenshotError = cause.name; });
    }
    result.measurements.push({ inputDiagnostic: { before: inputBefore, after: inputAfter }, name, destination: spec.custom_name, kind: spec.kind, ...(spec.detailId ? { detailId: spec.detailId } : {}),
      ...(spec.prSubview ? { prSubview: spec.prSubview } : {}), ...sample,
      driverMs: performance.now() - driverStart, thread: metricDelta(before, await metrics()),
      ...(error ? { status: "failed", error: error.message.split("\n")[0] } : {}) });
    if (error) failedPrerequisites.set(prerequisite, { name, error: error.message.split("\n")[0] });
    if (sample.status === "unsupported-plan-gate") result.limitations.push(`${spec.custom_name}: account plan gate prevents measuring its content.`);
    if (sample.status === "unsupported-instance-or-account") result.limitations.push(`${spec.custom_name}: instance or account requirements prevent measuring its content.`);
    console.log(JSON.stringify({ name, destination: spec.custom_name, status: error ? "failed" : sample.status, paintMs: sample.paintMs }));
  }
  for (const spec of specs.slice(1)) await activate(spec, "first-restored-activation");
  for (let round = 0; round < repeats; round++) {
    for (const spec of specs) await activate(spec, "restored-alternation");
  }
  const prSpec = specs.find((entry) => entry.kind === "pr");
  await activate(prSpec, "pr-subview-journey-entry");
  if (result.measurements.at(-1)?.status === "complete") {
    await activate({ ...prSpec, prSubview: "files" }, "pr-first-complete-files",
      page.getByRole("tab", { name: /^Changes/ }));
    if (result.measurements.at(-1)?.status === "complete") {
      await activate({ ...prSpec, prSubview: "commits" }, "pr-open-complete-commits", page.getByTestId("pr-commits-trigger"));
      await page.keyboard.press("Escape");
    }
    await activate(prSpec, "pr-return-complete-activity", page.getByRole("tab", { name: /^Description and activity/ }));
  }
  // Detail journeys run after ordinary tab alternation so these extra reads
  // cannot make first activation or restored-tab preparation appear faster.
  for (const spec of specs.filter((entry) => entry.secondary)) {
    await activate(spec, "secondary-detail-journey-entry");
    const parameter = spec.kind === "triage" ? "issue" : spec.kind === "feedback" ? "post" : "open";
    for (const detail of spec.secondary.details.filter((entry) => spec.secondary.journeyIds.includes(entry.id))) {
      const href = `/projects/${spec.projectId}/${spec.kind}?${parameter}=${encodeURIComponent(detail.id)}`;
      if (await page.locator(`[data-navigation-href="${href}"][aria-current="true"]:visible`).count()) continue;
      await activate({ ...spec, detailId: detail.id }, "secondary-first-detail-switch",
        page.locator(`[data-navigation-href="${href}"]:visible`));
    }
    if (spec.kind === "feedback") {
      const allSpec = { ...spec, secondary: secondaryReadiness(secondary, "feedback", { allFeedback: true }) };
      const filter = async (label, readySpec, name) => {
        await page.getByRole("button", { name: /^Filter feedback/ }).click();
        const trigger = page.getByRole("menuitem", { name: /^State/ });
        await trigger.hover();
        const triggerId = await trigger.getAttribute("id");
        assert.ok(triggerId, "The State submenu needs its accessible owner");
        const menu = page.locator(`[role="menu"][aria-labelledby="${triggerId}"]`);
        await menu.waitFor({ state: "visible" });
        // "Open" names both the unresolved group and one concrete status.
        // The group has no status icon inside its label; the concrete status does.
        const choice = menu.getByRole("menuitem", { name: label, exact: true }).filter({ hasNot: page.locator(":scope > span > svg") });
        assert.equal(await choice.count(), 1, "Resolve the aggregate feedback state without a positional fallback");
        await activate(readySpec, name, choice, async () => {
          await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
        });
      };
      await filter("All", allSpec, "secondary-feedback-show-all-and-dismiss-filter");
      const resolvedSamples = secondaryJourneyIds(allSpec.secondary.listIds.filter((id) => !spec.secondary.listIds.includes(id)));
      for (const detail of allSpec.secondary.details.filter((entry) => resolvedSamples.includes(entry.id))) {
        const href = `/projects/${spec.projectId}/feedback?post=${encodeURIComponent(detail.id)}`;
        await activate({ ...allSpec, detailId: detail.id }, "secondary-first-resolved-feedback-detail",
          page.locator(`[data-navigation-href="${href}"]:visible`));
      }
      await filter("Open", spec, "secondary-feedback-restore-open-and-dismiss-filter");
    }
  }
  // Disable Playwright's focus override, then transfer actual native focus.
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  result.focusProtocol = { focusEmulationDisabled: true, genuineWindowMinimization: process.argv.includes("--electron"),
    genuineDistractionWindow: !process.argv.includes("--electron") && !genuineFocus,
    genuineSameWindowTab: !process.argv.includes("--electron") && genuineFocus,
    playwrightBackgroundThrottlingOverridesRemain: true };
  if (process.argv.includes("--electron")) await browser.evaluate(({ BrowserWindow }, base) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().startsWith(base));
    if (!window) throw new Error("Missing fixture renderer window");
    window.minimize(); window.blur();
  }, session.base);
  else {
    browserCdp = await browser.newBrowserCDPSession();
    if (genuineFocus) {
      await page.bringToFront();
      await page.waitForFunction(() => document.hasFocus());
      result.focusProtocol.before = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState }));
    }
    const { targetInfo } = await cdp.send("Target.getTargetInfo");
    originalTargetId = targetInfo.targetId;
    const incoming = context.waitForEvent("page", { predicate: (candidate) => candidate !== page, timeout: 20000 })
      .then((created) => ({ page: created }), (error) => ({ error }));
    ({ targetId: distractionTargetId } = await browserCdp.send("Target.createTarget", { url: "about:blank", newWindow: !genuineFocus, background: false,
      ...(targetInfo.browserContextId ? { browserContextId: targetInfo.browserContextId } : {}) }));
    const opened = await incoming;
    if (opened.error) throw opened.error;
    if (genuineFocus) await opened.page.waitForLoadState("load");
    const distractionCdp = await context.newCDPSession(opened.page);
    if (genuineFocus) await Promise.all([cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false }),
      distractionCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false })]);
    else await distractionCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
    const originalWindow = await browserCdp.send("Browser.getWindowForTarget", { targetId: originalTargetId });
    const distractionWindow = await browserCdp.send("Browser.getWindowForTarget", { targetId: distractionTargetId });
    if (genuineFocus) assert.equal(originalWindow.windowId, distractionWindow.windowId);
    else assert.notEqual(originalWindow.windowId, distractionWindow.windowId);
    result.focusProtocol.windows = { originalWindowId: originalWindow.windowId, distractionWindowId: distractionWindow.windowId };
    await browserCdp.send("Target.activateTarget", { targetId: distractionTargetId });
    if (genuineFocus) await opened.page.bringToFront();
  }
  const absenceObserved = await page.waitForFunction((strict) => strict ? !document.hasFocus() : document.visibilityState === "hidden" || !document.hasFocus(), genuineFocus, { timeout: 5000 }).then(() => true, () => false);
  const away = await page.evaluate(() => ({ hidden: document.visibilityState === "hidden", focused: document.hasFocus(), start: performance.now(), wallClock: Date.now() }));
  await page.waitForTimeout(inactiveMs);
  const awayBeforeResume = genuineFocus ? await page.evaluate(() => ({ hidden: document.visibilityState === "hidden", focused: document.hasFocus(), at: performance.now(), wallClock: Date.now() })) : null;
  const resumeStart = performance.now();
  if (process.argv.includes("--electron")) await browser.evaluate(({ BrowserWindow }, base) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().startsWith(base));
    window.restore(); window.show(); window.focus();
  }, session.base);
  else {
    await browserCdp.send("Target.activateTarget", { targetId: originalTargetId });
    if (genuineFocus) await page.bringToFront();
  }
  const resumeObserved = await page.waitForFunction(() => document.visibilityState === "visible" && document.hasFocus(), null, { timeout: 5000 }).then(() => true, () => false);
  const resumed = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), at: performance.now() }));
  result.focus = { away, resumed, driverResumeMs: performance.now() - resumeStart, receivedRemoteMutation: false,
    absenceObserved, resumeObserved, validFocusTransition: absenceObserved && resumeObserved && (away.hidden || !away.focused) && resumed.visibility === "visible" && resumed.focused };
  if (genuineFocus) {
    result.focus.awayBeforeResume = awayBeforeResume;
    result.focus.observedIntervalMs = { renderer: awayBeforeResume.at - away.start, wallClock: awayBeforeResume.wallClock - away.wallClock };
    result.focus.configuredInactiveMs = inactiveMs;
    result.focus.validFocusTransition = result.focus.validFocusTransition && result.focusProtocol.before?.focused === true && !away.focused &&
      !awayBeforeResume.focused && result.focus.observedIntervalMs.renderer >= inactiveMs && result.focus.observedIntervalMs.wallClock >= inactiveMs;
  }
  result.focusInputDiagnostic = await page.evaluate(() => window.__restoredInput.read());
  if (!result.focus.validFocusTransition) result.limitations.push("The runtime did not expose an actual focus/visibility transition; focus recovery is unvalidated.");
  if (distractionTargetId) {
    await browserCdp.send("Target.closeTarget", { targetId: distractionTargetId });
    distractionTargetId = null;
  }
  if (genuineFocus) assert.ok(result.focus.validFocusTransition, "The genuine-focus variant requires observed real absence and return");
  for (const spec of specs) await activate(spec, "focus-return-navigation");
  await Promise.allSettled(pendingNetwork);
  result.preparedDestinations = specs.map((spec) => ({ id: spec.id, kind: spec.kind, firstActivationComplete: spec === specs[0] ||
    result.measurements.find((sample) => sample.name === "first-restored-activation" && sample.destination === spec.custom_name)?.status === "complete" }));
  result.summaries = [];
  for (const name of new Set(result.measurements.map((sample) => sample.name))) {
    for (const destination of new Set(result.measurements.filter((sample) => sample.name === name).map((sample) => sample.destination ?? "startup"))) {
      const group = result.measurements.filter((sample) => sample.name === name && (sample.destination ?? "startup") === destination);
      const samples = group.filter((sample) => sample.status === "complete" || sample.driverMs !== undefined && sample.contentMs === undefined && sample.status === undefined)
        .map((sample) => sample.paintMs ?? sample.driverMs).sort((a, b) => a - b);
      result.summaries.push({ name, destination, samples: samples.length, failed: group.filter((sample) => sample.status === "failed").length,
        unsupported: group.filter((sample) => sample.status?.startsWith("unsupported")).length,
        ...(samples.length ? { p50: samples[Math.ceil(samples.length * 0.5) - 1], p95: samples.length >= 10 ? samples[Math.ceil(samples.length * 0.95) - 1] : null, max: samples.at(-1) } : {}) });
    }
  }
  result.acceptance = { startupWithinThreeSeconds: result.measurements.filter((sample) => ["authenticated-renderer-launch", "refresh-full-board"].includes(sample.name)).every((sample) => sample.driverMs <= 3000),
    allFirstRestoredActivationsComplete: result.measurements.filter((sample) => sample.name === "first-restored-activation").every((sample) => sample.status === "complete"),
    noCommonNavigationAbove300ms: result.measurements.filter((sample) => sample.contentMs !== undefined).every((sample) => sample.status === "complete" && sample.paintMs <= 300),
    dailyFeelValidated: false };
  result.status = result.measurements.some((sample) => sample.status === "failed") ? "failed" : "complete-with-open-acceptance";
} catch (error) {
  failure = error;
  result.status = "failed";
  result.failure = error.stack;
  if (page && !page.isClosed()) result.failureSnapshot = await page.evaluate(() => ({ pathname: location.pathname,
    selectedTab: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId,
    tabIds: [...document.querySelectorAll('[data-app-tab-id]')].map((node) => node.dataset.appTabId),
    activeReadState: document.querySelector('[data-app-view-active="true"]')?.dataset.boardReadState,
    visibleLoading: [...document.querySelectorAll(window.__restored?.loadingSelector ?? '[data-slot="skeleton"]')]
      .filter((node) => node.getClientRects().length && !node.closest('[inert]')).map((node) => ({ slot: node.dataset.slot, testid: node.dataset.testid, role: node.getAttribute("role") })) })).catch(() => null);
} finally {
  await Promise.allSettled(pendingNetwork);
  if (result.runnerSourceHash) {
    result.runnerSourcesUnchanged = await runnerHash().then((current) => current === result.runnerSourceHash, () => false);
    if (!result.runnerSourcesUnchanged) { result.status = "failed"; failure ??= new Error("Measurement dependencies changed while the run was active"); result.cleanup.push({ error: failure.message }); }
  }
  if (distractionTargetId) await browserCdp?.send("Target.closeTarget", { targetId: distractionTargetId }).catch(() => {});
  if (browser) await browser.close().catch((error) => result.cleanup.push({ error: `Browser close: ${error.message}` }));
  if (session && originalTabs) {
    try {
      const { api, fixture } = session;
      const known = new Set(originalTabs.map((tab) => tab.id));
      for (const tab of await api("/api/me/app-tabs")) {
        assert.equal(tab.user_id, fixture.userId);
        if (!known.has(tab.id)) {
          assert.ok(rendererCreatedTabs.has(tab.id), "Refusing to remove a tab not created by this runner's renderer");
          await api(`/api/me/app-tabs/${tab.id}`, "DELETE", { revision: tab.revision });
          result.cleanup.push({ removedTemporaryRendererTab: tab.id });
        }
      }
      for (const original of originalTabs) {
        const tab = (await api("/api/me/app-tabs")).find((value) => value.id === original.id);
        assert.ok(tab, "A stable tab must not disappear");
        assert.deepEqual(tabFields(tab), tabFields(original), "Preserve stable tab metadata");
        if (tab.href !== original.href) await api(`/api/me/app-tabs/${tab.id}`, "PATCH", { revision: tab.revision, patch: { href: original.href } });
      }
      await assertStableTabs(api, fixture, stableTabs(fixture, forge));
      for (const preserved of preservedPages) assert.equal(fingerprint(await api(preserved.href)), preserved.fingerprint, "Preserve complete Page content and versions");
      if (secondary) assert.deepEqual(secondaryEvidence(await optionalSecondaryWorkload(api, fixture)), secondaryEvidence(secondary), "Preserve the populated fixture and all recorded content fingerprints");
      if (connectedBoard) assert.deepEqual(await loadConnectedBoardWorkload(api, fixture, secondary), connectedBoard, "Preserve all original, added and shared issue source data");
      const { link } = await api(`/api/projects/${forge.project}/git-link`);
      assert.equal(forgeLinkFingerprint(link), forge.linkFingerprint, "Preserve the main GitHub connection");
      result.cleanup.push({ stableTabCount: originalTabs.length, tabMetadataAndDestinationsRestored: true, pagesUnchanged: true, githubConnectionPreserved: true });
    } catch (error) { result.cleanup.push({ error: error.message }); result.status = "failed"; failure ??= error; }
  }
  await session?.close();
  if (userData) await rm(userData, { recursive: true, force: true });
  result.finishedAt = new Date().toISOString();
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ resultPath, status: result.status, measurements: result.measurements.length, acceptance: result.acceptance }));
}
if (failure || result.status === "failed") process.exitCode = 1;
