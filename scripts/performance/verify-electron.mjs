import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { _electron, request } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, assertScope, id } from "./seed.mjs";

// Run the installed, unpackaged Electron shell against a local production build.
// This is native-shell correctness coverage, not a release-package or INP test.
loadEnv();
assert.equal(process.platform, "darwin", "This runner targets the installed macOS Electron executable");
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
const origin = new URL(base);
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname), "Use a local production server");
assert.equal(origin.origin, base, "Provide an origin without a trailing slash or path");
const label = process.env.MINDDY_PERF_LABEL ?? "pass2-electron";
assert.match(label, /^[a-zA-Z0-9_-]+$/, "Invalid output label");
const output = path.resolve("output/playwright/performance");
await mkdir(output, { recursive: true });
const executablePath = path.resolve("desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const desktopDirectory = path.resolve("desktop");
await access(executablePath);
await access(path.join(desktopDirectory, "dist/main.js"));
// Use Playwright's default unpackaged launcher, which installs its startup
// synchronization. Passing a raw executablePath skips that loader. Resolve the
// existing desktop dependency through Node's public NODE_PATH mechanism:
// NODE_PATH=./desktop/node_modules node scripts/performance/verify-electron.mjs
const require = createRequire(import.meta.url);
let resolvedExecutable;
try { resolvedExecutable = require("electron/index.js"); }
catch { throw new Error("Run with NODE_PATH=./desktop/node_modules so Playwright can resolve the installed Electron dependency"); }
assert.equal(path.resolve(resolvedExecutable), executablePath, "Unexpected Electron dependency resolution");
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
if (signedIn.error) throw signedIn.error;
assert.equal(signedIn.data.user.id, fixture.userId, "Wrong fixture account");
assert.equal(signedIn.data.user.user_metadata.performance_fixture, MARKER, "Unmarked fixture account");

// A separate API client permits cleanup after the native application is closed.
// Credentials stay in this process; the child gets only the explicit whitelist.
const apiContext = await request.newContext({ baseURL: base,
  extraHTTPHeaders: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") } });
const userData = await mkdtemp(path.join(tmpdir(), "minddy-min540-electron-"));
const launchEnv = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"]
  .filter((key) => typeof process.env[key] === "string").map((key) => [key, process.env[key]]));
launchEnv.MINDDY_DESKTOP_ORIGIN = base;
launchEnv.MINDDY_DESKTOP_TEST_USER_DATA = userData;
const pageHref = `/projects/${fixture.projects[0]}/pages/${fixture.firstPage}`;
const pageApi = `/api/projects/${fixture.projects[0]}/pages/${fixture.firstPage}`;
const tempTabs = [
  { id: id("electron-verification-tab-board"), custom_name: "MIN-540 Electron: board", href: "/all" },
  { id: id("electron-verification-tab-page"), custom_name: "MIN-540 Electron: Page", href: pageHref },
];
const [boardTab, pageTab] = tempTabs;
const pageErrors = [];
const failedRequests = [];
const results = { kind: "unpackaged-electron-correctness", label, timestamp: new Date().toISOString(),
  localOrigin: base, freshProfile: true, copiedProfile: false, releasePackageTested: false,
  nativePermissionsRequestedByRunner: false, generatedResponses: false, checks: [], screenshots: [],
  nativeSnapshots: [], pageErrors, failedRequests, cleanup: [], status: "running" };
let electronApp;
let page;
let preservedTabs = [];
let originalPage;
let originalIssue;
let savedScroll;
const tabFields = (tab) => ({ id: tab.id, user_id: tab.user_id, href: tab.href,
  custom_name: tab.custom_name, pinned: tab.pinned, position: tab.position });
const activeBoard = () => page.locator('[data-retained-app-view][data-app-view-active="true"]');
const card = () => activeBoard().locator(`[data-issue-id="${fixture.firstIssue}"]`);
const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function api(url, method = "GET", data) {
  const response = await apiContext.fetch(url, { method, ...(data === undefined ? {} : { data }) });
  const body = await response.json();
  if (!response.ok()) throw new Error(`${method} ${url} failed (${response.status()}): ${body.code ?? body.error ?? "request failed"}`);
  return body;
}
async function listTabs() {
  const tabs = await api("/api/me/app-tabs");
  assert.ok(Array.isArray(tabs));
  for (const tab of tabs) assert.equal(tab.user_id, fixture.userId, "Foreign account tab");
  return tabs;
}
async function removeTemporaryTab(spec) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const tab = (await listTabs()).find((entry) => entry.id === spec.id);
    if (!tab) return;
    assert.equal(tab.custom_name, spec.custom_name, "Refusing to remove an unrecognized tab");
    const response = await apiContext.delete(`/api/me/app-tabs/${tab.id}`, { data: { revision: tab.revision } });
    if (response.ok()) return;
    assert.equal(response.status(), 409, "Temporary tab cleanup failed");
  }
  throw new Error("Temporary tab kept changing during cleanup");
}
async function screenshot(name) {
  const destination = path.join(output, `${label}-${name}.png`);
  await page.screenshot({ path: destination });
  results.screenshots.push({ path: destination, scope: "Electron renderer viewport" });
}
async function nativeSnapshot(name) {
  const snapshot = await electronApp.evaluate(({ app }) => {
    const processes = app.getAppMetrics();
    const sum = (values) => values.length ? values.reduce((total, value) => total + value, 0) : null;
    const numbers = (select) => processes.map(select).filter((value) => typeof value === "number");
    return {
      processCount: processes.length,
      processTypes: processes.reduce((counts, entry) => ({ ...counts, [entry.type]: (counts[entry.type] ?? 0) + 1 }), {}),
      aggregateCPUUsagePercent: sum(numbers((entry) => entry.cpu?.percentCPUUsage)),
      aggregateWorkingSetKB: sum(numbers((entry) => entry.memory?.workingSetSize)),
      gpuFeatureStatus: app.getGPUFeatureStatus(),
    };
  });
  results.nativeSnapshots.push({ name, ...snapshot,
    interpretation: "Instantaneous process aggregates; no CPU profile, frame-timing benchmark, forced GC, or release-package comparison" });
  return snapshot;
}
async function check(name, action) {
  try {
    const detail = await action();
    assert.equal(pageErrors.length, 0, `Browser errors: ${pageErrors.join("; ")}`);
    results.checks.push({ name, status: "passed", detail });
    console.log(JSON.stringify({ name, status: "passed" }));
  } catch (error) {
    results.checks.push({ name, status: "failed", error: error.message });
    if (page) await screenshot("failure").catch(() => {});
    throw error;
  }
}
async function readyBoard() {
  await card().waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector('[data-retained-app-view][data-app-view-active="true"]')?.querySelectorAll("[data-issue-id]").length === 600);
  await frames();
}

