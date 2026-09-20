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
// Per-request decomposition (Axis 2): the Network domain records each request's
// connection setup, server wait, content download and decoded/wire size, so
// network-sensitive numbers (cold board load, PR list, comment acknowledgement)
// decompose into reproducible phases instead of anecdotes.
await cdp.send("Network.enable");
const networkRequests = new Map();
function recordNetworkPhase(requestId, patch) {
  const entry = networkRequests.get(requestId);
  if (entry) Object.assign(entry, patch);
}
cdp.on("Network.requestWillBeSent", (event) => {
  // Data URLs never reach the network; frame-scoped service-worker requests
  // report their own network events and are keyed the same way.
  if (event.request.url.startsWith("data:")) return;
  networkRequests.set(event.requestId, {
    url: event.request.url,
    path: new URL(event.request.url).pathname,
    method: event.request.method,
    at: event.wallTime,
    decodedBytes: 0,
    wireBytes: 0,
  });
});
cdp.on("Network.responseReceived", (event) => {
  recordNetworkPhase(event.requestId, {
    status: event.response.status,
    fromCache: event.response.fromDiskCache,
    waitMs: Math.max(0, (event.response.timing?.receiveHeadersEnd ?? 0) - (event.response.timing?.sendEnd ?? 0)),
    setupMs: Math.max(0, event.response.timing?.connectEnd ?? 0),
    mimeType: event.response.mimeType,
  });
});
cdp.on("Network.dataReceived", (event) => {
  const entry = networkRequests.get(event.requestId);
  if (entry) {
    entry.decodedBytes += event.dataLength;
    entry.wireBytes += event.encodedDataLength;
  }
});
cdp.on("Network.loadingFailed", (event) => {
  recordNetworkPhase(event.requestId, { failed: event.errorText, canceled: event.canceled });
});
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const responses = [];
page.on("response", (response) => {
  if (response.url().startsWith(`${base}/api/`)) responses.push({ path: new URL(response.url()).pathname, status: response.status(), at: Date.now() });
});
await context.addInitScript(() => {
  localStorage.setItem("cookie_consent", "declined");
  window.__perf = { longTasks: [], events: [], frames: [], storage: [] };
  for (const [type, key] of [["longtask", "longTasks"], ["event", "events"]]) {
    try { new PerformanceObserver((list) => window.__perf[key].push(...list.getEntries().map((entry) => ({ name: entry.name, start: entry.startTime, duration: entry.duration, // INP-style probes: real user interactions carry an interactionId and their input/processing phases.
      interactionId: entry.interactionId ?? 0, processingStart: entry.processingStart ?? 0, processingEnd: entry.processingEnd ?? 0 })))).observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) }); } catch { /* Unsupported browser entries are omitted. */ }
  }
  let previous = performance.now();
  function frame(now) { window.__perf.frames.push({ start: previous, duration: now - previous }); previous = now; requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) { const start = performance.now(); const result = setItem.call(this, key, value); if (key === "minddy.query-cache") window.__perf.storage.push({ start, duration: performance.now() - start, bytes: value.length }); return result; };
});
const measurements = [];
async function measure(name, action, ready) {
  const before = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const absoluteStart = await page.evaluate(() => performance.timeOrigin + performance.now());
  const wallStart = Date.now();
  await action();
  if (ready) await ready();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const { visual, origin } = await page.evaluate(() => ({ visual: performance.now(), origin: performance.timeOrigin }));
  const start = Math.max(0, absoluteStart - origin);
  await page.waitForTimeout(350);
  const stats = await page.evaluate(({ start, visual }) => {
    const select = (key) => window.__perf[key].filter((entry) => entry.start >= start && entry.start <= visual + 350);
    // INP-style decomposition of the window's real interactions: the slowest
    // interaction's input delay, processing time and presentation delay.
    const interactions = select("events").filter((entry) => entry.interactionId > 0);
    const worst = interactions.reduce((max, entry) => (entry.duration > (max?.duration ?? -1) ? entry : max), null);
    return { readyMs: visual - start, longTaskMs: select("longTasks").reduce((sum, entry) => sum + entry.duration, 0), longTasks: select("longTasks").length, maxFrameMs: Math.max(0, ...select("frames").map((entry) => entry.duration)), maxEventMs: Math.max(0, ...select("events").map((entry) => entry.duration)), storageWrites: select("storage").length, storageBytes: select("storage").reduce((sum, entry) => sum + entry.bytes, 0), styleSheets: document.styleSheets.length, inpMs: worst?.duration ?? 0, inpInputMs: worst ? Math.max(0, worst.processingStart - worst.start) : 0, inpProcessingMs: worst ? Math.max(0, worst.processingEnd - worst.processingStart) : 0, inpPresentMs: worst ? Math.max(0, worst.duration - (worst.processingEnd - worst.start)) : 0, interactions: interactions.length };
  }, { start, visual });
  const after = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const counter = (name) => (after[name] - (origin > absoluteStart ? 0 : before[name])) * 1000;
  // Per-request timing/size for the window: every network entry whose wallTime
  // (epoch seconds) falls inside the measured interaction.
  const requestsInWindow = (fromWall, toWall) => [...networkRequests.values()]
    .filter((entry) => entry.at >= fromWall / 1000 && entry.at <= toWall / 1000)
    .sort((a, b) => a.at - b.at)
    .map(({ url, ...entry }) => ({ ...entry, url: url.startsWith(base) ? new URL(url).pathname : url }));
  const windowRequests = requestsInWindow(wallStart, Date.now());
  const result = { name, ...stats, readyMs: origin + visual - absoluteStart, scriptMs: counter("ScriptDuration"), layoutMs: counter("LayoutDuration"), styleMs: counter("RecalcStyleDuration"), nodes: after.Nodes, requests: responses.filter((response) => response.at >= wallStart), network: windowRequests };
  measurements.push(result);
  console.log(JSON.stringify(result));
}

