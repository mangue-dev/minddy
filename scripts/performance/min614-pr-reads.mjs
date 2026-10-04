// Read-only native production cohorts. Authentication stays in this process.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const base = "http://localhost:3111";
const output = path.resolve("output/playwright/performance");
const label = process.env.MINDDY_PERF_LABEL;
assert.match(label ?? "", /^[a-zA-Z0-9_-]+$/);
const buildSha = process.env.MINDDY_PERF_BUILD_SHA;
assert.match(buildSha ?? "", /^[a-f0-9]{40}$/);
const source = await chromium.connectOverCDP("http://127.0.0.1:9341");
const sourceContext = source.contexts()[0];
const cookies = await sourceContext.cookies(base);
assert.ok(cookies.some((cookie) => cookie.name.includes("auth-token")));
const storage = await sourceContext.pages()[0].evaluate(() => Object.fromEntries(
  Object.entries(sessionStorage).filter(([key]) => key.startsWith("minddy.app-tabs.")),
));
await source.close();
await mkdir(output, { recursive: true });
const workload = JSON.parse(await readFile(`${output}/pass3e-personal-initial.json`, "utf8"));
const pulls = workload.prs.pullRequests;
const targets = [339, 342].map((number) => {
  const pr = pulls.find((pr) => pr.pr_number === number && pr.pr_url === `https://github.com/mangue-dev/minddy/pull/${number}`);
  assert.ok(pr, "Only the explicitly selected authorized repository is measured");
  return { number, id: pr.prId };
});
const originalTabs = workload.tabs;
const report = { label, buildSha, buildId: (await readFile(".next/BUILD_ID", "utf8")).trim(),
  runtime: { electron: JSON.parse(await readFile("desktop/node_modules/electron/package.json", "utf8")).version },
  definition: "Native page-origin live GET cluster; parsed detail/readiness/review surfaces. Separate commits GET. No DOM speedup inference.",
  launches: [], errors: [] };
