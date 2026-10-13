import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron } from "playwright";
import { openFixture, stableTabs, stableManifestPath, assertStableTabs } from "./stable-restored-tabs.mjs";
import { loadConnectedBoardWorkload, loadForgeWorkload, forgeLinkFingerprint } from "./measure-forge-navigation.mjs";
import { optionalSecondaryWorkload, secondaryEvidence } from "./secondary-navigation-workload.mjs";
import { boardReady } from "./board-readiness.mjs";
import { restoredPreparationMetadata } from "./restored-navigation-readiness.mjs";

// Setup authenticates only a disposable fixture profile. Measured launches
// reuse its persisted cookies and natural desktop entry without injection,
// goto, refresh, tab reordering or a stitched renderer-navigation stopwatch.
const label = process.env.MINDDY_PERF_LABEL ?? "min683-executable-startup";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const repeats = Number(process.env.MINDDY_PERF_REPEATS ?? 1);
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 3);
const output = path.resolve("output/playwright/performance");
await mkdir(output, { recursive: true });
const resultPath = path.join(output, `${label}.json`);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const result = { label, protocol: "min683-real-executable-startup-v1", timestamp: new Date().toISOString(), repeats,
  status: "running", setupExcluded: true, launches: [], errors: [], cleanup: [],
  limitations: ["Unpackaged Electron uses the real executable and desktop entry, but is not an installed signed-release launch.",
    "Two animation frames establish a paint opportunity, not a hardware pixel presentation timestamp.",
    "One to three launches do not establish population p95."] };
let session, browser, page, userData, originalTabs, specs, forge, connectedBoard, secondary, failure;
const originalPages = [];
const createdTabs = new Set();
const processDeadlineObservations = new Set();
const tabFields = ({ id, user_id, custom_name, pinned, position, href }) => ({ id, user_id, custom_name, pinned, position, href });
const authCookieMetadata = (cookies) => cookies.filter((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))
  .map(({ name, domain, path, expires, httpOnly, secure, sameSite }) => ({ name, domain, path, expires, httpOnly, secure, sameSite }));
