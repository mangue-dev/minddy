// Read-only tab switching on the local production server: one isolated browser context per run
// opens the app, lets startup preparation settle, visits every restored tab once (first
// activation in sequence), then cycles through all tabs several times (hot switches). Each
// switch records click-to-complete-content time, the click's Event Timing duration, long tasks
// and the API requests it triggered. Tab locations are restored at the end; nothing else is written.
// Usage: MINDDY_PERF_BASE_URL=https://localhost:3443 node scripts/performance/measure-tab-switching.mjs <label> [rounds] [contexts] [--electron]
// --electron runs the unpackaged desktop shell (NODE_PATH=./desktop/node_modules) with an isolated profile per context.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, _electron } from "playwright";
import { openFixture, stableTabs, assertStableTabs } from "./stable-restored-tabs.mjs";
import { boardReady } from "./board-readiness.mjs";
import { loadForgeWorkload, loadConnectedBoardWorkload } from "./measure-forge-navigation.mjs";
import { secondaryManifestPath } from "./enrich-secondary-workload.mjs";

const label = process.argv[2] ?? "min683-tab-switching";
const rounds = Number(process.argv[3] ?? 3);
const contexts = Number(process.argv[4] ?? 2);
const native = process.argv.includes("--electron");
const session = await openFixture();
const { base, cookies, api, fixture } = session;
const specs = stableTabs(fixture, await loadForgeWorkload(api));
const original = await assertStableTabs(api, fixture, specs);
const board = await loadConnectedBoardWorkload(api, fixture, JSON.parse(await readFile(secondaryManifestPath, "utf8")));
const all = specs.find((spec) => spec.kind === "all");
assert.ok(all);

function installProbes(boardSource) {
  window.__switchBoardReady = new Function(`return (${boardSource})`)();
  window.__events = [];
  window.__longTasks = [];
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longTasks.push([e.startTime, e.duration]); })
      .observe({ type: "longtask", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === "click" || e.name === "pointerdown" || e.name === "pointerup")
        window.__events.push({ name: e.name, start: e.startTime, duration: e.duration });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {}
}

// Complete visible content of the active destination, by kind; skeletons and loading
// indicators inside the active view always fail it.
function switchReady({ kind, tabId, href, pageId, allCards, allIds }) {
  const visible = (node) => !!node?.getClientRects().length && getComputedStyle(node).visibility !== "hidden" &&
    !node.closest('[inert], [aria-hidden="true"]');
  const tab = document.querySelector(`[data-app-tab-id="${tabId}"][aria-selected="true"]`);
  if (!visible(tab) || location.pathname !== new URL(href, location.origin).pathname) return false;
  const loading = '[data-slot="skeleton"], [role="status"][aria-label="Loading"], [data-board-loading-skeleton], [data-testid="pr-detail-loading-content"], [data-testid="pr-activity-skeleton"]';
  if ([...document.querySelectorAll(loading)].some(visible)) return false;
  const root = document.querySelector('[data-app-view-active="true"]') ?? document.querySelector("main");
  let done = false;
  if (kind === "all") done = window.__switchBoardReady(allCards, undefined, allIds);
  else if (kind === "board") {
    const counts = [...root?.querySelectorAll("[data-board-column-scroller]") ?? []].map((node) =>
      [...node.parentElement?.parentElement?.firstElementChild?.children ?? []].find((child) => child.tagName === "SPAN" && /^\d+$/.test(child.textContent.trim())));
    const total = counts.reduce((sum, count) => sum + (count ? Number(count.textContent.trim()) : 0), 0);
    done = total > 0 && window.__switchBoardReady(total);
  } else if (kind === "page") {
    const surface = [...document.querySelectorAll("[data-page-surface-id]")].find((node) => visible(node) && node.dataset.pageSurfaceId === pageId);
    const editor = surface?.querySelector('.page-editor .tiptap[contenteditable="true"]');
    done = visible(editor) && editor.querySelectorAll(":scope > h2").length === 8 && editor.querySelectorAll(":scope > p").length === 72;
  } else if (kind === "home") {
    done = [...document.querySelectorAll('[contenteditable="true"][aria-placeholder*="Numo"]')].some(visible);
  } else if (kind === "pr") {
    done = [...document.querySelectorAll('[data-testid="pr-description"], [data-testid="pr-activity-timeline"]')].some(visible);
  } else {
    const section = new URL(href, location.origin).pathname;
    done = [...document.querySelectorAll("[data-navigation-href]")].some((node) => visible(node) && node.dataset.navigationHref.startsWith(section));
  }
  if (done) window.__switchReadyAt ??= performance.now();
  return done;
}

