// Reuse the MIN-540 encrypted fixture and CDP counters for post-encryption reads.
// No seeding, forge credentials, paid agent work, or account-profile copying.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, id } from "./seed.mjs";
import { measureRetainedReturns } from "./min614-retained-returns.mjs";
import { measureIssueJourneys } from "./min614-issue-journeys.mjs";
import { measureMutationJourneys } from "./min614-mutation-journeys.mjs";

loadEnv();
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert.equal(new URL(base).origin, base);
const label = process.env.MINDDY_PERF_LABEL ?? "min614";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const output = path.resolve("output/playwright/performance");
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(`${output}/workload.json`, "utf8"));
assert.equal(fixture.marker, MARKER);
assert.equal(fixture.email, EMAIL);
assert.deepEqual(fixture.projects, Array.from({ length: 6 }, (_, i) => id(`project-${i}`)));
const cookies = [];
const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
const { data, error } = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
assert.equal(error, null);
assert.equal(data.user.id, fixture.userId);
assert.equal(data.user.user_metadata.performance_fixture, MARKER);
const tabsResponse = await fetch(`${base}/api/me/app-tabs`, { headers: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") } });
assert.equal(tabsResponse.status, 200);
const tabs = await tabsResponse.json();
const boardTab = tabs.find((tab) => tab.custom_name === "Performance board" && tab.href.startsWith("/all"));
assert.ok(boardTab, "Prepare the existing MIN-540 benchmark tabs first");
const pagesTab = tabs.find((tab) => tab.custom_name === "Performance pages");
assert.ok(pagesTab);
const sealedResponse = await fetch(`${base}/api/me/local-snapshots`, { method: "POST", headers: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "), "Content-Type": "application/json" }, body: JSON.stringify({ operation: "seal", slot: "window-tabs", value: { id: boardTab.id, href: boardTab.href } }) });
assert.equal(sealedResponse.status, 200);
const { snapshot } = await sealedResponse.json();
assert.equal(snapshot.format, "minddy-local-v1");
const native = process.argv.includes("--electron");
const diagnostic = process.argv.includes("--trace");
const cpuProfile = process.argv.includes("--profile");
const pass2 = process.argv.includes("--retained-returns");
const pass3 = process.argv.includes("--issue-journeys");
const pass3b = process.argv.includes("--mutation-journeys");
const buildSha = process.env.MINDDY_PERF_BUILD_SHA;
if (buildSha) assert.match(buildSha, /^[a-f0-9]{40}$/);
let runtime, profile, browser, context, page;
let launchServices = false;
const measurements = [], errors = [], responses = [], requests = [];
const requestRecords = new WeakMap();
try {
  if (native) {
    profile = await mkdtemp(path.join(tmpdir(), "minddy-min614-"));
    const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "NODE_PATH"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    launchServices = true;
    {
      assert.equal(process.platform, "darwin");
      const port = Number(process.env.MINDDY_PERF_CDP_PORT ?? 9337);
      assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
      const endpoint = `http://127.0.0.1:${port}`;
      let occupied = false;
      try { await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
      assert.equal(occupied, false, "The diagnostic port is already occupied; refusing to attach to another app");
      // LaunchServices starts the same unpackaged shell; credentials stay in this process.
      execFileSync("open", ["-n", "-a", path.resolve("desktop/node_modules/electron/dist/Electron.app"),
        "--env", `MINDDY_DESKTOP_ORIGIN=${base}`, "--env", `MINDDY_DESKTOP_TEST_USER_DATA=${profile}`,
        "--args", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, path.resolve("desktop")], { env });
      for (let attempt = 0; attempt < 40; attempt++) {
        try { await fetch(`${endpoint}/json/version`); break; }
        catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
      }
      // An initial document makes Electron's renderer target attachable on macOS.
      const targets = await (await fetch(`${endpoint}/json/list`)).json();
      const target = targets.find((entry) => entry.type === "page");
      assert.ok(target);
      await new Promise((resolve, reject) => {
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        const timeout = setTimeout(() => { socket.close(); reject(new Error("Native initial navigation timed out")); }, 10000);
        socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url: `${base}/login` } }));
        socket.onmessage = ({ data }) => {
          const response = JSON.parse(data);
          if (response.id !== 1) return;
          clearTimeout(timeout); socket.close();
          if (response.error) reject(new Error(response.error.message)); else resolve();
        };
        socket.onerror = () => { clearTimeout(timeout); reject(new Error("Native debugging connection failed")); };
      });
      browser = await chromium.connectOverCDP(endpoint, { timeout: 60000 });
      context = browser.contexts()[0];
      page = context.pages()[0];
      assert.ok(page);
      runtime = { electron: JSON.parse(await readFile("desktop/node_modules/electron/package.json", "utf8")).version,
        launcher: "macOS LaunchServices", profile: "Fresh temporary profile, removed after measurement" };
    }
  } else {
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US", colorScheme: "light" });
    runtime = { chromium: browser.version() };
    page = await context.newPage();
  }
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
  await context.addInitScript(({ owner, snapshot, base }) => {
    if (location.origin !== base) return;
    sessionStorage.setItem(`minddy.app-tabs.${owner}`, JSON.stringify(snapshot));
    localStorage.setItem("cookie_consent", "declined");
    localStorage.setItem("minddy.trace", "1");
    window.__min614 = { tasks: [], frames: [], apiStates: {} };
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = new URL(typeof args[0] === "string" ? args[0] : args[0].url ?? args[0], location.origin);
      if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return originalFetch(...args);
      const state = window.__min614.apiStates[url.pathname] ??= { pending: 0, status: null };
      state.pending++;
      try { const response = await originalFetch(...args); state.status = response.status; return response; }
      finally { state.pending--; }
    };
    new PerformanceObserver((list) => window.__min614.tasks.push(...list.getEntries().map(({ startTime, duration }) => ({ start: startTime, duration })))).observe({ type: "longtask", buffered: true });
    let last = performance.now();
    const frame = (now) => { window.__min614.frames.push({ start: last, duration: now - last }); last = now; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }, { owner: fixture.userId, snapshot, base });
  page.on("request", (request) => {
    if (!request.url().startsWith(`${base}/api/`)) return;
    const url = new URL(request.url());
    const record = { path: url.pathname, method: request.method(), at: Date.now(),
      ...(url.searchParams.get('view') === 'chain' ? { variant: 'chain' } : {}) };
    requestRecords.set(request, record); requests.push(record);
  });
  page.on("requestfinished", (request) => {
    const record = requestRecords.get(request);
    if (record) record.duration = request.timing().responseEnd;
  });
  page.on("requestfailed", (request) => {
    const record = requestRecords.get(request);
    if (record) record.failed = request.failure()?.errorText;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { const record = requestRecords.get(response.request()); if (record) record.status = response.status(); if (response.url().startsWith(`${base}/api/`)) responses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const counters = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  async function measure(name, action, ready, probe) {
    const before = await counters();
    const started = await page.evaluate(() => performance.timeOrigin + performance.now());
    const responseStart = responses.length;
    if (cpuProfile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    }
    if (diagnostic) await cdp.send("Tracing.start", { categories: "devtools.timeline,v8,disabled-by-default-devtools.timeline.invalidationTracking", transferMode: "ReturnAsStream" });
    let failure;
    try { await action(); await ready(); } catch (error) { failure = error; }
    const observedAt = await page.evaluate(() => performance.timeOrigin + performance.now());
    const firstVisibleAt = failure ? null : observedAt;
    await frames();
    const readyAt = await page.evaluate(() => performance.timeOrigin + performance.now());
    let inputMs = null;
    if (probe && !failure) {
      const inputStart = await page.evaluate(() => performance.now());
      await probe();
      inputMs = await page.evaluate((start) => performance.now() - start, inputStart);
    }
    await page.waitForTimeout(350);
    const after = await counters();
    if (cpuProfile) {
      const { profile } = await cdp.send("Profiler.stop");
      await writeFile(`${output}/${label}-${name}-cpu.json`, JSON.stringify(profile));
    }
    const rendering = await page.evaluate((since) => {
      const start = since - performance.timeOrigin;
      const tasks = window.__min614.tasks.filter((task) => task.start >= start);
      return { longTaskSamples: tasks, frameStalls: window.__min614.frames.filter((frame) => frame.start >= start && frame.duration > 50), longTasks: tasks.length, longTaskMs: tasks.reduce((sum, task) => sum + task.duration, 0), maxFrameMs: Math.max(0, ...window.__min614.frames.filter((frame) => frame.start >= start).map((frame) => frame.duration)) };
    }, started);
    if (diagnostic) {
      const complete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
      await cdp.send("Tracing.end");
      const { stream } = await complete;
      let trace = "";
      for (;;) { const chunk = await cdp.send("IO.read", { handle: stream }); trace += chunk.data; if (chunk.eof) break; }
      await cdp.send("IO.close", { handle: stream });
      await writeFile(`${output}/${label}-${name}-trace.json`, trace);
    }
    const resources = await page.evaluate((since) => performance.getEntriesByType("resource").filter((entry) => entry.startTime >= since - performance.timeOrigin && new URL(entry.name).pathname.startsWith("/api/")).map((entry) => ({ path: new URL(entry.name).pathname, duration: entry.duration, ttfb: entry.responseStart - entry.requestStart })), started);
    const sameDocument = before.NavigationStart === after.NavigationStart;
    const result = { name, startedAt: started, firstVisibleMs: failure ? null : firstVisibleAt - started, readyAt: failure ? null : readyAt, inputMs, readyMs: failure ? null : readyAt - started, ...(failure ? { error: failure.message.split("\n")[0], failedAfterMs: observedAt - started } : {}), ...rendering, scriptMs: sameDocument ? Math.max(0, after.ScriptDuration - before.ScriptDuration) * 1000 : null,
      styleMs: sameDocument ? Math.max(0, after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000 : null, layoutMs: sameDocument ? Math.max(0, after.LayoutDuration - before.LayoutDuration) * 1000 : null, resources, responses: responses.slice(responseStart) };
    measurements.push(result);
    console.log(JSON.stringify(result));
    if (failure) throw failure;
    return result;
  }
  const board = () => page.locator('[data-retained-app-view][data-app-view-active="true"] [data-issue-id]').first();
  const start = Date.now();
  await page.goto(`${base}${boardTab.href}`, { waitUntil: "domcontentloaded" });
  await board().waitFor({ timeout: 90000 });
  measurements.push({ name: "cold-board", readyMs: Date.now() - start });
  await page.waitForTimeout(1800);
  runtime.renderer = await page.evaluate(() => ({ userAgent: navigator.userAgent, nativeBridge: Boolean(window.minddy),
    width: innerWidth, height: innerHeight, theme: document.documentElement.classList.contains("dark") ? "dark" : "light" }));
  assert.equal(runtime.renderer.nativeBridge, native);
  const pagesHref = `/projects/${fixture.projects[0]}/pages`;
  if (pass3b) {
    await measureMutationJourneys({ page, context, fixture, boardTab, pagesTab, base, measure, frames, diagnostic: diagnostic || cpuProfile, output, label, recordRequest: (record) => requests.push(record), cdp });
  } else if (pass3) {
    await measureIssueJourneys({ page, context, fixture, boardTab, pagesTab, tabs, base, measure, frames, diagnostic: diagnostic || cpuProfile, output, label, recordRequest: (record) => requests.push(record) });
  } else if (pass2) {
    await measureRetainedReturns({ page, context, fixture, boardTab, pagesTab, tabs, base, measure, frames, diagnostic: diagnostic || cpuProfile, output, label });
  } else for (let run = 0; run < 3; run++) {
    await measure(`issue-open-${run}`, () => board().click(), () => page.locator('[role="dialog"]').first().waitFor());
    if (process.argv.includes("--short")) break;
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"]').first().waitFor({ state: "hidden" });
    await measure(`tab-to-pages-${run}`, () => page.locator('[data-app-tab-id][aria-label="Performance pages"]').click(),
      () => pagesTab.href === pagesHref
        ? page.locator(`a[href="${pagesHref}/${fixture.firstPage}"]`).first().waitFor()
        : page.locator(".page-editor .tiptap").waitFor());
    await measure(`tab-to-board-${run}`, () => page.locator('[data-app-tab-id][aria-label="Performance board"]').click(), () => board().waitFor());
  }
  if (process.argv.includes("--short")) {
    await page.waitForTimeout(1000);
    await page.evaluate(() => { document.documentElement.classList.remove("dark"); document.documentElement.style.colorScheme = "light"; });
    await frames();
    await page.screenshot({ path: `${output}/${label}-issue-light.png` });
  }
  if (!process.argv.includes("--short") && !pass3) {
  // Read the stored PR list through its real authenticated route; no diff or forge is fabricated.
  for (let run = 0; run < 3; run++) {
    const started = performance.now();
    const response = await context.request.get(`${base}/api/pull-requests?limit=50`);
    const body = await response.json();
    assert.equal(response.status(), 200);
    assert.ok(body.pullRequests.length > 0);
    assert.ok(body.pullRequests.every((pr) => pr.title.startsWith("Performance change")));
    measurements.push({ name: `pr-api-${run}`, readyMs: performance.now() - started, count: body.pullRequests.length });
  }
  await measure("pr-page", () => page.goto(`${base}/pull-requests`, { waitUntil: "domcontentloaded" }),
    () => page.getByText("Performance change 1.1", { exact: true }).first().waitFor({ timeout: 60000 }));
  await page.waitForTimeout(2000);
  // Capture the synthetic fixture in light mode without changing account preferences.
  await page.evaluate(() => { document.documentElement.classList.remove("dark"); document.documentElement.style.colorScheme = "light"; });
  await frames();
  await page.screenshot({ path: `${output}/${label}-pr-light.png` });
  }
} catch (error) {
  // Playwright transport logs can contain cookies; retain only the diagnostic headline.
  const headline = error.message.split('\n')[0];
  errors.push(headline);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${output}/${label}-failure.png` });
    console.error(await page.locator("[data-app-tab-id]").evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.appTabId, label: node.getAttribute("aria-label"), selected: node.getAttribute("aria-selected") }))));
  }
  throw new Error(headline);
} finally {
  let desktopTrace;
  if (native && (diagnostic || cpuProfile) && page && !page.isClosed()) {
    try {
      // Freeze the existing trace ring outside timings without changing the OS clipboard.
      desktopTrace = await page.evaluate(() => {
        let dump;
        const original = navigator.clipboard.writeText;
        navigator.clipboard.writeText = async (text) => { dump = text; };
        try { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', altKey: true, shiftKey: true })); }
        finally { navigator.clipboard.writeText = original; }
        return dump;
      });
    } catch { desktopTrace = null; }
  }
  await writeFile(`${output}/${label}.json`, JSON.stringify({ label, native, diagnostic, cpuProfile, pass2, pass3, pass3b, timestamp: new Date().toISOString(), buildSha, sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()), runtime, buildId: (await readFile(path.join(process.env.MINDDY_PERF_REFERENCE_ROOT ?? process.cwd(), ".next/BUILD_ID"), "utf8")).trim(), measurements, errors, responses, requests, desktopTrace }, null, 2));

  await browser?.close();
  if (launchServices && profile) {
    // Restrict cleanup to this runner's unique temporary profile, including helpers.
    let processes = "";
    try { processes = execFileSync("pgrep", ["-f", `user-data-dir=${profile}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}
    for (const pid of processes.trim().split(/\s+/).filter(Boolean)) {
      try { process.kill(Number(pid), "SIGTERM"); } catch {}
    }
  }
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
