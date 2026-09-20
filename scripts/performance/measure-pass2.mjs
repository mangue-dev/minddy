import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, id } from "./seed.mjs";

loadEnv();
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Benchmarks must target a local production build");
const output = "output/playwright/performance";
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(`${output}/workload.json`, "utf8"));
if (fixture.marker !== MARKER || fixture.email !== EMAIL) throw new Error("Run the dedicated workload seed first");
const cookies = [];
const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
const signedIn = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
if (signedIn.error) throw signedIn.error;
if (signedIn.data.user.id !== fixture.userId || signedIn.data.user.user_metadata.performance_fixture !== MARKER) throw new Error("Wrong benchmark account");
if (fixture.projects.some((value, index) => value !== id(`project-${index}`)) || fixture.firstPage !== id("page-0-0") || fixture.firstIssue !== id("issue-0-0")) throw new Error("Foreign fixture identifiers");
const browser = await chromium.launch();
const mobile = process.argv.includes("--mobile");
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "en-US", colorScheme: "dark", reducedMotion: "no-preference" });
await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
const page = await context.newPage();
let beamActive = true;
if (process.argv.includes("--visual")) {
  // Visual-only activity signal: no agent run is created or paid for.
  await page.route((url) => url.pathname === "/api/agent-activity", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, workingIssueIds: beamActive ? [fixture.firstIssue] : [] } });
  });
}
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
const failures = [];
let runError = null;
page.on("pageerror", (error) => failures.push(error.message));
const responses = [];
page.on("response", (response) => {
  if (response.url().startsWith(`${base}/api/`)) responses.push({ path: new URL(response.url()).pathname, status: response.status(), at: Date.now() });
});
await context.addInitScript(() => {
  localStorage.setItem("cookie_consent", "declined");
  window.__perf = { longTasks: [], events: [], frames: [], storage: [] };
  for (const [type, key] of [["longtask", "longTasks"], ["event", "events"]]) {
    try { new PerformanceObserver((list) => window.__perf[key].push(...list.getEntries().map((entry) => ({ name: entry.name, start: entry.startTime, duration: entry.duration })))).observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) }); } catch { /* Unsupported browser entries are omitted. */ }
  }
  let previous = performance.now();
  function frame(now) { window.__perf.frames.push({ start: previous, duration: now - previous }); previous = now; requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) { const start = performance.now(); const result = setItem.call(this, key, value); if (key === "minddy.query-cache") window.__perf.storage.push({ start, duration: performance.now() - start, bytes: value.length }); return result; };
});
// Measure actual pointer dispatch after resolving deterministic targets. Keep
// the observation tail long enough to include deferred cache snapshots.
const label = process.env.MINDDY_PERF_LABEL ?? "pass2";
const tailMs = Number(process.env.MINDDY_PERF_TAIL_MS ?? 2200);
const repeats = Number(process.env.MINDDY_PERF_REPEATS ?? 5);
const cpuRate = Number(process.env.MINDDY_PERF_CPU_RATE ?? 1);
const profile = process.argv.includes("--profile");
const measurements = [];
const network = [];
const identity = [];
const memory = [];
const pendingNetwork = new Set();
page.on("requestfinished", (request) => {
  if (!request.url().startsWith(base)) return;
  const task = (async () => {
    const response = await request.response();
    const timing = request.timing();
    const size = await request.sizes();
    network.push({ path: new URL(request.url()).pathname, method: request.method(), status: response?.status(), timing, size });
  })().catch(() => {}).finally(() => pendingNetwork.delete(task));
  pendingNetwork.add(task);
});
if (cpuRate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
if (process.argv.includes("--network")) await cdp.send("Network.emulateNetworkConditions", {
  offline: false, latency: 100, downloadThroughput: 1_500_000 / 8, uploadThroughput: 750_000 / 8,
});
if (profile) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 1000 }); }
async function pointer(locator, button = "left") {
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const box = await locator.boundingBox();
  if (!box) throw new Error("Missing deterministic pointer target");
  return () => page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 25), { button });
}
const visible = (selector) => page.waitForFunction((selector) => {
  const node = document.querySelector(selector);
  return node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden";
}, selector, { polling: "raf", timeout: 45000 });
const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function measure(name, action, ready) {
  const before = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const styleTrace = process.argv.includes("--style-trace") && name === "create-dialog-0";
  if (styleTrace) await cdp.send("Tracing.start", {categories:"devtools.timeline,disabled-by-default-blink.debug,disabled-by-default-devtools.timeline.invalidationTracking",transferMode:"ReturnAsStream"});
  if (profile) await cdp.send("Profiler.start");
  const start = await page.evaluate(() => performance.timeOrigin + performance.now());
  const actionDetails = await action();
  const gestureEnd = await page.evaluate(() => performance.timeOrigin + performance.now());
  if (ready) await ready();
  await frames();
  const useful = await page.evaluate(() => performance.timeOrigin + performance.now());
  await page.waitForTimeout(tailMs);
  const observed = await page.evaluate(({ start, useful }) => {
    const from = Math.max(0, start - performance.timeOrigin);
    const until = useful - performance.timeOrigin;
    const select = (key, predicate) => window.__perf[key].filter((entry) => entry.start >= from && predicate(entry));
    const immediate = select("longTasks", (entry) => entry.start <= until);
    const deferred = select("longTasks", (entry) => entry.start > until);
    const storage = select("storage", () => true);
    return { origin: performance.timeOrigin, immediateLongTaskMs: immediate.reduce((sum, e) => sum + e.duration, 0), deferredLongTaskMs: deferred.reduce((sum, e) => sum + e.duration, 0), longTasks: [...immediate, ...deferred], maxFrameMs: Math.max(0, ...select("frames", () => true).map((entry) => entry.duration)), storage, styleSheets: document.styleSheets.length, connectedNodes: document.getElementsByTagName("*").length, resources: performance.getEntriesByType("resource").filter((e) => e.startTime >= from).map((e) => ({path: new URL(e.name).pathname, start: e.startTime, duration: e.duration, ttfb: e.responseStart - e.requestStart, transferSize: e.transferSize, decodedBodySize: e.decodedBodySize})) };
  }, { start, useful });
  const after = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const counter = (key) => 1000 * (after[key] - (observed.origin > start ? 0 : before[key]));
  const result = { name, actionDetails, gestureMs: gestureEnd - start, usefulMs: useful - start, ...observed, scriptMs: counter("ScriptDuration"), layoutMs: counter("LayoutDuration"), styleMs: counter("RecalcStyleDuration"), jsHeapBytes: after.JSHeapUsedSize, nodes: after.Nodes };
  if (profile) {
    const { profile: cpu } = await cdp.send("Profiler.stop");
    await writeFile(`${output}/${label}-${name}.cpuprofile`, JSON.stringify(cpu));
  }
  if (styleTrace) {
    const completed = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
    await cdp.send("Tracing.end");
    const {stream} = await completed;
    let trace = "";
    for (;;) { const chunk = await cdp.send("IO.read", {handle:stream}); trace += chunk.data; if (chunk.eof) break; }
    await cdp.send("IO.close", {handle:stream});
    await writeFile(`${output}/${label}-${name}.trace.json`, trace);
  }
  measurements.push(result);
  console.log(JSON.stringify({ name, usefulMs: result.usefulMs, scriptMs: result.scriptMs, styleMs: result.styleMs, layoutMs:result.layoutMs, immediateLongTaskMs: result.immediateLongTaskMs, deferredLongTaskMs: result.deferredLongTaskMs, nodes: result.connectedNodes }));
}
async function memorySample(name) {
  await page.evaluate(() => { delete window.__perfCard; delete window.__perfEditor; });
  await cdp.send("HeapProfiler.collectGarbage");
  const values = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  memory.push({ name, heapBytes: values.JSHeapUsedSize, nodes: values.Nodes, documents: values.Documents, listeners: values.JSEventListeners, connectedNodes: await page.evaluate(() => document.getElementsByTagName("*").length) });
}
async function closeDialog() {
  await page.keyboard.press("Escape");
  await page.locator('[role="dialog"]').first().waitFor({ state: "hidden" });
  await page.waitForTimeout(250);
}
async function readyIssueEditor() {
  await page.waitForFunction(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((node) => node.getClientRects().length);
    return dialog?.querySelector("textarea")?.value === "Performance task 1.1: Navigation state" &&
      [...dialog.querySelectorAll('[contenteditable="true"]')].some((node) => node.getClientRects().length && node.textContent.length > 100);
  }, null, { polling: "raf", timeout: 45000 });
}
try {
  const tabsResponse = await context.request.get(`${base}/api/me/app-tabs`);
  if (!tabsResponse.ok()) throw new Error("Could not prepare account tabs");
  const tabs = await tabsResponse.json();
  for (const [index, name, href] of [[0, "Performance board", "/all"], [1, "Performance pages", `/projects/${fixture.projects[0]}/pages`]]) {
    const tab = tabs.find((tab) => tab.custom_name === name) ?? tabs[index];
    if (!tab) throw new Error("Run the original measurement harness to prepare benchmark tabs");
    const response = await context.request.patch(`${base}/api/me/app-tabs/${tab.id}`, { data: { revision: tab.revision, patch: { href, custom_name: name } } });
    if (!response.ok()) throw new Error("Could not configure benchmark tab");
  }
  const cardSelector = `[data-issue-id="${fixture.firstIssue}"]`;
  await measure("cold-board", () => page.goto(`${base}/all`, { waitUntil: "domcontentloaded" }), () => visible(cardSelector));
  await memorySample("cold-board-settled");
  if (process.argv.includes("--restore")) {
    await measure("board-cache-restore", () => page.reload({ waitUntil: "domcontentloaded" }), () => visible(cardSelector));
    await memorySample("restored-board-settled");
  }
  if (process.argv.includes("--css-probe")) {
    await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        const visit = (rules) => { for (const rule of rules) {
          if (rule.cssRules) visit(rule.cssRules);
          if (rule.selectorText?.includes(":has([data-sidebar-hidden=")) {
            rule.selectorText = rule.selectorText.replaceAll('.app-shell:has([data-sidebar-hidden="true"])', 'html[data-perf-sidebar-hidden="true"] .app-shell').replaceAll('body:has([data-sidebar-hidden="true"])', 'html[data-perf-sidebar-hidden="true"] body');
          }
        } };
        try { visit(sheet.cssRules); } catch { /* Cross-origin sheets are not part of this probe. */ }
      }
      const sync = () => document.documentElement.setAttribute("data-perf-sidebar-hidden", document.querySelector('[data-sidebar-hidden="true"]') ? "true" : "false");
      new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-sidebar-hidden"] }); sync();
    });
  }
  if (process.argv.includes("--visibility-probe")) await page.addStyleTag({ content: '[data-issue-id] { content-visibility: auto; contain-intrinsic-size: auto 120px; }' });
  if (process.argv.includes("--cold-only")) {
    console.log("Cold visit and deferred-work observation complete");
  } else if (process.argv.includes("--inspect")) {
    console.log((await page.locator("body").innerText()).slice(0, 12000));
    await page.screenshot({ path: `${output}/${label}-board.png` });
  } else if (process.argv.includes("--broad")) {
    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(700);
    console.log("PALETTE", await page.locator('input').evaluateAll((nodes) => nodes.map((n) => ({ placeholder: n.placeholder, role: n.getAttribute("role") }))));
    const search = page.locator('[role="dialog"] input').first();
    if (await search.count()) {
      for (const [index, needle] of ["Performance task 1.49", "Performance task 1.50", "Performance task 1.51"].entries()) {
        await measure(`search-type-${index}`, () => search.fill(needle), () => page.waitForFunction((needle) =>
          [...document.querySelectorAll('[role="dialog"] [role="option"]')].some((node) => node.textContent.includes(needle) && node.getClientRects().length), needle));
        await measure(`search-keyboard-${index}`, () => page.keyboard.press("ArrowDown"), () => visible('[role="dialog"] [role="option"][aria-selected="true"]'));
      }
    }
    await page.keyboard.press("Escape");
    for (const route of ["/home", "/statistics", "/inbox", "/routines", "/agents", "/settings", `/projects/${fixture.projects[0]}`, `/projects/${fixture.projects[0]}/objectives`, `/projects/${fixture.projects[0]}/triage`, `/projects/${fixture.projects[0]}/settings`]) {
      const destination = route === "/inbox" ? "/home?inbox=1" : route === "/agents" ? "/home" : route;
      await page.evaluate(({ owner, destination }) => {
        const key = `minddy.app-tabs.${owner}`;
        const previous = JSON.parse(sessionStorage.getItem(key) ?? "null");
        if (previous) sessionStorage.setItem(key, JSON.stringify({ ...previous, href: destination }));
      }, { owner: fixture.userId, destination });
      await measure(`route-shell-${route.replaceAll("/", "_")}`, async () => {
        await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
        await page.waitForURL(`${base}${destination}`);
      }, () => visible(".app-shell"));
      console.log("ROUTE", route, (await page.locator("main").innerText()).slice(0, 4000));
      await page.screenshot({ path: `${output}/${label}-${route.split("/").at(-1)}.png` });
    }
    await memorySample("broad-routes");
  } else {
    if (!process.argv.includes("--tabs-only")) {
      for (let run = 0; run < repeats; run++) {
        await measure(`sidebar-hide-${run}`, await pointer(page.locator('.app-top-bar button[aria-label="Hide sidebar"]')), () => visible('.app-top-bar button[aria-label="Show sidebar"]'));
        await measure(`sidebar-show-${run}`, await pointer(page.locator('.app-top-bar button[aria-label="Show sidebar"]')), () => visible('.app-top-bar button[aria-label="Hide sidebar"]'));
        await measure(`issue-open-${run}`, await pointer(page.locator(cardSelector)), process.argv.includes("--interactive-ready") ? readyIssueEditor : () => visible('[role="dialog"]'));
        await closeDialog();
        await measure(`issue-menu-${run}`, await pointer(page.locator(cardSelector), "right"), () => visible('[role="menu"]'));
        await page.keyboard.press("Escape");
        await measure(`create-dialog-${run}`, await pointer(page.getByText("New issue", { exact: true }).first()), () => visible('[role="dialog"]'));
        await closeDialog();
      }
      if (!process.argv.includes("--board-only")) for (let run = 0; run < Math.min(3, repeats); run++) {
        async function drag(status, record) {
          await page.locator(cardSelector).scrollIntoViewIfNeeded();
          const source = await page.locator(cardSelector).boundingBox();
          const target = await page.locator(`[data-board-column-status="${status}"]`).boundingBox();
          if (!source || !target) throw new Error("Missing drag geometry");
          await page.mouse.move(source.x + source.width / 2, source.y + 40);
          const gesture = async () => {
            const started = await page.evaluate(() => performance.now());
            await page.mouse.down();
            await page.mouse.move(source.x + source.width / 2 + 12, source.y + 40, { steps: 3 });
            const activated = await page.evaluate(() => performance.now());
            await page.mouse.move(target.x + target.width / 2, target.y + 60, { steps: 12 });
            const moved = await page.evaluate(() => performance.now());
            await page.mouse.up();
            return page.evaluate(({started, activated, moved}) => {
              const dropped = performance.now();
              const stats = (from, to) => ({durationMs:to-from, maxFrameMs:Math.max(0,...window.__perf.frames.filter((f)=>f.start>=from && f.start<=to).map((f)=>f.duration)), longTaskMs:window.__perf.longTasks.filter((t)=>t.start>=from && t.start<=to).reduce((sum,t)=>sum+t.duration,0)});
              return {activation:stats(started,activated),move:stats(activated,moved),drop:stats(moved,dropped)};
            }, {started, activated, moved});
          };
          if (record) await measure(`drag-issue-${run}`, gesture, () => visible(`${cardSelector}[data-column-status="${status}"]`));
          else { await gesture(); await visible(`${cardSelector}[data-column-status="${status}"]`); await page.waitForTimeout(tailMs); }
        }
        await drag("todo", true);
        await drag("backlog", false);
      }
    }
    if (!process.argv.includes("--board-only")) {
    const pageHref = `/projects/${fixture.projects[0]}/pages/${fixture.firstPage}`;
    const pageTab = page.locator('[data-app-tab-id][aria-label="Performance pages"]');
    const boardTab = page.locator('[data-app-tab-id][aria-label="Performance board"]');
    await measure("tab-pages-first", await pointer(pageTab), () => visible(`a[href="${pageHref}"]`));
    const pageLink = page.locator(`a[href="${pageHref}"]`).first();
    await pageLink.hover();
    await page.waitForTimeout(800);
    await measure("page-open-prefetched", await pointer(pageLink), () => visible(".page-editor .tiptap"));
    await page.evaluate(() => { window.__perfEditor = document.querySelector(".page-editor .tiptap"); });
    for (let run = 0; run < repeats; run++) {
      await measure(`tab-board-${run}`, await pointer(boardTab), () => visible(cardSelector));
      if (run === 0) await page.evaluate((selector) => { window.__perfCard = document.querySelector(selector); }, cardSelector);
      else identity.push({ name: `board-${run}`, retained: await page.evaluate((selector) => window.__perfCard === document.querySelector(selector), cardSelector) });
      await measure(`tab-page-${run}`, await pointer(pageTab), () => visible(".page-editor .tiptap"));
      identity.push({ name: `page-${run}`, retained: await page.evaluate(() => window.__perfEditor === document.querySelector(".page-editor .tiptap")) });
    }
    await memorySample("tab-roundtrips");
    await measure("page-menu", await pointer(page.locator('.app-content-header button[aria-label="Page options"]')), () => visible('[role="menu"]'));
    await page.keyboard.press("Escape");
    await measure("page-comments", await pointer(page.locator('.app-content-header button[aria-label="Comments"]')), () => visible('[role="textbox"][contenteditable="true"]'));
    const composer = page.locator('[role="textbox"][contenteditable="true"]').last();
    const comment = `Performance pass two ${Date.now()}`;
    await composer.fill(comment);
    await page.evaluate((text) => {
      window.__commentMilestones = { start: performance.now(), visible: null, clear: null, confirmed: null };
      const observe = () => {
        const milestones = window.__commentMilestones;
        if (milestones.clear === null && [...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].at(-1)?.textContent === "") milestones.clear = performance.now();
        const body = [...document.querySelectorAll("p")].find((p) => p.textContent === text && !p.closest('[contenteditable="true"]'));
        if (milestones.visible === null && body) milestones.visible = performance.now();
        if (milestones.confirmed === null && body?.closest('[data-comment-state="confirmed"]')) milestones.confirmed = performance.now();
      };
      const observer = new MutationObserver(observe); observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-comment-state"] });
      window.__commentObserver = observer;
    }, comment);
    let acknowledgement;
    let reconciliationRead;
    const reconciled = page.waitForResponse((response) => response.url().endsWith(`/pages/${fixture.firstPage}/comments`) && response.request().method() === "GET", { timeout: 15000 }).then(async () => {
      reconciliationRead = await page.evaluate(() => performance.now());
    }).catch(() => {});
    const posted = page.waitForResponse((response) => response.url().endsWith(`/pages/${fixture.firstPage}/comments`) && response.request().method() === "POST").then(async (response) => {
      acknowledgement = await page.evaluate(() => performance.now()); return response;
    });
    await measure("page-comment-submit", () => composer.press("ControlOrMeta+Enter"), () => page.waitForFunction(() => window.__commentMilestones.visible !== null && window.__commentMilestones.clear !== null));
    const response = await posted;
    if (!response.ok()) throw new Error("Benchmark comment failed");
    const saved = await response.json();
    await reconciled;
    const milestones = await page.evaluate(() => { window.__commentObserver.disconnect(); return window.__commentMilestones; });
    measurements.push({ name: "comment-milestones", visualMs: milestones.visible - milestones.start, composerMs: milestones.clear - milestones.start, acknowledgementMs: acknowledgement - milestones.start,
      confirmedDomMs: milestones.confirmed === null ? null : milestones.confirmed - milestones.start,
      reconciliationReadMs: reconciliationRead === undefined ? null : reconciliationRead - milestones.start });
    const removed = await context.request.delete(`${base}/api/projects/${fixture.projects[0]}/pages/${fixture.firstPage}/comments/${saved.id}`);
    if (!removed.ok()) throw new Error("Could not remove benchmark comment");
    await page.screenshot({ path: `${output}/${label}-page.png` });
    await page.keyboard.press("Escape");
    if (process.argv.includes("--long-session")) {
      for (let run = 0; run < 15; run++) {
        await (await pointer(boardTab))(); await visible(cardSelector);
        await (await pointer(pageTab))(); await visible(".page-editor .tiptap");
        if (run === 14) {
          await measure("next-immediate-page-menu", await pointer(page.locator('.app-content-header button[aria-label="Page options"]')), () => visible('[role="menu"]'));
          await page.keyboard.press("Escape");
        }
        if (run % 5 === 4) { await page.waitForTimeout(tailMs); await memorySample(`long-session-${run+1}`); }
      }
      await measure("next-interaction-page-menu", await pointer(page.locator('.app-content-header button[aria-label="Page options"]')), () => visible('[role="menu"]'));
      await page.keyboard.press("Escape");
    }
    await measure("pull-request-list", () => page.goto(`${base}/pull-requests`, { waitUntil: "domcontentloaded" }), () => page.getByText("Performance change 1.1", { exact: true }).first().waitFor());
    await memorySample("pull-request-list-settled");
    }
  }
} catch (error) {
  runError = error.message;
  throw error;
} finally {
  await page.screenshot({ path: `${output}/${label}-final.png` }).catch(() => {});
  const finalLocation = new URL(page.url()).pathname;
  const finalText = await page.locator("main").innerText().then((text) => text.slice(0, 3500)).catch(() => "");
  await Promise.allSettled(pendingNetwork);
  const buildId = (await readFile(`${process.env.MINDDY_PERF_BUILD_DIR ?? ".next"}/BUILD_ID`, "utf8")).trim();
  await writeFile(`${output}/${label}.json`, JSON.stringify({ label, baseline: "ec6a12e94235b8c589d86637195ae24dfad28cd6", timestamp: new Date().toISOString(), runnerRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), buildId, browser: browser.version(), viewport, cpuRate, networkEmulation: process.argv.includes("--network"), interactiveIssueReady: process.argv.includes("--interactive-ready"), tailMs, repeats, fixture: fixture.counts, finalLocation, finalText, measurements, identity, memory, network, failures, runError }, null, 2));
  await browser.close();
}