const save = () => writeFile(`${output}/${label}.json`, JSON.stringify(report, null, 2));
for (let launch = 0; launch < 3; launch++) {
  const profile = await mkdtemp(path.join(tmpdir(), "minddy-min614-3e-reads-"));
  const port = 9342;
  const run = { launch, samples: [], requests: [], cleanup: false, ownedTabs: [] };
  report.launches.push(run);
  let browser, context, page;
  try {
    let occupied = false;
    try { await fetch(`http://127.0.0.1:${port}/json/version`); occupied = true; } catch {}
    assert.equal(occupied, false);
    execFileSync("open", ["-n", "-a", path.resolve("desktop/node_modules/electron/dist/Electron.app"),
      "--env", `MINDDY_DESKTOP_ORIGIN=${base}`, "--env", `MINDDY_DESKTOP_TEST_USER_DATA=${profile}`,
      "--args", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, path.resolve("desktop")]);
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await fetch(`http://127.0.0.1:${port}/json/version`); break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
    }
    const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((target) => target.type === "page");
    assert.ok(target);
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      const timeout = setTimeout(() => { socket.close(); reject(new Error("Initial renderer navigation timed out")); }, 10000);
      socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url: `${base}/login?mode=signin` } }));
      socket.onmessage = ({ data }) => { const response = JSON.parse(data); if (response.id !== 1) return;
        clearTimeout(timeout); socket.close(); if (response.error) reject(new Error(response.error.message)); else resolve(); };
    });
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    context = browser.contexts()[0]; page = context.pages()[0];
    await context.addCookies(cookies);
    await context.addInitScript(({ storage, base }) => {
      if (location.origin !== base) return;
      for (const [key, value] of Object.entries(storage)) sessionStorage.setItem(key, value);
      localStorage.setItem("cookie_consent", "declined");
      localStorage.setItem("minddy.trace", "1");
      window.__prPerf = { tasks: [], frames: [] };
      new PerformanceObserver((list) => window.__prPerf.tasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))).observe({ type: "longtask", buffered: true });
      let last = performance.now(); const frame = (now) => { window.__prPerf.frames.push({ startTime: last, duration: now - last }); last = now; requestAnimationFrame(frame); }; requestAnimationFrame(frame);
    }, { storage, base });
    await context.route(`${base}/api/**`, async (route) => {
      const request = route.request(), url = new URL(request.url());
      const navigationWrite = url.pathname.startsWith("/api/me/app-tabs") || url.pathname === "/api/me/local-snapshots";
      assert.ok(request.method() === "GET" || navigationWrite, `Unexpected personal-account write: ${request.method()} ${url.pathname}`);
      if (url.pathname === "/api/me/app-tabs" && request.method() === "POST") {
        const id = request.postDataJSON().id;
        assert.ok(id);
        if (!originalTabs.some((tab) => tab.id === id)) { run.ownedTabs.push(id); await save(); }
      }
      await route.continue();
    });
    const records = new WeakMap();
    page.on("request", (request) => {
      const url = new URL(request.url()); if (url.origin !== base || !url.pathname.startsWith("/api/")) return;
      const row = { path: url.pathname, method: request.method(), at: Date.now() }; records.set(request, row); run.requests.push(row);
    });
    page.on("requestfinished", async (request) => { const row = records.get(request); if (!row) return;
      row.ms = request.timing().responseEnd; try { row.bytes = await request.sizes(); } catch {} });
    page.on("response", (response) => { const row = records.get(response.request()); if (row) row.status = response.status(); });
    const cdp = await context.newCDPSession(page); await cdp.send("Performance.enable");
    const started = Date.now();
    await page.goto(`${base}/pull-requests?pr=${targets[1].id}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("pr-activity-timeline").waitFor({ timeout: 60000 });
    run.coldVisibleMs = Date.now() - started;
    run.renderer = await page.evaluate(() => ({ userAgent: navigator.userAgent, native: !!window.minddy, width: innerWidth, height: innerHeight }));
    assert.ok(run.renderer.native);
    await page.waitForTimeout(1000);
    for (let repetition = 0; repetition < 10; repetition++) {
      for (const target of targets) {
        const before = await cdp.send("Performance.getMetrics");
        const sample = await page.evaluate(async ({ target, repetition }) => {
          const startedAt = performance.timeOrigin + performance.now();
          const reads = ["", "/readiness", "/review-comments"];
          const responses = await Promise.all(reads.map(async (suffix) => {
            const start = performance.now(); const response = await fetch(`/api/pull-requests/${target.id}${suffix}`, { cache: "no-store" });
            const text = await response.text(); const data = JSON.parse(text);
            return { suffix, status: response.status, ms: performance.now() - start, bytes: new TextEncoder().encode(text).length,
              head: data.pr?.headSha, files: data.files?.length, readiness: data.readiness?.state,
              checks: data.checks?.checks?.length, threads: (data.reviewThreads ?? data.threads)?.length, comments: data.comments?.length };
          }));
          const ms = performance.timeOrigin + performance.now() - startedAt;
          const commitsStart = performance.now(); const commits = await fetch(`/api/pull-requests/${target.id}/commits`, { cache: "no-store" });
          const body = await commits.text(); const data = JSON.parse(body);
          return { target: target.number, repetition, startedAt, ms, responses,
            commits: { ms: performance.now() - commitsStart, status: commits.status, count: data.commits?.length, bytes: new TextEncoder().encode(body).length },
            tasks: window.__prPerf.tasks.filter((row) => row.startTime >= startedAt - performance.timeOrigin),
            frames: window.__prPerf.frames.filter((row) => row.startTime >= startedAt - performance.timeOrigin && row.duration > 50) };
        }, { target, repetition });
        const after = await cdp.send("Performance.getMetrics"); sample.counters = { before, after };
        run.samples.push(sample); await save();
        assert.ok(sample.responses.every((row) => row.status === 200 && (row.suffix !== "" || row.head)), "Live cluster failed");
        assert.equal(sample.commits.status, 200);
        console.log(JSON.stringify({ launch, repetition, target: target.number, ms: sample.ms, commitsMs: sample.commits.ms }));
      }
    }
    const idleStart = run.requests.length, beforeIdle = await cdp.send("Performance.getMetrics");
    await page.waitForTimeout(15000);
    run.idle = { ms: 15000, requests: run.requests.slice(idleStart), before: beforeIdle, after: await cdp.send("Performance.getMetrics") };
  } catch (error) { run.error = String(error); report.errors.push({ launch, error: String(error) }); throw error; }
  finally {
    if (page) {
      // This read-only runner refuses to repair an unexpected navigation write silently.
      const tabs = await page.evaluate(async () => (await fetch("/api/me/app-tabs")).json());
      const fields = (tab) => ({ id: tab.id, href: tab.href, pinned: tab.pinned, position: tab.position, custom_name: tab.custom_name });
      assert.deepEqual(tabs.map(fields), originalTabs.map(fields), "Personal navigation changed; stop until explicitly verified restoration");
      run.cleanup = true;
    }
    await save();
    if (browser) { await browser.contexts()[0].newCDPSession(browser.contexts()[0].pages()[0]).then((session) => session.send("Browser.close")).catch(() => {}); }
    // Browser.close acknowledges before all Chromium profile writers exit.
    for (let attempt = 0; attempt < 40; attempt++) {
      let alive = false;
      try { await fetch(`http://127.0.0.1:${port}/json/version`); alive = true; } catch {}
      if (!alive) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    assert.ok(run.cleanup, "No new launch after unverified cleanup");
  }
}