async function activate(page, spec, requests) {
  const tab = page.locator(`[data-app-tab-id="${spec.id}"]`);
  const box = await tab.boundingBox();
  assert.ok(box, `missing tab ${spec.kind}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const from = Date.now();
  const clickAt = await page.evaluate(() => { window.__switchReadyAt = undefined; window.__switchClickAt = performance.now(); return window.__switchClickAt; });
  await page.mouse.down(); await page.mouse.up();
  const outcome = await page.waitForFunction(switchReady, { kind: spec.kind, tabId: spec.id, href: spec.href, pageId: spec.pageId,
    allCards: board.cards, allIds: board.cardIds }, { timeout: 20000, polling: 16 }).then(() => "complete", () => "timeout");
  await page.waitForTimeout(600);
  const sample = await page.evaluate((clickAt) => ({
    readyMs: window.__switchReadyAt === undefined ? null : Math.round(window.__switchReadyAt - clickAt),
    clickEventMs: Math.round(Math.max(0, ...window.__events.filter((e) => e.start >= clickAt - 5).map((e) => e.duration))),
    longTaskMs: Math.round(window.__longTasks.filter(([start]) => start >= clickAt).reduce((sum, [, d]) => sum + d, 0)),
  }), clickAt);
  return { kind: spec.kind, key: spec.custom_name, outcome, ...sample,
    requests: requests.filter((entry) => entry.at >= from).map((entry) => entry.path) };
}

const browser = native ? null : await chromium.launch();
const runs = [];
let app, profile;
async function openContext() {
  if (!native) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: base.startsWith("https:") });
    return { context, close: () => context.close() };
  }
  profile = await mkdtemp(path.join(tmpdir(), "minddy-min683-tabs-"));
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  // Open windows without taking focus (unpackaged test bench only, see lib/desktop/test-background.ts).
  Object.assign(env, { MINDDY_DESKTOP_ORIGIN: base, MINDDY_DESKTOP_TEST_USER_DATA: profile, MINDDY_DESKTOP_TEST_BACKGROUND: "1" });
  const tlsArgs = base.startsWith("https:") ? ["--ignore-certificate-errors"] : [];
  app = await _electron.launch({ args: [...tlsArgs, `--user-data-dir=${profile}`, path.resolve("desktop")], cwd: path.resolve("desktop"), env, timeout: 30000 });
  // The window is created only once a session exists: add cookies before waiting for it.
  return { context: app.context(), page: null, firstWindow: () => app.firstWindow(), close: async () => { await app.close(); app = undefined; await rm(profile, { recursive: true, force: true }); } };
}
try {
  for (let index = 0; index < contexts; index++) {
    const opened = await openContext();
    const { context } = opened;
    await context.addInitScript(() => localStorage.setItem("cookie_consent", "declined"));
    await context.addInitScript(installProbes, boardReady.toString());
    await context.addCookies([...cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })),
      { name: "NEXT_LOCALE", value: "en", url: base }]);
    const page = opened.firstWindow ? await opened.firstWindow() : await context.newPage();
    const requests = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/") || url.searchParams.has("_rsc"))
        requests.push({ at: Date.now(), path: `${request.method()} ${url.pathname.replace(/[0-9a-f-]{36}/g, "{id}")}${url.searchParams.has("_rsc") ? " (rsc)" : ""}` });
    });
    await page.goto(`${base}/home`, { waitUntil: "commit" });
    await page.waitForFunction(switchReady, { kind: "all", tabId: all.id, href: all.href, allCards: board.cards, allIds: board.cardIds }, { timeout: 30000, polling: 16 });
    await page.waitForTimeout(5000);
    const order = [...specs.slice(1), all];
    const firstVisits = [];
    for (const spec of order) firstVisits.push(await activate(page, spec, requests));
    const hot = [];
    for (let round = 0; round < rounds; round++) for (const spec of order) hot.push({ round, ...(await activate(page, spec, requests)) });
    const run = { index, firstVisits, hot };
    console.log(JSON.stringify({ index, first: firstVisits.map((s) => `${s.kind}:${s.readyMs}`).join(" "),
      hotP50: hot.map((s) => s.readyMs).filter((v) => v !== null).sort((a, b) => a - b)[Math.floor(hot.length / 2)] }));
    runs.push(run);
    await opened.close();
  }
} finally {
  if (app) await app.close().catch(() => {});
  if (profile) await rm(profile, { recursive: true, force: true });
  await browser?.close();
  for (const tab of original) {
    const current = (await api("/api/me/app-tabs")).find((value) => value.id === tab.id);
    if (current && current.href !== tab.href) await api(`/api/me/app-tabs/${tab.id}`, "PATCH", { revision: current.revision, patch: { href: tab.href } });
  }
  await assertStableTabs(api, fixture, specs);
  await session.close();
}
await writeFile(`output/playwright/performance/${label}.json`, JSON.stringify({ label, base, rounds, client: native ? "native" : "web", runs }, null, 2));
