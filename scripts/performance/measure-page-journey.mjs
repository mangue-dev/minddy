// Read-only project -> Page -> project journey on the local production server, the path the
// user chose for qualitative review. Per isolated browser context it measures tab activations
// (first Page, retained Page, Page after more than 60 s away), wheel scrolling on the Page and
// typing in it. Page writes are held in the browser and never reach the server, so the fixture's
// Page versions stay unchanged; the context is closed before any held write could be answered.
// Usage: MINDDY_PERF_BASE_URL=https://localhost:3443 node scripts/performance/measure-page-journey.mjs <label> [contexts]
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { openFixture, stableTabs, assertStableTabs } from "./stable-restored-tabs.mjs";
import { boardReady } from "./board-readiness.mjs";
import { loadForgeWorkload, loadConnectedBoardWorkload } from "./measure-forge-navigation.mjs";
import { secondaryManifestPath } from "./enrich-secondary-workload.mjs";

const label = process.argv[2] ?? "min683-page-journey";
const contexts = Number(process.argv[3] ?? 2);
const AWAY_MS = 65_000;
const session = await openFixture();
const { base, cookies, api, fixture } = session;
const forge = await loadForgeWorkload(api);
const specs = stableTabs(fixture, forge);
const original = await assertStableTabs(api, fixture, specs);
const board = await loadConnectedBoardWorkload(api, fixture, JSON.parse(await readFile(secondaryManifestPath, "utf8")));
const all = specs.find((spec) => spec.kind === "all"), project = specs.find((spec) => spec.kind === "board");
const pageSpec = specs.find((spec) => spec.kind === "page" && spec.projectId === project.projectId);
assert.ok(all && project && pageSpec);