try {
  const tabsResponse = await context.request.get(`${base}/api/me/app-tabs`);
  if (!tabsResponse.ok()) throw new Error("Could not prepare account tabs");
  const tabs = await tabsResponse.json();
  for (const [index, name, href] of [[0, "Performance board", "/all"], [1, "Performance pages", `/projects/${fixture.projects[0]}/pages`]]) {
    let tab = tabs.find((tab) => tab.custom_name === name) ?? tabs[index];
    if (!tab) {
      const response = await context.request.post(`${base}/api/me/app-tabs`, { data: { id: id(`benchmark-tab-${index}`) } });
      if (!response.ok()) throw new Error("Could not create benchmark tab");
      tab = (await response.json()).tab;
    }
    const response = await context.request.patch(`${base}/api/me/app-tabs/${tab.id}`, { data: { revision: tab.revision, patch: { href, custom_name: name } } });
    if (!response.ok()) throw new Error("Could not configure benchmark tab");
  }
  const started = Date.now();
  const coldNetworkStart = started / 1000;
  await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-issue-id]").first().waitFor({ timeout: 90000 });
  // Decomposition of the cold load: every request between navigation start and
  // the first visible card, with its phases, so the headline number splits into
  // document wait, API waits and transfer sizes per endpoint.
  const coldRequests = [...networkRequests.values()]
    .filter((entry) => entry.at >= coldNetworkStart)
    .sort((a, b) => a.at - b.at)
    .map(({ url, ...entry }) => ({ ...entry, url: url.startsWith(base) ? new URL(url).pathname : url }));
  measurements.push({ name: "cold-board", readyMs: Date.now() - started, network: coldRequests });
  await page.waitForTimeout(2000);
  if (process.argv.includes("--visual")) {
    const card = page.locator(`[data-issue-id="${fixture.firstIssue}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.locator("[data-beam][data-active]").waitFor();
    const cardElement = await card.elementHandle();
    await page.waitForTimeout(1000);
    await card.screenshot({ path: `${output}/active-agent-card.png` });
    beamActive = false;
    await card.locator("[data-beam]").waitFor({ state: "detached", timeout: 12000 });
    const preserved = await card.evaluate((node, previous) => node === previous, cardElement);
    if (!preserved) throw new Error("The agent halo remounted the issue card");
    await card.screenshot({ path: `${output}/inactive-agent-card.png` });
    await page.screenshot({ path: `${output}/after-board.png` });
    measurements.push({ name: "active-halo-retains-card", passed: preserved });
  }
  else if (mobile) {
    await page.goto(`${base}/projects/${fixture.projects[0]}/pages/${fixture.firstPage}`);
    await page.locator(".page-editor .tiptap").waitFor();
    await page.screenshot({ path: `${output}/mobile-page.png` });
    await page.locator('.app-content-header button[aria-label="Comments"]').click();
    await page.locator('[role="textbox"][contenteditable="true"]').last().waitFor();
    await page.waitForTimeout(1000);
    if (await page.locator(".page-editor .tiptap").count() !== 1) throw new Error("Mobile comments unmounted the editor");
    await page.screenshot({ path: `${output}/mobile-comments.png` });
    measurements.push({ name: "mobile-comments-retain-editor", passed: true });
  }
  else if (process.argv.includes("--inspect-page")) {
    await page.locator('[data-app-tab-id][aria-label="Performance pages"]').click();
    await page.locator(`a[href="/projects/${fixture.projects[0]}/pages/${fixture.firstPage}"]`).first().click();
    await page.locator(".page-editor .tiptap").waitFor();
    await page.locator('.app-content-header button[aria-label="Comments"]').click();
    await page.waitForTimeout(1000);
    console.log((await page.locator("body").innerText()).slice(-18000));
    console.log(await page.locator("[contenteditable], textarea, input").evaluateAll((nodes) => nodes.map((node) => ({ tag: node.tagName, role: node.getAttribute("role"), placeholder: node.getAttribute("placeholder"), label: node.getAttribute("aria-label"), class: node.className }))));
    await page.screenshot({ path: `${output}/inspect-page.png` });
  }
  else if (process.argv.includes("--inspect")) {
    console.log((await page.locator("body").innerText()).slice(0, 18000));
    await page.screenshot({ path: `${output}/inspect.png` });
  } else {
    for (let run = 0; run < (process.argv.includes("--surfaces-only") ? 0 : 3); run++) {
      await measure(`sidebar-hide-${run}`, () => page.locator('.app-top-bar button[aria-label="Hide sidebar"]').click(), () => page.locator('.app-top-bar button[aria-label="Show sidebar"]').waitFor());
      await measure(`sidebar-show-${run}`, () => page.locator('.app-top-bar button[aria-label="Show sidebar"]').click(), () => page.locator('.app-top-bar button[aria-label="Hide sidebar"]').waitFor());
      await measure(`issue-open-${run}`, () => page.locator("[data-issue-id]").first().click(), () => page.locator('[role="dialog"]').first().waitFor());
      await page.keyboard.press("Escape");
      await page.locator('[role="dialog"]').first().waitFor({ state: "hidden" });
      await measure(`issue-menu-${run}`, () => page.locator("[data-issue-id]").first().click({ button: "right" }), () => page.locator('[role="menu"]').first().waitFor());
      await page.keyboard.press("Escape");
      // Input-driven scroll of the 600-card board: the pointer rests over the
      // first column so wheel events go to its scroller, then the wheel returns
      // to the top. Paint/composite cost of the visible-card churn shows up in
      // the frame/style/layout counters.
      await measure(`board-scroll-${run}`, async () => {
        await page.locator('[data-board-column-status="backlog"] [data-issue-id]').first().hover();
        await page.mouse.wheel(0, 1400);
        await page.waitForTimeout(120);
        await page.mouse.wheel(0, -1400);
      });
    }
    if (process.argv.includes("--board-only")) {
      console.log("Board-only measurements complete");
    } else {
    await measure("create-dialog", () => page.getByText("New issue", { exact: true }).first().click(), () => page.locator('[role="dialog"]').first().waitFor());
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"]').first().waitFor({ state: "hidden" });
    const card = page.locator('[data-board-column-status="backlog"] [data-issue-id]').first();
    const draggedId = await card.getAttribute("data-issue-id");
    async function dragTo(status) {
      const source = await page.locator(`[data-issue-id="${draggedId}"]`).boundingBox();
      const target = await page.locator(`[data-board-column-status="${status}"]`).boundingBox();
      if (!source || !target) throw new Error("Missing drag geometry");
      await page.mouse.move(source.x + source.width / 2, source.y + 70);
      await page.mouse.down();
      await page.mouse.move(source.x + source.width / 2 + 12, source.y + 70, { steps: 3 });
      await page.mouse.move(target.x + target.width / 2, target.y + 60, { steps: 12 });
      await page.mouse.up();
      await page.locator(`[data-issue-id="${draggedId}"][data-column-status="${status}"]`).waitFor();
    }
    await measure("drag-issue", () => dragTo("todo"));
    await dragTo("backlog");
    const pageHref = `/projects/${fixture.projects[0]}/pages/${fixture.firstPage}`;
    await measure("tab-to-pages-cold", () => page.locator('[data-app-tab-id][aria-label="Performance pages"]').click(), () => page.locator(`a[href="${pageHref}"]`).first().waitFor());
    const pageLink = page.locator(`a[href="${pageHref}"]`).first();
    await pageLink.hover();
    await page.waitForTimeout(800);
    await measure("page-open-prefetched", () => pageLink.click(), () => page.locator(".page-editor .tiptap").waitFor());
    await measure("page-menu", () => page.locator('.app-content-header button[aria-label="Page options"]').click(), () => page.locator('[role="menu"]').first().waitFor());
    await page.keyboard.press("Escape");
    // Prepared-cache eligibility must not expire on an already open editor.
    await page.waitForTimeout(11000);
    await measure("page-comments-after-prefetch-ttl", () => page.locator('.app-content-header button[aria-label="Comments"]').click());
    const editorSurvived = await page.locator(".page-editor .tiptap").count();
    measurements.push({ name: "editor-survives-prefetch-ttl", passed: editorSurvived === 1 });
    await page.screenshot({ path: `${output}/${process.env.MINDDY_PERF_LABEL ?? "baseline"}-page.png` });
    await page.keyboard.press("Escape");
    if (!editorSurvived) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".page-editor .tiptap").waitFor();
    }
    await measure("page-comments", () => page.locator('.app-content-header button[aria-label="Comments"]').click(), () => page.locator('[role="textbox"]').last().waitFor());
    const composer = page.locator('[role="textbox"][contenteditable="true"]').last();
    const comment = `Performance benchmark ${Date.now()}`;
    await composer.fill(comment);
    const posted = page.waitForResponse((response) => response.url().endsWith(`/pages/${fixture.firstPage}/comments`) && response.request().method() === "POST");
    await measure("page-comment-submit", () => composer.press("ControlOrMeta+Enter"), () => page.waitForFunction(() => [...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].at(-1)?.textContent === ""));
    const postedResponse = await posted;
    if (!postedResponse.ok()) throw new Error("Benchmark comment failed");
    const savedComment = await postedResponse.json();
    const removed = await context.request.delete(`${base}/api/projects/${fixture.projects[0]}/pages/${fixture.firstPage}/comments/${savedComment.id}`);
    if (!removed.ok()) throw new Error("Could not remove the benchmark comment");
    await page.keyboard.press("Escape");
    for (let run = 0; run < 3; run++) {
      await measure(`tab-to-board-${run}`, () => page.locator('[data-app-tab-id][aria-label="Performance board"]').click(), () => page.locator("[data-issue-id]").first().waitFor());
      await measure(`tab-to-page-${run}`, () => page.locator('[data-app-tab-id][aria-label="Performance pages"]').click(), () => page.locator(".page-editor .tiptap").waitFor());
    }
    // Cold tab creation (fourth pass): a brand-new tab only has the
    // destination palette. Hovering the destination is the measured intent
    // window — the palette may prefetch the route and its queries there;
    // the recorded action starts at the click. Tabs pinned on the same
    // destination are closed beforehand (API delete + a reload so the strip
    // matches the account deterministically) so every sample is a true cold
    // open; the reload also clears the router cache between samples. The
    // board tab is activated first so the deleted tab is never the active
    // one, and the reload never has to invent a row for the current URL.
    async function activateBoardTab() {
      const board = page.locator('[data-app-tab-id][aria-label="Performance board"]');
      if ((await board.count()) > 0) await board.click();
      else {
        await page.locator('button[aria-label="More tabs"]').click();
        await page.getByRole("menuitem", { name: "Performance board" }).click();
      }
      await page.locator("[data-issue-id]").first().waitFor({ timeout: 90000 });
    }
    async function newTabCold(destination, itemLabel, ready, run) {
      await activateBoardTab();
      for (let attempt = 0; attempt < 10; attempt++) {
        const tabsResponse = await context.request.get(`${base}/api/me/app-tabs`);
        if (!tabsResponse.ok()) throw new Error("Could not list app tabs");
        const stale = (await tabsResponse.json()).filter((tab) => (tab.href ?? "").split(/[?#]/)[0] === destination);
        if (stale.length === 0) break;
        for (const tab of stale) {
          const response = await context.request.delete(`${base}/api/me/app-tabs/${tab.id}`, { data: { revision: tab.revision } });
          if (!response.ok()) await page.waitForTimeout(500);
        }
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator("[data-app-tab-id]").first().waitFor({ timeout: 60000 });
        await page.waitForTimeout(1500);
      }
      const plusButton = page.locator('button[aria-label="New tab"]');
      if ((await plusButton.count()) > 0) await plusButton.click();
      else {
        await page.locator('button[aria-label="More tabs"]').click();
        await page.getByRole("menuitem", { name: "New tab" }).click();
      }
      const item = page.getByRole("option").filter({ hasText: itemLabel }).first();
      await item.hover();
      await page.waitForTimeout(800);
      await measure(`new-tab-${destination === "/routines" ? "routines" : "pull-requests"}-${run}`, () => item.click(), ready);
      await page.waitForTimeout(500);
    }
    for (let run = 0; run < 3; run++) {
      await newTabCold("/routines", "Routines", () => page.getByText(/No routine yet|Link a GitHub or GitLab repository|Create a project to give scheduled|Only a project's owner can schedule|the built-in scheduler is not configured|has no server sandbox/).first().waitFor(), run);
      await newTabCold("/pull-requests", "Pull requests", () => page.getByText("Performance change 1.1", { exact: true }).first().waitFor(), run);
    }
    await measure("pull-request-list", () => page.goto(`${base}/pull-requests`, { waitUntil: "domcontentloaded" }), () => page.getByText("Performance change 1.1", { exact: true }).first().waitFor());
    }
  }
} finally {
  const label = process.env.MINDDY_PERF_LABEL ?? "baseline";
  const buildId = (await readFile(`${process.env.MINDDY_PERF_BUILD_DIR ?? ".next"}/BUILD_ID`, "utf8")).trim();
  // The runner can target a separately built reference server. Its checkout
  // revision describes the harness; buildId identifies the measured server.
  const runnerRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const runnerHasChanges = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
  await writeFile(`${output}/${label}.json`, JSON.stringify({ label, timestamp: new Date().toISOString(), runnerRevision, runnerHasChanges, buildId, browser: browser.version(), viewport, fixture: fixture.counts, measurements, failures, responses }, null, 2));
  await browser.close();
}
