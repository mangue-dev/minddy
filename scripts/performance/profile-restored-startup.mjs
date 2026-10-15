// Read-only startup profile on the local production server: opens /home and waits for the restored All destination.
// Cold = fresh context (no HTTP cache, no storage); warm = reload in the same context.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { openFixture } from "./stable-restored-tabs.mjs";
import { boardReady } from "./board-readiness.mjs";
import { loadForgeWorkload, loadConnectedBoardWorkload } from "./measure-forge-navigation.mjs";
import { secondaryManifestPath } from "./enrich-secondary-workload.mjs";

const label = process.argv[2] ?? "min683-restored-startup-profile";
const route = process.argv[3] ?? "/home";
const session = await openFixture();
const { base, cookies, api, fixture } = session;
await loadForgeWorkload(api);
const board = await loadConnectedBoardWorkload(api, fixture, JSON.parse(await readFile(secondaryManifestPath, "utf8")));
const readySpec = { source: boardReady.toString(), cards: board.cards, ids: board.cardIds };
// Restored destination: the fixture's active tab is All. A transient Home does not count.
function restoredAllComplete({ source, cards, ids }) {
  if (location.pathname !== "/all") return false;
  window.__restoredAll ??= new Function(`return (${source})`)();
  return window.__restoredAll(cards, undefined, ids);
}
const browser = await chromium.launch();
const runs = [];

// MINDDY_PERF_SEALED_SNAPSHOT=1: leave the five-second save/idle schedule time to seal the
// query cache before the same-context reload, so "warm" measures the relaunch path real users take.
const sealed = process.env.MINDDY_PERF_SEALED_SNAPSHOT === "1";

async function profile(page, kind) {
  await page.addInitScript(() => {
    window.__sealedAtStart = localStorage.getItem("minddy.query-cache") !== null;
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks.push([Math.round(e.startTime), Math.round(e.duration)]);
      }).observe({ type: "longtask", buffered: true });
    } catch {}
  });
  const started = Date.now();
  await page.goto(`${base}${route}`, { waitUntil: "commit" });
  await page.waitForFunction(restoredAllComplete, readySpec, { timeout: 30000, polling: 16 }).catch(async (error) => {
    console.log(page.url());
    await page.screenshot({ path: `output/playwright/performance/${label}-${kind}-failure.png` });
    throw error;
  });
  const readyMs = Date.now() - started;
  const data = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource").map((r) => ({
      name: r.name.replace(location.origin, ""), type: r.initiatorType,
      start: Math.round(r.startTime), end: Math.round(r.responseEnd), transfer: r.transferSize, decoded: r.decodedBodySize,
      // requestStart - startTime is browser queueing (HTTP/1.1 socket pool); nextHopProtocol confirms the transport.
      requestStart: Math.round(r.requestStart), responseStart: Math.round(r.responseStart), protocol: r.nextHopProtocol,
    }));
    return {
      nav: { ttfb: Math.round(nav.responseStart), docEnd: Math.round(nav.responseEnd), dcl: Math.round(nav.domContentLoadedEventEnd),
        load: Math.round(nav.loadEventEnd), docTransfer: nav.transferSize, docDecoded: nav.decodedBodySize },
      readyAt: Math.round(performance.now()), longTasks: window.__longTasks, res, sealedAtStart: window.__sealedAtStart,
    };
  });
  const js = data.res.filter((r) => r.name.endsWith(".js"));
  const api = data.res.filter((r) => r.name.startsWith("/api/"));
  const summary = {
    kind, readyMs, ...data.nav, readyAt: data.readyAt, sealedAtStart: data.sealedAtStart,
    jsCount: js.length, jsTransferKB: Math.round(js.reduce((a, r) => a + r.transfer, 0) / 1024),
    jsDecodedKB: Math.round(js.reduce((a, r) => a + r.decoded, 0) / 1024),
    lastJsEnd: Math.max(0, ...js.map((r) => r.end)),
    longTaskTotal: data.longTasks.reduce((a, [, d]) => a + d, 0), longTasks: data.longTasks,
    api: api.map(({ name, start, end, transfer, requestStart, protocol }) => ({ name: name.slice(0, 90), start, end, transfer, requestStart, protocol })),
  };
  runs.push({ ...summary, res: data.res });
  console.log(JSON.stringify({ kind, readyMs, sealedAtStart: summary.sealedAtStart, ttfb: summary.ttfb, dcl: summary.dcl, readyAt: summary.readyAt, jsCount: summary.jsCount,
    jsTransferKB: summary.jsTransferKB, jsDecodedKB: summary.jsDecodedKB, lastJsEnd: summary.lastJsEnd, longTaskTotal: summary.longTaskTotal, apiCount: api.length }));
}

for (let i = 0; i < 3; i++) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: base.startsWith("https:") });
  await context.addInitScript(() => localStorage.setItem("cookie_consent", "declined"));
  await context.addCookies([...cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })),
    { name: "NEXT_LOCALE", value: "en", url: base }]);
  const page = await context.newPage();
  await profile(page, `cold-${i}`);
  await page.waitForTimeout(sealed ? 7000 : 3000);
  const warm = await context.newPage();
  await page.close();
  await profile(warm, `warm-${i}`);
  await context.close();
}
await browser.close();
await session.close();
await writeFile(`output/playwright/performance/${label}.json`, JSON.stringify({ label, route, base, runs }, null, 2));