try {
  assertScope("projects", await api(`/api/projects/${fixture.projects[0]}`), fixture.userId);
  originalPage = await api(pageApi);
  originalIssue = await api(`/api/issues/${fixture.firstIssue}`);
  assertScope("pages", originalPage, fixture.userId);
  assertScope("issues", originalIssue, fixture.userId);
  assert.equal(originalPage.title, "Performance guide 1.1");
  assert.equal(originalPage.content.content.length, 80);
  assert.equal(originalIssue.project_id, fixture.projects[0]);
  assert.match(originalIssue.title, /^Performance task 1\.1:/);
  preservedTabs = (await listTabs()).filter((tab) => !tempTabs.some((spec) => spec.id === tab.id)).map(tabFields);
  for (const spec of tempTabs) {
    await removeTemporaryTab(spec);
    await api("/api/me/app-tabs", "POST", { id: spec.id });
    const created = (await listTabs()).find((tab) => tab.id === spec.id);
    assert.ok(created);
    await api(`/api/me/app-tabs/${spec.id}`, "PATCH", { revision: created.revision,
      patch: { href: spec.href, custom_name: spec.custom_name } });
  }

  // Do not inherit dotenv secrets, protocol-claim flags, debugging flags, or any
  // native/runtime permission overrides from the surrounding agent process.
  // Electron applies this Chromium path during PreSandboxStartup, before the
  // application's own userData override and before any Session is created.
  electronApp = await _electron.launch({ args: [`--user-data-dir=${userData}`, desktopDirectory], cwd: desktopDirectory,
    env: launchEnv, locale: "en-US", colorScheme: "dark", acceptDownloads: false, timeout: 30000 });
  const runtime = await electronApp.evaluate(({ app }) => ({
    isPackaged: app.isPackaged, userData: app.getPath("userData"), sessionData: app.getPath("sessionData"), appVersion: app.getVersion(),
    electronVersion: process.versions.electron, chromiumVersion: process.versions.chrome,
    platform: process.platform, appPath: app.getAppPath(),
  }));
  assert.equal(runtime.isPackaged, false, "Refusing to test a packaged application with this runner");
  assert.equal(path.resolve(runtime.userData), path.resolve(userData), "Electron used an unexpected profile");
  assert.equal(path.resolve(runtime.sessionData), path.resolve(userData), "Electron used unexpected session storage");
  assert.equal(path.resolve(runtime.appPath), desktopDirectory, "Electron loaded an unexpected application");
  results.runtime = { ...runtime, userData: "Fresh temporary profile; removed after the run", sessionData: "Same fresh temporary profile" };
  const context = electronApp.context();
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
  await context.addInitScript(({ owner, first }) => {
    localStorage.setItem("cookie_consent", "declined");
    sessionStorage.setItem(`minddy.app-tabs.${owner}`, JSON.stringify({ id: first.id, href: first.href }));
  }, { owner: fixture.userId, first: boardTab });
  page = await electronApp.firstWindow();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === base && url.pathname.startsWith("/api/") && response.status() >= 400) {
      failedRequests.push({ path: url.pathname, method: response.request().method(), status: response.status() });
    }
  });
  await check("native-bridge-and-complete-board", async () => {
    await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
    // A native window may start loading before addInitScript is registered.
    // Initialize only this fresh profile, then reload to dismiss any consent
    // prompt opened during that first load without changing account metadata.
    await page.evaluate(() => localStorage.setItem("cookie_consent", "declined"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await readyBoard();
    await page.locator(`[data-app-tab-id="${boardTab.id}"][aria-selected="true"]`).waitFor();
    const bridge = await page.evaluate(() => ({
      available: !!window.minddy,
      platform: window.minddy?.platform,
      version: window.minddy?.version,
      integratedWindowChrome: window.minddy?.integratedWindowChrome,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    }));
    assert.equal(bridge.available, true, "The native preload bridge is missing");
    assert.equal(bridge.platform, "darwin");
    assert.equal(bridge.version, runtime.appVersion);
    await card().evaluate((node) => { window.__electronFixtureCard = node; });
    savedScroll = await activeBoard().locator(`[data-board-column-scroller][data-board-column-status="${originalIssue.status}"]`)
      .evaluate((node) => { node.scrollTop = 180; return node.scrollTop; });
    assert.ok(savedScroll > 0, "Fixture column must scroll");
    await screenshot("board");
    await nativeSnapshot("board-initial");
    return { cards: 600, ...bridge, nativeBridgeMethodsInvoked: false, scrollTop: savedScroll };
  });
  await check("native-sidebar-keeps-board", async () => {
    const hide = page.getByRole("button", { name: "Hide sidebar", exact: true });
    const show = page.getByRole("button", { name: "Show sidebar", exact: true });
    const initiallyShown = await hide.isVisible();
    const first = initiallyShown ? hide : show;
    await first.click();
    await (initiallyShown ? show : hide).waitFor({ state: "visible" });
    await readyBoard();
    assert.equal(await card().evaluate((node) => node === window.__electronFixtureCard), true);
    await screenshot("sidebar-toggled");
    await (initiallyShown ? show : hide).click();
    await first.waitFor({ state: "visible" });
    await readyBoard();
    return { restoredSidebar: true, retainedCardIdentity: true, cards: 600 };
  });
  await check("native-page-content-and-menu", async () => {
    await page.locator(`[data-app-tab-id="${pageTab.id}"]`).click();
    await page.waitForURL(`${base}${pageHref}`);
    const editor = page.locator(".page-editor .tiptap");
    await editor.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector(".page-editor .tiptap")?.children.length === 80);
    assert.equal(await editor.locator(":scope > h2").count(), 8);
    assert.equal(await editor.locator(":scope > p").count(), 72);
    await screenshot("page-top");
    await editor.locator(":scope > p").last().scrollIntoViewIfNeeded();
    await screenshot("page-bottom");
    await page.locator('.app-content-header button[aria-label="Page options"]').click();
    await page.locator('[role="menu"]:visible').waitFor();
    await screenshot("page-menu");
    await page.keyboard.press("Escape");
    await nativeSnapshot("page-with-retained-board");
    return { blocks: 80, headings: 8, paragraphs: 72, menuOpened: true };
  });
  await check("native-warm-board-preserves-content-and-scroll", async () => {
    await page.locator(`[data-app-tab-id="${boardTab.id}"]`).click();
    await page.waitForURL(`${base}/all`);
    await readyBoard();
    assert.equal(await card().evaluate((node) => node === window.__electronFixtureCard), true, "The cached board remounted");
    const scroll = await activeBoard().locator(`[data-board-column-scroller][data-board-column-status="${originalIssue.status}"]`)
      .evaluate((node) => node.scrollTop);
    assert.ok(Math.abs(scroll - savedScroll) <= 1, `Scroll changed from ${savedScroll} to ${scroll}`);
    await screenshot("board-restored");
    await nativeSnapshot("board-return");
    return { cards: 600, retainedCardIdentity: true, scrollTop: scroll };
  });
  results.status = "passed";
} catch (error) {
  results.status = "failed";
  results.error = error.message;
  process.exitCode = 1;
} finally {
  // The default Electron close-button behavior hides the window. Closing the
  // test application stops all live tab writes before removing fixture rows.
  let appClosed = !electronApp;
  if (electronApp) {
    try { await electronApp.close(); appClosed = true; }
    catch (error) {
      results.status = "failed";
      results.cleanup.push({ error: `Electron close failed: ${error.message}` });
      process.exitCode = 1;
    }
  }
  try {
    if (originalPage) assert.deepEqual((await api(pageApi)).content, originalPage.content, "Fixture Page content changed");
    if (originalIssue) assert.equal((await api(`/api/issues/${fixture.firstIssue}`)).title, originalIssue.title, "Fixture issue title changed");
    for (const spec of tempTabs) await removeTemporaryTab(spec);
    const remaining = await listTabs();
    assert.ok(tempTabs.every((spec) => !remaining.some((tab) => tab.id === spec.id)), "Temporary tabs survived cleanup");
    for (const before of preservedTabs) {
      const current = remaining.find((tab) => tab.id === before.id);
      assert.ok(current, "An existing tab disappeared");
      assert.deepEqual(tabFields(current), before, "An existing tab changed");
    }
    results.cleanup.push("Removed only deterministic temporary tabs; preserved existing tabs and fixture content");
  } catch (error) {
    results.status = "failed";
    results.cleanup.push({ error: error.message });
    process.exitCode = 1;
  }
  await apiContext.dispose();
  // This exact path was created by mkdtemp above; no profile was copied or read.
  if (appClosed) {
    await rm(userData, { recursive: true, force: true });
    results.cleanup.push("Removed the newly created Electron user-data directory");
  } else results.cleanup.push({ retainedTemporaryProfile: userData, reason: "The test application did not close cleanly" });
  await writeFile(path.join(output, `${label}.json`), JSON.stringify(results, null, 2));
}