function persistentCookies(values, base) {
  const hostname = new URL(base).hostname;
  const now = Date.now() / 1000;
  return values.filter(({ value }) => value).map(({ name, value, options = {} }) => {
    // Preserve the SSR cookie lifetime/options. Its documented default is
    // 400 days (@supabase/ssr/src/utils/constants.ts); session cookies would
    // disappear at process exit and invalidate a restart measurement.
    const expires = options.expires ? new Date(options.expires).getTime() / 1000 : now + (options.maxAge ?? 400 * 24 * 60 * 60);
    assert.ok(Number.isFinite(expires) && expires > now, "Setup requires a persistent, unexpired fixture cookie");
    if (options.domain) assert.ok(hostname === options.domain.replace(/^\./, ""), "Do not carry another origin's cookie");
    const sameSite = options.sameSite === true ? "Strict" : typeof options.sameSite === "string"
      ? options.sameSite[0].toUpperCase() + options.sameSite.slice(1).toLowerCase() : "Lax";
    return { name, value, domain: hostname, path: options.path ?? "/", expires,
      secure: options.secure ?? new URL(base).protocol === "https:", httpOnly: options.httpOnly ?? false, sameSite };
  });
}
try {
  session = await openFixture();
  const { api, fixture, base } = session;
  forge = await loadForgeWorkload(api);
  secondary = await optionalSecondaryWorkload(api, fixture);
  connectedBoard = await loadConnectedBoardWorkload(api, fixture, secondary);
  result.protocol = "min683-real-executable-startup-v3-fixed-process-preparation";
  result.workload = { connectedBoard, forge, fixtureCounts: fixture.counts, secondary: secondaryEvidence(secondary) };
  specs = stableTabs(fixture, forge);
  for (const spec of specs.filter((entry) => entry.kind === "pr")) spec.prId = forge.prs[0].prId;
  const manifest = JSON.parse(await readFile(stableManifestPath, "utf8"));
  assert.equal(manifest.userId, fixture.userId); assert.equal(manifest.email, fixture.email);
  assert.deepEqual(manifest.specs, specs.map(({ prId: _prId, ...spec }) => spec));
  originalTabs = await assertStableTabs(api, fixture, specs);
  for (const spec of specs.filter((spec) => spec.kind === "page")) {
    const href = `/api/projects/${spec.projectId}/pages/${spec.pageId}`;
    const body = await api(href);
    assert.equal(body.id, spec.pageId); assert.equal(body.project_id, spec.projectId);
    spec.title = body.title;
    spec.bodyText = body.content.content.find((block) => block.type === "paragraph")?.content?.find((node) => node.type === "text")?.text;
    assert.ok(spec.bodyText);
    originalPages.push({ href, fingerprint: hash(body), version: body.version });
  }
  const productRoot = process.env.MINDDY_PERF_BUILD_ROOT ?? process.cwd();
  const build = (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim();
  const product = JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8"));
  assert.equal(product.build, build, "The measured build must have an explicit matching source manifest");
  assert.match(product.sha, /^[a-f0-9]{40}$/);
  result.runnerSourceHashScope = ["measure-executable-startup.mjs", "board-readiness.mjs", "stable-restored-tabs.mjs", "measure-forge-navigation.mjs",
    "secondary-navigation-workload.mjs", "enrich-secondary-workload.mjs", "seed.mjs", "restored-navigation-readiness.mjs"];
  Object.assign(result, { build, product, runnerSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    runnerSourceHash: hash(await Promise.all(result.runnerSourceHashScope.map((file) => readFile(path.resolve("scripts/performance", file), "utf8")))),
    fixture: { account: fixture.email, userId: fixture.userId, stableTabCount: specs.length, globalCards: connectedBoard.cards } });
  userData = await mkdtemp(path.join(tmpdir(), "minddy-min683-startup-"));
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, { MINDDY_DESKTOP_ORIGIN: base, MINDDY_DESKTOP_TEST_USER_DATA: userData });
  const launchArgs = { args: [`--user-data-dir=${userData}`, path.resolve("desktop")], cwd: path.resolve("desktop"), env, timeout: 30000 };
  const cookieSetup = persistentCookies(session.cookies, base);
  assert.ok(authCookieMetadata(cookieSetup).length, "Fixture auth cookies must be recognizable without publishing values");
  const preparationArgs = { preparationSource: restoredPreparationMetadata.toString(), preparationSpecs: specs };
  const installProbe = ({ source, preparationSource, preparationSpecs }) => {
    if (window.__executableStartup) return;
    window.__executableStartup = { boardReady: new Function(`return (${source})`)(), longTasks: [], visibility: [] };
    document.addEventListener("visibilitychange", () => window.__executableStartup.visibility.push({ at: performance.now(), state: document.visibilityState }));
    try { new PerformanceObserver((list) => window.__executableStartup.longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))).observe({ type: "longtask", buffered: true }); }
    catch { /* Optional runtime performance API. */ }
    if (preparationSource) setTimeout(() => {
      try { window.__executableStartup.preparationAtRendererThreeSeconds = new Function(`return (${preparationSource})`)()(preparationSpecs); }
      catch (error) { window.__executableStartup.preparationAtRendererThreeSeconds = { targetRefreshAgeMs: 3000, observedRefreshAgeMs: performance.now(), error: error.message }; }
    }, Math.max(0, 3000 - performance.now()));
  };
  async function runtimeInfo() {
    const info = await browser.evaluate(({ app, BrowserWindow }) => ({ packaged: app.isPackaged, executable: process.execPath, userData: app.getPath("userData"), sessionData: app.getPath("sessionData"),
      electron: process.versions.electron, chromium: process.versions.chrome,
      windows: BrowserWindow.getAllWindows().map((window) => ({ id: window.id, visible: window.isVisible(), loading: window.webContents.isLoading() })) }));
    assert.equal(info.packaged, false); assert.equal(info.userData, userData); assert.equal(info.sessionData, userData);
    return info;
  }
  function observeRequests(context, target) {
    const pending = new Set();
    context.on("requestfinished", (req) => {
      if (!req.url().startsWith(base)) return;
      const task = (async () => {
        const response = await req.response();
        const pathname = new URL(req.url()).pathname;
        target.push({ path: pathname, method: req.method(), status: response?.status(), ...req.timing() });
        if (pathname === "/api/me/app-tabs" && req.method() === "POST" && response?.ok()) {
          const input = req.postDataJSON(); if (typeof input?.id === "string") createdTabs.add(input.id);
        }
      })().catch((error) => result.errors.push(`Request probe: ${error.message}`)).finally(() => pending.delete(task));
      pending.add(task);
    });
    context.on("requestfailed", (req) => target.push({ path: new URL(req.url()).pathname, method: req.method(), failed: req.failure()?.errorText, ...req.timing() }));
    return pending;
  }
  const ready = ({ all, home, cards, cardIds }) => {
    const tab = document.querySelector('[data-app-tab-id][aria-selected="true"]');
    if (document.querySelectorAll('[data-app-tab-id]').length !== 10 || !tab) return false;
    const visible = (node) => !!node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]');
    if (tab.dataset.appTabId === all && location.pathname === "/all") return window.__executableStartup.boardReady(cards, undefined, cardIds);
    if (tab.dataset.appTabId === home && location.pathname === "/home") return [...document.querySelectorAll('[contenteditable="true"][aria-placeholder*="Numo"]')].some(visible) && [...document.querySelectorAll("h1")].some(visible);
    return false;
  };
  const readiness = { all: specs.find((spec) => spec.kind === "all").id, home: specs.find((spec) => spec.kind === "home").id, cards: connectedBoard.cards, cardIds: connectedBoard.cardIds };
  async function visibleNativeWindow() {
    return browser.evaluate(async ({ BrowserWindow }, base) => {
      for (let attempt = 0; attempt < 300; attempt++) {
        const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().startsWith(base) && item.isVisible());
        if (window) return { visible: true, id: window.id };
        await new Promise((done) => setTimeout(done, 50));
      }
      throw new Error("The actual fixture BrowserWindow did not become visible");
    }, base);
  }
  // Excluded setup boot. No personal profile or principal-account cookie is
  // consulted; every server identity is checked against the marked fixture.
  const setupStart = performance.now();
  browser = await _electron.launch(launchArgs);
  await runtimeInfo();
  let context = browser.context();
  const setupRequests = [];
  result.setup = { excluded: true, requests: setupRequests, fixtureInitializationGoto: true };
  let pending = observeRequests(context, setupRequests);
  await context.addCookies(cookieSetup);
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", domain: new URL(base).hostname, path: "/", expires: Date.now() / 1000 + 86400, sameSite: "Lax" }]);
  // Match the ordinary fixture's device-only preference. Avoid answering the
  // native consent dialog through an account metadata write during setup.
  await context.addInitScript(() => localStorage.setItem("cookie_consent", "declined"));
  await context.addInitScript(installProbe, { source: boardReady.toString() });
  page = await browser.firstWindow();
  page.on("pageerror", (error) => result.errors.push(error.message));
  await page.evaluate(() => localStorage.setItem("cookie_consent", "declined"));
  // Cookie injection can race the excluded boot's initial auth redirect.
  // Establish a working fixture renderer here; measured restarts never navigate.
  await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
  await page.evaluate(installProbe, { source: boardReady.toString() });
  await page.waitForFunction(ready, readiness, { timeout: 30000, polling: "raf" });
  await visibleNativeWindow();
  const rendererTabs = await page.evaluate(async () => {
    const response = await fetch("/api/me/app-tabs");
    if (!response.ok) throw new Error("Fixture renderer session is unauthorized");
    return response.json();
  });
  assert.equal(rendererTabs.length, specs.length);
  assert.ok(rendererTabs.every((tab) => tab.user_id === fixture.userId && specs.some((spec) => spec.id === tab.id)));
  // Wait for the real server-sealed query-cache envelope, then leave the normal
  // five-second save/idle schedule time to include startup preparation.
  await page.waitForFunction((owner) => {
    try { const value = JSON.parse(localStorage.getItem("minddy.query-cache")); return value?.format === "minddy-local-v1" && value.owner === owner && typeof value.ciphertext === "string"; }
    catch { return false; }
  }, fixture.userId, { timeout: 30000 });
  await page.waitForTimeout(7000);
  await browser.evaluate(async ({ session }) => { await session.defaultSession.cookies.flushStore(); await session.defaultSession.flushStorageData(); });
  const persistedSetupCookies = await context.cookies(base);
  const authCookies = authCookieMetadata(persistedSetupCookies);
  assert.ok(authCookies.length && authCookies.every((cookie) => cookie.expires > Date.now() / 1000), "The auth cookie store must be persistent before restart");
  Object.assign(result.setup, { driverMs: performance.now() - setupStart, actualRendererFixtureIdentityVerified: true,
    stableTabsVerified: true, serverSealedCachePresent: true, cookiesExplicitlyFlushed: true, cookieMetadata: authCookies,
    excludedDeviceOnlyAnalyticsPreference: "declined",
    setupFinalPath: new URL(page.url()).pathname });
  await Promise.allSettled(pending);
  await browser.close(); browser = undefined;
  for (let round = 0; round < repeats; round++) {
    const sample = { round: round + 1, naturalDesktopEntryPath: "/home", cookieInjection: false, goto: false, requests: [], status: "running" };
    result.launches.push(sample);
    const start = performance.now();
    page = undefined;
    let measuredPage;
    const processObservation = new Promise((resolve) => setTimeout(async () => {
      const observation = sample.preparationAtProcessThreeSeconds = { targetProcessAgeMs: 3000,
        nodeTimerObservedProcessAgeMs: performance.now() - start, pageAvailable: !!measuredPage,
        electronConnectionAvailable: !!browser, windowExistenceWithoutObservedPage: "Not inferred" };
      if (!measuredPage) observation.unavailableReason = "No Playwright Page was observable at the process deadline";
      else {
        observation.rendererRequestSentProcessAgeMs = performance.now() - start;
        let responseTimeout;
        try {
          observation.renderer = await Promise.race([measuredPage.evaluate(({ preparationSource, preparationSpecs }) => ({
              ...new Function(`return (${preparationSource})`)()(preparationSpecs), targetRefreshAgeMs: null,
              observationBasis: "Process-launch deadline; the actual renderer age is recorded independently",
            }), preparationArgs), new Promise((_, reject) => {
              responseTimeout = setTimeout(() => reject(new Error("The process-deadline metadata response exceeded fifteen seconds")), 15000);
            })]);
        } catch (error) { observation.error = error.message; }
        finally { clearTimeout(responseTimeout); }
        observation.rendererResponseObservedProcessAgeMs = performance.now() - start;
      }
      resolve();
    }, 3000));
    processDeadlineObservations.add(processObservation);
    processObservation.finally(() => processDeadlineObservations.delete(processObservation));
    browser = await _electron.launch(launchArgs);
    sample.processReadyMs = performance.now() - start;
    context = browser.context();
    context.on("page", (observed) => { measuredPage ??= observed; });
    measuredPage ??= context.pages()[0];
    sample.runtime = await runtimeInfo();
    pending = observeRequests(context, sample.requests);
    const restartCookies = authCookieMetadata(await context.cookies(base));
    assert.ok(restartCookies.length && restartCookies.every((cookie) => cookie.expires > Date.now() / 1000), "Fixture auth cookies disappeared across executable restart");
    sample.cookiePersistenceVerified = true;
    sample.cookieMetadata = restartCookies;
    await context.addInitScript(installProbe, { source: boardReady.toString(), ...preparationArgs });
    page = await browser.firstWindow();
    measuredPage = page;
    sample.playwrightPageObservedMs = performance.now() - start;
    page.on("pageerror", (error) => result.errors.push(error.message));
    sample.initialObservedPath = new URL(page.url()).pathname;
    assert.ok(!["/login", "/signup"].includes(sample.initialObservedPath), "Measured restart did not restore its authenticated fixture session");
    await page.evaluate(installProbe, { source: boardReady.toString(), ...preparationArgs });
    await page.waitForFunction(ready, readiness, { timeout: 30000, polling: "raf" });
    sample.visibleNativeWindow = await visibleNativeWindow();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    sample.executableToUsefulInterfaceMs = performance.now() - start;
    sample.ready = await page.evaluate(() => ({ pathname: location.pathname, activeTab: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId,
      tabIds: [...document.querySelectorAll('[data-app-tab-id]')].map((node) => node.dataset.appTabId), rendererTimeOrigin: performance.timeOrigin,
      sinceRendererStartMs: performance.now(), longTasks: window.__executableStartup.longTasks }));
    sample.targetKind = sample.ready.pathname === "/all" ? "complete-global-board" : "editable-home";
    assert.deepEqual([...sample.ready.tabIds].sort(), specs.map((spec) => spec.id).sort());
    const rendererOwner = await page.evaluate(async () => {
      const response = await fetch("/api/me/app-tabs");
      if (!response.ok) throw new Error("Authenticated restart identity check failed");
      const tabs = await response.json(); return [...new Set(tabs.map((tab) => tab.user_id))];
    });
    assert.deepEqual(rendererOwner, [fixture.userId]);
    sample.rendererFixtureIdentityVerified = true;
    // Availability is already recorded; preparation is observed three seconds
    // later without activating any destination or adding that wait to startup.
    await page.waitForTimeout(3000);
    await processObservation;
    sample.preparationAtRendererThreeSeconds = await page.evaluate(() => window.__executableStartup.preparationAtRendererThreeSeconds ?? null);
    sample.preparation = await page.evaluate(() => ({ sinceRendererStartMs: performance.now(),
      resources: performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).origin === location.origin)
        .map((entry) => ({ path: new URL(entry.name).pathname, startTime: entry.startTime, responseEnd: entry.responseEnd, transferSize: entry.transferSize })),
      observedLongTasks: window.__executableStartup.longTasks }));
    await Promise.allSettled(pending);
    assert.ok(!sample.requests.some((entry) => entry.method !== "GET" &&
      (entry.path.startsWith("/api/issues/") || /^\/api\/projects\/[^/]+\/pages(?:\/[^/]+)?$/.test(entry.path))), "Startup must not submit issue or Page content writes");
    sample.status = "complete";
    console.log(JSON.stringify({ round: sample.round, executableToUsefulInterfaceMs: sample.executableToUsefulInterfaceMs, targetKind: sample.targetKind, cookiePersistenceVerified: true }));
    await browser.evaluate(async ({ session }) => { await session.defaultSession.cookies.flushStore(); await session.defaultSession.flushStorageData(); });
    await browser.close(); browser = undefined;
  }
  result.status = "complete-with-open-acceptance";
  result.startupWithinThreeSeconds = result.launches.every((sample) => sample.status === "complete" && sample.executableToUsefulInterfaceMs <= 3000);
} catch (error) {
  failure = error; result.status = "failed"; result.failure = error.stack;
  if (page && !page.isClosed()) {
    result.failureSnapshot = await page.evaluate(() => ({ pathname: location.pathname,
      selectedTab: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId,
      tabIds: [...document.querySelectorAll('[data-app-tab-id]')].map((node) => node.dataset.appTabId),
      activeReadState: document.querySelector('[data-app-view-active="true"]')?.dataset.boardReadState,
      visibleEditorCount: [...document.querySelectorAll('[contenteditable="true"]')].filter((node) => node.getClientRects().length && !node.closest('[inert]')).length,
      visibleHeadingCount: [...document.querySelectorAll('h1')].filter((node) => node.getClientRects().length && !node.closest('[inert]')).length })).catch(() => null);
    await page.screenshot({ path: path.join(output, `${label}-failure.png`) }).catch(() => {});
  }
}
finally {
  await Promise.allSettled(processDeadlineObservations);
  if (browser) await browser.close().catch((error) => { result.cleanup.push({ error: error.message }); failure ??= error; });
  if (session && originalTabs) {
    try {
      const { api, fixture } = session;
      for (const tab of await api("/api/me/app-tabs")) {
        assert.equal(tab.user_id, fixture.userId);
        if (!originalTabs.some((original) => original.id === tab.id)) {
          assert.ok(createdTabs.has(tab.id), "Refusing to remove a tab not created by this runner's renderer");
          await api(`/api/me/app-tabs/${tab.id}`, "DELETE", { revision: tab.revision });
        }
      }
      const after = await assertStableTabs(api, fixture, specs);
      for (const original of originalTabs) {
        const current = after.find((tab) => tab.id === original.id);
        const { href: currentHref, ...currentMetadata } = tabFields(current);
        const { href: originalHref, ...originalMetadata } = tabFields(original);
        assert.deepEqual(currentMetadata, originalMetadata);
        if (currentHref !== originalHref) await api(`/api/me/app-tabs/${current.id}`, "PATCH", { revision: current.revision, patch: { href: originalHref } });
      }
      assert.deepEqual(await loadConnectedBoardWorkload(api, fixture), connectedBoard, "Startup must not change any issue");
      for (const original of originalPages) assert.equal(hash(await api(original.href)), original.fingerprint, "Startup must preserve complete selected Page bodies and versions");
      const { link } = await api(`/api/projects/${forge.project}/git-link`);
      assert.equal(forgeLinkFingerprint(link), forge.linkFingerprint);
      result.cleanup.push({ stableTabCount: specs.length, tabMetadataAndDestinationsRestored: true, issueContentUnchanged: true, pageContentAndVersionsUnchanged: true, githubConnectionPreserved: true });
    } catch (error) { result.cleanup.push({ error: error.stack }); result.status = "failed"; failure ??= error; }
  }
  await session?.close();
  if (userData) await rm(userData, { recursive: true, force: true });
  if (result.runnerSourceHash) {
    result.runnerSourcesUnchanged = await Promise.all(result.runnerSourceHashScope.map((file) => readFile(path.resolve("scripts/performance", file), "utf8")))
      .then((sources) => hash(sources) === result.runnerSourceHash, () => false);
    if (!result.runnerSourcesUnchanged) { result.status = "failed"; failure ??= new Error("Executable measurement dependencies changed during the run"); result.cleanup.push({ error: failure.message }); }
  }
  result.finishedAt = new Date().toISOString();
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ resultPath, status: result.status, launches: result.launches.length, startupWithinThreeSeconds: result.startupWithinThreeSeconds }));
}
if (failure) process.exitCode = 1;
