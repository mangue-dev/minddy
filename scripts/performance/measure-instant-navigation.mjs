import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, _electron, request } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, assertScope, id } from "./seed.mjs";
import { measureDeepNavigation } from "./measure-deep-navigation.mjs";

// Real authorized reads against the existing encrypted fixture. No reseeding,
// personal profile, content mutation, generated API response or paid workflow.
loadEnv();
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert.equal(new URL(base).origin, base);
const label = process.env.MINDDY_PERF_LABEL ?? "min683";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const repeats = Number(process.env.MINDDY_PERF_REPEATS ?? 10);
assert.ok(Number.isInteger(repeats) && repeats > 0 && repeats <= 100);
const output = path.resolve("output/playwright/performance");
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(path.join(output, "workload.json"), "utf8"));
assert.equal(fixture.marker, MARKER);
assert.equal(fixture.email, EMAIL);
assert.deepEqual(fixture.projects, Array.from({ length: 6 }, (_, index) => id(`project-${index}`)));
assert.equal(fixture.firstIssue, id("issue-0-0"));
assert.equal(fixture.firstPage, id("page-0-0"));
const cookies = [];
const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
const signedIn = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
if (signedIn.error) throw new Error(`Fixture sign-in failed: ${signedIn.error.code}`);
assert.equal(signedIn.data.user.id, fixture.userId);
assert.equal(signedIn.data.user.user_metadata.performance_fixture, MARKER);
const apiClient = await request.newContext({ baseURL: base,
  extraHTTPHeaders: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") } });
async function api(url, method = "GET", data) {
  const response = await apiClient.fetch(url, { method, ...(data === undefined ? {} : { data }) });
  assert.ok(response.ok(), `${method} ${url}: ${response.status()}`);
  return response.json();
}
const project = fixture.projects[0];
const secondary = process.argv.includes("--secondary");
const deep = process.argv.includes("--deep");
assert.ok(!(deep && secondary), "Choose one journey workload");
const tabs = secondary ? [
  { id: id("min683-tab-board"), custom_name: "MIN-683 board", href: "/all", cards: 600 },
  { id: id("min683-tab-home"), custom_name: "MIN-683 home", href: "/home", home: true },
  { id: id("min683-tab-prs"), custom_name: "MIN-683 PRs", href: "/pull-requests", prs: true },
] : [
  { id: id("min683-tab-board"), custom_name: "MIN-683 board", href: "/all", cards: 600 },
  { id: id("min683-tab-project"), custom_name: "MIN-683 project", href: `/projects/${project}`, cards: 100 },
  { id: id("min683-tab-page"), custom_name: "MIN-683 Page", href: `/projects/${project}/pages/${deep ? id("page-0-10") : fixture.firstPage}` },
];
const tabFields = ({ id, user_id, href, custom_name, pinned, position }) => ({ id, user_id, href, custom_name, pinned, position });
async function listTabs() {
  const values = await api("/api/me/app-tabs");
  assert.ok(Array.isArray(values));
  for (const tab of values) assert.equal(tab.user_id, fixture.userId);
  return values;
}
async function removeTab(spec) {
  const found = (await listTabs()).find((tab) => tab.id === spec.id);
  if (!found) return;
  assert.equal(found.custom_name, spec.custom_name, "Refusing to remove an unrecognized tab");
  await api(`/api/me/app-tabs/${spec.id}`, "DELETE", { revision: found.revision });
}
const productRoot = process.env.MINDDY_PERF_BUILD_ROOT ?? process.cwd();
const productBuild = (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim();
const productSha = process.env.MINDDY_PERF_BUILD_ROOT
  ? JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8"))
  : { sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), build: productBuild };
assert.equal(productSha.build, productBuild, "Product manifest must match the measured production build");
assert.match(productSha.sha, /^[a-f0-9]{40}$/);
const results = { label, sha: productSha.sha,
  build: productBuild, workload: { counts: fixture.counts, categories: fixture.categoryWorkload ?? null, ...(deep ? { pageBlocks: fixture.pageBlockWorkload ?? null } : {}) }, timestamp: new Date().toISOString(),
  runtime: process.argv.includes("--electron") ? "unpackaged Electron" : "Chromium", repeats, scenario: deep ? "deep" : secondary ? "secondary" : "primary",
  measurements: [], network: [], errors: [], cleanup: [], status: "running" };
let browser, context, page, userData, preserved, failure, changedIssue;
const preservedPages = [];
const created = [];
const pendingNetwork = new Set();
try {
  assertScope("projects", await api(`/api/projects/${project}`), fixture.userId);
  const original = await api(`/api/projects/${project}/pages/${fixture.firstPage}`);
  assertScope("pages", original, fixture.userId);
  assert.equal(original.content.content.length, 80);
  if (deep) {
    assert.equal(fixture.pageBlockWorkload?.stableBlockIds, true, "Normalize the deep-navigation fixture first");
    for (const [project, document] of [[0, 10], [0, 11], [1, 0], [1, 1]]) {
      const href = `/api/projects/${id(`project-${project}`)}/pages/${id(`page-${project}-${document}`)}`;
      const value = await api(href);
      assertScope("pages", value, fixture.userId);
      assert.equal(value.content.content.length, 80);
      assert.equal(new Set(value.content.content.map((block) => block.attrs?.blockId)).size, 80);
      assert.ok(value.content.content.every((block) => typeof block.attrs?.blockId === "string"));
      preservedPages.push({ href, content: value.content, version: value.version });
    }
  }
  preserved = (await listTabs()).filter((tab) => !tabs.some((spec) => spec.id === tab.id)).map(tabFields);
  for (const spec of tabs) {
    await removeTab(spec);
    await api("/api/me/app-tabs", "POST", { id: spec.id });
    created.push(spec);
    const tab = (await listTabs()).find((tab) => tab.id === spec.id);
    await api(`/api/me/app-tabs/${spec.id}`, "PATCH", { revision: tab.revision, patch: { href: spec.href, custom_name: spec.custom_name, pinned: true } });
  }
  if (process.argv.includes("--electron")) {
    userData = await mkdtemp(path.join(tmpdir(), "minddy-min683-"));
    const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    env.MINDDY_DESKTOP_ORIGIN = base;
    env.MINDDY_DESKTOP_TEST_USER_DATA = userData;
    browser = await _electron.launch({ args: [`--user-data-dir=${userData}`, path.resolve("desktop")], cwd: path.resolve("desktop"), env, timeout: 30000 });
    const runtime = await browser.evaluate(({ app }) => ({ packaged: app.isPackaged, userData: app.getPath("userData"), sessionData: app.getPath("sessionData"), electron: process.versions.electron, chromium: process.versions.chrome }));
    assert.equal(runtime.packaged, false);
    assert.equal(path.resolve(runtime.userData), userData);
    assert.equal(path.resolve(runtime.sessionData), userData);
    results.versions = { electron: runtime.electron, chromium: runtime.chromium };
    context = browser.context();
  } else {
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", locale: "en-US" });
    results.versions = { chromium: browser.version() };
  }
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
  const installProbe = () => {
    localStorage.setItem("cookie_consent", "declined");
    window.__instant = { longTasks: [], sample: null };
    try { new PerformanceObserver((list) => window.__instant.longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))).observe({ type: "longtask", buffered: true }); } catch { /* Unsupported entries are omitted. */ }
  };
  await context.addInitScript(installProbe);
  page = process.argv.includes("--electron") ? await browser.firstWindow() : await context.newPage();
  // Electron can create its initial window before context instrumentation.
  // Register directly on that window before the measured navigation as well.
  await page.addInitScript(installProbe);
  page.setDefaultTimeout(45000);
  page.on("pageerror", (error) => results.errors.push(error.message));
  page.on("requestfinished", (req) => {
    if (!req.url().startsWith(base)) return;
    const task = (async () => {
      const response = await req.response();
      const timing = req.timing();
      results.network.push({ path: new URL(req.url()).pathname, method: req.method(), status: response?.status(), ...timing });
    })().catch(() => {}).finally(() => pendingNetwork.delete(task));
    pendingNetwork.add(task);
  });
  page.on("requestfailed", (req) => results.network.push({ path: new URL(req.url()).pathname, method: req.method(), failed: req.failure()?.errorText }));
  const cdp = await context.newCDPSession(page);
  let profiled = false;
  const ready = (spec) => page.waitForFunction(({ cards, href, tab }) => {
    const root = document.querySelector('[data-app-view-active="true"]');
    if (location.pathname !== href || !document.querySelector(`[data-app-tab-id="${tab}"][aria-selected="true"]`)) return false;
    return cards ? root?.getClientRects().length > 0 && !root.inert && root.querySelectorAll("[data-issue-id]").length === cards
      : [...document.querySelectorAll(".page-editor .tiptap")].some((node) => node.getClientRects().length && node.querySelectorAll(":scope > h2").length === 8 && node.querySelectorAll(":scope > p").length === 72);
  }, { cards: spec.cards, href: spec.href, tab: spec.id }, { polling: "raf" });
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const start = Date.now();
  await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-app-view-active="true"]');
    return root?.getClientRects().length && !root.inert && root.querySelectorAll('[data-issue-id]').length === 600;
  });
  await frames();
  results.measurements.push({ name: "startup", driverMs: Date.now() - start });
  results.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio }));
  // Use the canonical tab UI, preserve all existing server tabs, and suppress
  // hover preparation by moving and pressing in one CDP input sequence.
  async function clickMeasured(name, locator, condition, args, complete = condition) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert.ok(box);
    const profile = process.argv.includes("--profile") && name === "page-to-board" && !profiled;
    if (profile) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.start"); }
    await page.evaluate(({ condition, complete, args }) => {
      const check = new Function("args", `return (${condition})(args)`);
      const checkComplete = new Function("args", `return (${complete})(args)`);
      const onDown = (event) => {
        if (!event.isTrusted) return;
        const sample = window.__instant.sample = { start: performance.now(), timeOrigin: performance.timeOrigin, domMs: null, paintMs: null, completeMs: null, boardSkeletonFrames: 0, loadingFrames: 0 };
        const observe = () => {
          if ([...document.querySelectorAll('[data-board-loading-skeleton]')].some((node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden")) sample.boardSkeletonFrames++;
          if ([...document.querySelectorAll('[data-slot="skeleton"], [role="status"][aria-label="Loading"], [data-board-loading-skeleton], [data-testid="pr-sidebar-loading"], [data-testid="pr-detail-loading-content"]')].some((node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden")) sample.loadingFrames++;
          if (!check(args)) { requestAnimationFrame(observe); return; }
          sample.domMs = performance.now() - sample.start;
          requestAnimationFrame(() => requestAnimationFrame(() => { sample.paintMs = performance.now() - sample.start; }));
        };
        const observeComplete = () => {
          if (!checkComplete(args)) { requestAnimationFrame(observeComplete); return; }
          requestAnimationFrame(() => requestAnimationFrame(() => { sample.completeMs = performance.now() - sample.start; }));
        };
        requestAnimationFrame(observe);
        requestAnimationFrame(observeComplete);
      };
      document.addEventListener("pointerdown", onDown, { capture: true, once: true });
    }, { condition: condition.toString(), complete: complete.toString(), args });
    const driverStart = Date.now();
    await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 25));
    await page.waitForFunction(() => window.__instant.sample?.paintMs != null && window.__instant.sample?.completeMs != null, null, { polling: "raf" });
    const sample = await page.evaluate(() => ({ ...window.__instant.sample, longTasks: window.__instant.longTasks.filter((entry) => entry.startTime >= window.__instant.sample.start) }));
    results.measurements.push({ name, ...sample, driverMs: Date.now() - driverStart });
    if (profile) {
      const { profile: cpu } = await cdp.send("Profiler.stop");
      await writeFile(path.join(output, `${label}-page-to-board.cpuprofile`), JSON.stringify(cpu));
      profiled = true;
    }
    console.log(name, Math.round(sample.domMs), Math.round(sample.paintMs));
  }
  const tabReady = ({ spec }) => {
    const root = document.querySelector('[data-app-view-active="true"]');
    if (!document.querySelector(`[data-app-tab-id="${spec.id}"][aria-selected="true"]`) || location.pathname !== spec.href) return false;
    if (spec.home) return [...document.querySelectorAll('[contenteditable][aria-placeholder]')].some((node) => node.getClientRects().length && node.getAttribute('aria-placeholder').includes("Numo")) && !![...document.querySelectorAll('h1')].find((node) => node.getClientRects().length);
    if (spec.prs) return ![...document.querySelectorAll('[data-testid="pr-sidebar-loading"]')].some((node) => node.getClientRects().length) && [...document.querySelectorAll('h1, h2, [data-testid="pr-list-item"], p, span')].some((node) => node.getClientRects().length && /Performance change|No pull request|Nothing to review|Link a GitHub or GitLab repository|Select a pull request/i.test(node.textContent));
    return spec.cards ? !!root?.getClientRects().length && !root.inert && root.querySelectorAll("[data-issue-id]").length === spec.cards
      : [...document.querySelectorAll(".page-editor .tiptap")].some((node) => node.getClientRects().length && node.textContent.includes("Workflow 8"));
  };
  async function tab(spec, name) {
    await clickMeasured(name, page.locator(`[data-app-tab-id="${spec.id}"]`), tabReady, { spec });
  }
  await tab(tabs[0], "initial-board-tab");
  await ready(tabs[0]);
  await frames();
  // Ten seconds of normal idle usage is the preparation opportunity. Record
  // it identically in both variants; startup is already measured above.
  await page.waitForTimeout(10000);
  if (deep) {
    await tab(tabs[1], "initial-project-tab");
    await measureDeepNavigation({ page, fixture, activeTab: tabs[1].id, pageTab: tabs[2], repeats, clickMeasured, results });
  } else {
    await tab(tabs[1], secondary ? "unvisited-home" : "unvisited-project");
    await tab(tabs[2], secondary ? "unvisited-pr-list" : "unvisited-page");
    await tab(tabs[0], "return-board-first");
    for (let index = 0; index < repeats; index++) {
      if (secondary) {
        await tab(tabs[1], "board-to-home");
        await tab(tabs[2], "home-to-pr-list");
        await tab(tabs[0], "pr-list-to-board");
        await page.waitForTimeout(350);
        continue;
      }
      await clickMeasured("issue-open", page.locator(`[data-app-view-active="true"] [data-issue-id="${fixture.firstIssue}"]`),
        () => [...document.querySelectorAll('[role="dialog"]')].some((node) => node.getClientRects().length && node.querySelector("textarea")?.value.includes("Performance task")), null,
        () => [...document.querySelectorAll('[role="dialog"]')].some((node) => node.getClientRects().length && node.querySelector("textarea")?.value.includes("Performance task") && node.querySelector('[data-query-read-phase="fresh"] [data-comment-id]')?.getClientRects().length));
      await page.keyboard.press("Escape");
      await page.locator('[role="dialog"]').first().waitFor({ state: "hidden" });
      await tab(tabs[1], "board-to-project");
      await tab(tabs[2], "project-to-page");
      await tab(tabs[0], "page-to-board");
      await page.waitForTimeout(350);
    }
  }
  if (process.argv.includes("--verify") && secondary) {
    await tab(tabs[1], "verification-home");
    const composer = page.locator('[data-retained-home-view] [contenteditable][aria-placeholder*="Numo"]');
    await composer.fill("MIN-683 unsent fixture draft");
    await composer.evaluate((node) => { window.__instant.homeComposer = node; });
    await tab(tabs[0], "verification-away-from-home");
    assert.equal(await composer.evaluate((node) => !!node.closest('[inert][aria-hidden="true"]')), true);
    await tab(tabs[1], "verification-return-home");
    assert.equal(await composer.evaluate((node) => node === window.__instant.homeComposer), true);
    assert.equal(await composer.textContent(), "MIN-683 unsent fixture draft");
    await page.setViewportSize({ width: 600, height: results.viewport.height });
    await page.waitForFunction(() => innerWidth === 600);
    await page.waitForTimeout(500);
    assert.equal(await composer.evaluate((node) => node === window.__instant.homeComposer), true);
    await page.setViewportSize({ width: results.viewport.width, height: results.viewport.height });
    await page.waitForFunction((width) => innerWidth === width, results.viewport.width);
    await page.waitForTimeout(500);
    assert.equal(await composer.evaluate((node) => node === window.__instant.homeComposer), true);
    assert.equal(await composer.textContent(), "MIN-683 unsent fixture draft");
    await composer.fill("");
    results.verification = { homeDraftPreserved: true, homeResponsiveDomPreserved: true, hiddenHomeInert: true, fixtureDraftCleared: true };
  } else if (process.argv.includes("--verify")) {
    const active = () => page.locator('[data-app-view-active="true"]');
    const original = await api(`/api/issues/${fixture.firstIssue}`);
    assertScope("issues", original, fixture.userId);
    const column = active().locator(`[data-board-column-scroller][data-board-column-status="${original.status}"]`);
    const scroll = await column.evaluate((node) => { node.scrollTop = 180; return node.scrollTop; });
    assert.ok(scroll > 0);
    await column.evaluate((node) => { window.__instant.column = node; });
    await active().evaluate((node) => { window.__instant.board = node; });
    await tab(tabs[1], "verification-project");
    // The marked inert fixture is the only permitted mutation target. Set the
    // restoration journal before transport, including ambiguous acknowledgements.
    changedIssue = original;
    const title = `${original.title} [MIN-683 hidden update]`;
    await api(`/api/issues/${fixture.firstIssue}`, "PATCH", { title });
    await tab(tabs[0], "verification-hidden-return");
    await page.locator(`[data-app-view-active="true"] [data-issue-id="${fixture.firstIssue}"]`).getByText(title, { exact: true }).waitFor();
    assert.equal(await column.evaluate((node) => node === window.__instant.column), true);
    assert.equal(await active().evaluate((node) => node === window.__instant.board), true);
    assert.ok(Math.abs(await column.evaluate((node) => node.scrollTop) - scroll) <= 1);
    const states = await page.locator('[data-retained-app-view]').evaluateAll((nodes) => nodes.map((node) => ({ active: node.dataset.appViewActive === "true", inert: node.inert, visible: !!node.getClientRects().length })));
    assert.equal(states.filter((node) => node.active).length, 1);
    assert.ok(states.every((node) => node.inert !== node.active && node.visible === node.active));
    await api(`/api/issues/${fixture.firstIssue}`, "PATCH", { title: original.title });
    assert.equal((await api(`/api/issues/${fixture.firstIssue}`)).title, original.title);
    changedIssue = undefined;
    results.verification = { scrollPreserved: true, retainedDomPreserved: true, hiddenUpdateVisible: true, hiddenViewsInert: true, fixtureTitleRestored: true };
  }
  await page.screenshot({ path: path.join(output, `${label}-board.png`) });
  results.status = "passed";
} catch (error) {
  failure = error;
  results.status = "failed";
  results.failure = String(error.message);
  if (page && deep) results.failureProbe = await page.evaluate(() => ({
    path: location.pathname,
    activeTab: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.getAttribute("data-app-tab-id"),
    editors: [...document.querySelectorAll(".page-editor .tiptap")].map((node) => ({
      visible: !!node.getClientRects().length,
      blocks: node.children.length,
      headings: node.querySelectorAll(":scope > h2").length,
      paragraphs: node.querySelectorAll(":scope > p").length,
      tags: [...node.children].reduce((counts, child) => ({ ...counts, [child.tagName]: (counts[child.tagName] ?? 0) + 1 }), {}),
      firstBlockIds: [...node.querySelectorAll("[data-block-id]")].slice(0, 3).map((block) => block.getAttribute("data-block-id")),
    })),
    fixtureTitles: [...document.querySelectorAll("textarea, h1")].map((node) => node.value ?? node.textContent).filter((title) => /^Performance guide \d+\.\d+$/.test(title)),
  })).catch(() => null);
  if (page) await page.screenshot({ path: path.join(output, `${label}-failure.png`) }).catch(() => {});
} finally {
  let closed = !browser;
  try { await browser?.close(); closed = true; }
  catch (error) { results.cleanup.push({ applicationClosed: false }); failure ??= error; }
  if (userData && closed) await rm(userData, { recursive: true, force: true });
  if (preservedPages.length) {
    try {
      for (const original of preservedPages) {
        const current = await api(original.href);
        assert.deepEqual(current.content, original.content, "Read-only navigation changed a document");
        assert.equal(current.version, original.version, "Read-only navigation saved a document");
      }
      results.cleanup.push({ fixturePagesUnchanged: true });
    } catch (error) { results.cleanup.push({ fixturePagesUnchanged: false }); failure ??= error; }
  }
  if (changedIssue) {
    try {
      await api(`/api/issues/${fixture.firstIssue}`, "PATCH", { title: changedIssue.title });
      assert.equal((await api(`/api/issues/${fixture.firstIssue}`)).title, changedIssue.title);
      results.cleanup.push({ fixtureTitleRestored: true });
    } catch (error) { results.cleanup.push({ fixtureTitleRestored: false }); failure ??= error; }
  }
  for (const spec of created) {
    try { await removeTab(spec); results.cleanup.push({ tab: spec.custom_name, removed: true }); }
    catch (error) { results.cleanup.push({ tab: spec.custom_name, removed: false, error: String(error.message) }); failure ??= error; }
  }
  if (preserved) {
    try { const remaining = (await listTabs()).map(tabFields); assert.deepEqual(remaining, preserved); results.cleanup.push({ preexistingTabsPreserved: true }); }
    catch (error) { results.cleanup.push({ preexistingTabsPreserved: false }); failure ??= error; }
  }
  await Promise.allSettled(pendingNetwork);
  await apiClient.dispose();
  if (failure) results.status = "failed";
  await writeFile(path.join(output, `${label}.json`), JSON.stringify(results, null, 2));
}
if (failure) throw failure;