function installProbes(boardSource) {
  window.__journeyBoardReady = new Function(`return (${boardSource})`)();
  window.__events = [];
  window.__longTasks = [];
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longTasks.push([e.startTime, e.duration]); })
      .observe({ type: "longtask", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__events.push({ name: e.name, start: e.startTime, duration: e.duration,
        delay: e.processingStart - e.startTime, processing: e.processingEnd - e.processingStart });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {}
}

function destinationReady({ kind, tabId, href, pageId, allCards, allIds }) {
  const visible = (node) => !!node?.getClientRects().length && getComputedStyle(node).visibility !== "hidden" &&
    !node.closest('[inert], [aria-hidden="true"]');
  const tab = document.querySelector(`[data-app-tab-id="${tabId}"][aria-selected="true"]`);
  if (!visible(tab) || location.pathname !== new URL(href, location.origin).pathname) return false;
  if ([...document.querySelectorAll('[data-slot="skeleton"], [role="status"][aria-label="Loading"], [data-board-loading-skeleton]')].some(visible)) return false;
  let ready = false;
  if (kind === "all") ready = window.__journeyBoardReady(allCards, undefined, allIds);
  else if (kind === "board") {
    const root = document.querySelector('[data-app-view-active="true"]');
    const headers = [...root?.querySelectorAll('[data-board-column-scroller]') ?? []].map((node) =>
      [...node.parentElement?.parentElement?.firstElementChild?.children ?? []].find((child) => child.tagName === "SPAN" && /^\d+$/.test(child.textContent.trim())));
    const total = headers.reduce((sum, count) => sum + (count ? Number(count.textContent.trim()) : 0), 0);
    ready = total > 0 && window.__journeyBoardReady(total);
  } else {
    const surface = [...document.querySelectorAll('[data-page-surface-id]')].find((node) => visible(node) && node.dataset.pageSurfaceId === pageId);
    const editor = surface?.querySelector('.page-editor .tiptap[contenteditable="true"]');
    ready = visible(editor) && editor.querySelectorAll(':scope > h2').length === 8 && editor.querySelectorAll(':scope > p').length === 72;
  }
  if (ready) window.__readyAt ??= performance.now();
  return ready;
}

async function activate(page, spec) {
  const tab = page.locator(`[data-app-tab-id="${spec.id}"]`);
  const box = await tab.boundingBox();
  assert.ok(box, `missing tab ${spec.kind}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => { window.__readyAt = undefined; window.__clickAt = performance.now(); });
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(destinationReady, { kind: spec.kind, tabId: spec.id, href: spec.href, pageId: spec.pageId,
    allCards: board.cards, allIds: board.cardIds }, { timeout: 20000, polling: 16 }).catch(async (error) => {
    const state = await page.evaluate((pageId) => {
      const surface = document.querySelector(`[data-page-surface-id="${pageId}"]`);
      const editor = surface?.querySelector('.page-editor .tiptap');
      return { path: location.pathname, selected: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId,
        surfaces: [...document.querySelectorAll('[data-page-surface-id]')].map((node) => node.dataset.pageSurfaceId),
        h2: editor?.querySelectorAll(':scope > h2').length, p: editor?.querySelectorAll(':scope > p').length, editable: editor?.getAttribute("contenteditable") };
    }, spec.pageId ?? "");
    await page.screenshot({ path: `output/playwright/performance/${label}-${spec.kind}-failure.png` });
    throw new Error(`${spec.kind} not ready: ${JSON.stringify(state)} (${error.message.split("\n")[0]})`);
  });
  return page.evaluate(() => Math.round(window.__readyAt - window.__clickAt));
}

async function scrollPage(page) {
  const editor = page.locator(`[data-page-surface-id="${pageSpec.pageId}"] .page-editor .tiptap`);
  const box = await editor.boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.min(box.y + 200, 700));
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => { window.__frames.push(now - last); last = now; if (window.__frames.length < 400) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  for (let step = 0; step < 40; step++) { await page.mouse.wheel(0, step < 20 ? 240 : -240); await page.waitForTimeout(16); }
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const frames = window.__frames.slice(1).sort((a, b) => a - b);
    return { frames: frames.length, p95: Math.round(frames[Math.floor(frames.length * 0.95)] ?? 0),
      max: Math.round(frames.at(-1) ?? 0), over34: frames.filter((value) => value > 34).length };
  });
}

async function typeInPage(page, held) {
  const editor = page.locator(`[data-page-surface-id="${pageSpec.pageId}"] .page-editor .tiptap`);
  await editor.locator(":scope > p").nth(3).click();
  await page.keyboard.press("End");
  const startedAt = await page.evaluate(() => { window.__typingFrom = performance.now(); return window.__typingFrom; });
  const text = " The quick brown fox jumps over the lazy dog while the journey measures typing.";
  await page.keyboard.type(text, { delay: 35 });
  await page.waitForTimeout(1500);
  const result = await page.evaluate((from) => {
    const keys = window.__events.filter((e) => e.start >= from && ["keydown", "keypress", "keyup", "beforeinput", "input"].includes(e.name));
    const durations = keys.filter((e) => e.name === "keydown").map((e) => e.duration).sort((a, b) => a - b);
    const tasks = window.__longTasks.filter(([start]) => start >= from);
    return { keydownsOver16: durations.length, keydownP95: Math.round(durations[Math.floor(durations.length * 0.95)] ?? 0),
      keydownMax: Math.round(durations.at(-1) ?? 0), longTasks: tasks.length, longTaskMs: Math.round(tasks.reduce((sum, [, d]) => sum + d, 0)) };
  }, startedAt);
  return { ...result, characters: text.length, heldPageWrites: held.length };
}

const browser = await chromium.launch();
const runs = [];
try {
  for (let index = 0; index < contexts; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: base.startsWith("https:") });
    await context.addInitScript(() => localStorage.setItem("cookie_consent", "declined"));
    await context.addInitScript(installProbes, boardReady.toString());
    await context.addCookies([...cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })),
      { name: "NEXT_LOCALE", value: "en", url: base }]);
    const held = [], requests = [];
    // Hold every Page write in the browser: nothing reaches the server and nothing is answered.
    await context.route(/\/api\/projects\/[^/]+\/pages(\/|\?|$)/, (route) => {
      if (route.request().method() === "GET") return route.continue();
      held.push({ method: route.request().method(), path: new URL(route.request().url()).pathname.replace(/[0-9a-f-]{36}/g, "{id}") });
    });
    const page = await context.newPage();
    page.on("request", (request) => { const url = new URL(request.url()); if (url.pathname.startsWith("/api/")) requests.push({ at: Date.now(), method: request.method(), path: url.pathname.replace(/[0-9a-f-]{36}/g, "{id}") }); });
    await page.goto(`${base}/home`, { waitUntil: "commit" });
    await page.waitForFunction(destinationReady, { kind: "all", tabId: all.id, href: all.href, allCards: board.cards, allIds: board.cardIds }, { timeout: 30000, polling: 16 });
    await page.waitForTimeout(3000);
    const run = { index };
    run.projectFirstMs = await activate(page, project);
    run.pageFirstMs = await activate(page, pageSpec);
    run.projectReturnMs = await activate(page, project);
    run.pageRetainedMs = await activate(page, pageSpec);
    await activate(page, project);
    await page.waitForTimeout(AWAY_MS);
    run.pageAfterAwayMs = await activate(page, pageSpec);
    run.scroll = await scrollPage(page);
    const typingFrom = Date.now();
    run.typing = await typeInPage(page, held);
    run.requestsDuringTyping = requests.filter((entry) => entry.at >= typingFrom).map(({ method, path }) => `${method} ${path}`);
    // Departure waits for the held save (save-before-departure), so the journey ends on the Page.
    console.log(JSON.stringify(run));
    runs.push(run);
    await context.close();
  }
} finally {
  await browser.close();
  for (const tab of original) {
    const current = (await api("/api/me/app-tabs")).find((value) => value.id === tab.id);
    if (current && current.href !== tab.href) await api(`/api/me/app-tabs/${tab.id}`, "PATCH", { revision: current.revision, patch: { href: tab.href } });
  }
  await assertStableTabs(api, fixture, specs);
  await session.close();
}
await writeFile(`output/playwright/performance/${label}.json`, JSON.stringify({ label, base, awayMs: AWAY_MS, runs }, null, 2));
