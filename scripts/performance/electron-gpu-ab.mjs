import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";

import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { _electron, request } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, assertScope, id } from "./seed.mjs";

// Diagnostic only: A/B the unpackaged Electron shell's GPU-related flags on the
// seeded benchmark account. Launch mechanics are identical to verify-electron.mjs;
// the flag candidates are appended per mode and NO flag is shipped from here.
// The output records whether a candidate holds on this machine or not.
loadEnv();
assert.equal(process.platform, "darwin", "This runner targets the installed macOS Electron executable");
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
const origin = new URL(base);
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname), "Use a local production server");
assert.equal(origin.origin, base, "Provide an origin without a trailing slash or path");
const label = process.env.MINDDY_PERF_LABEL ?? "gpu-ab";
const EXTRA_ARGS = (process.env.MINDDY_ELECTRON_EXTRA_ARGS ?? "")
  .split(" ").map((value) => value.trim()).filter(Boolean);
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
async function readyBoard() {
  await card().waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector('[data-retained-app-view][data-app-view-active="true"]')?.querySelectorAll("[data-issue-id]").length === 600);
  await frames();
}

try {
  assertScope("projects", await api(`/api/projects/${fixture.projects[0]}`), fixture.userId);
  const originalPage = await api(pageApi);
  assertScope("pages", originalPage, fixture.userId);
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
  electronApp = await _electron.launch({ args: [`--user-data-dir=${userData}`, ...EXTRA_ARGS, desktopDirectory], cwd: desktopDirectory,
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
  await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("cookie_consent", "declined"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await readyBoard();
  // Tab activation is client-side (retained views), so one collector installed
  // after load survives every sampled gesture; no document navigation happens.
  await page.evaluate(() => {
    window.__frames = [];
    let previous = performance.now();
    function frame(now) { window.__frames.push(now - previous); previous = now; requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
    window.__longTasks = 0;
    try { new PerformanceObserver((list) => { window.__longTasks += list.getEntries().length; }).observe({ type: "longtask", buffered: false }); } catch { /* unsupported */ }
  });
  const SAMPLES = Number(process.env.MINDDY_PERF_ELECTRON_SAMPLES ?? 5);
  const sample = async (name, action) => {
    await page.evaluate(() => { window.__frames.length = 0; window.__longTasks = 0; });
    const started = Date.now();
    await action();
    await page.locator("[data-issue-id]").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    const { gaps, longTasks } = await page.evaluate(() => ({ gaps: [...window.__frames], longTasks: window.__longTasks }));
    gaps.sort((a, b) => a - b);
    return { name, readyMs: Date.now() - started,
      p95FrameMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
      maxFrameMs: Math.round(gaps[gaps.length - 1] ?? 0), longTasks };
  };
  const samples = [];
  for (let index = 0; index < SAMPLES; index++) {
    await sample("warm-board", async () => {
      await page.locator(`[data-app-tab-id="${pageTab.id}"]`).click();
      await page.waitForURL(`${base}${pageHref}`);
      await page.locator(`[data-app-tab-id="${boardTab.id}"]`).click();
      await page.waitForURL(`${base}/all`);
    }).then((row) => samples.push(row));
    await sample("board-scroll", async () => {
      await activeBoard().locator('[data-board-column-status="backlog"] [data-issue-id]').first().hover();
      await page.mouse.wheel(0, 1400);
      await page.waitForTimeout(150);
      await page.mouse.wheel(0, -1400);
      await readyBoard();
    }).then((row) => samples.push(row));
  }
  results.samples = samples;
  results.extraArgs = EXTRA_ARGS;
  results.gpuFeatureStatus = await electronApp.evaluate(({ app }) => app.getGPUFeatureStatus());
  results.runtimeSnapshot = runtime;
  console.log(JSON.stringify({ label, extraArgs: EXTRA_ARGS,
    medianTabReturnMs: (() => { const v = samples.map((s) => s.readyMs).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; })(),
    medianP95FrameMs: (() => { const v = samples.map((s) => s.p95FrameMs).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; })(),
    totalLongTasks: samples.reduce((total, s) => total + s.longTasks, 0),
    samples }));
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
    assert.deepEqual((await api(pageApi)).content, originalPage.content, "Fixture Page content changed");
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
