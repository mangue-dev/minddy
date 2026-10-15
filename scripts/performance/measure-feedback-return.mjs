// Feedback destinations that carry ?post= (Task54): a warm return to the Feedback tab after
// opening a post, then a cold activation of that tab after a restart. Records time to the
// selected post with its list, skeleton frames, and which Feedback list reads were issued
// (normal open-status list versus the full list). Opening a post updates the tab's location,
// which this collector restores at the end; no other data is written.
// Usage: MINDDY_PERF_BASE_URL=https://localhost:3443 node scripts/performance/measure-feedback-return.mjs <label> [contexts]
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { openFixture, stableTabs, assertStableTabs } from "./stable-restored-tabs.mjs";
import { boardReady } from "./board-readiness.mjs";
import { loadForgeWorkload, loadConnectedBoardWorkload } from "./measure-forge-navigation.mjs";
import { secondaryManifestPath } from "./enrich-secondary-workload.mjs";

const label = process.argv[2] ?? "min683-feedback-return";
const contexts = Number(process.argv[3] ?? 2);
const session = await openFixture();
const { base, cookies, api, fixture } = session;
const specs = stableTabs(fixture, await loadForgeWorkload(api));
const original = await assertStableTabs(api, fixture, specs);
const secondary = JSON.parse(await readFile(secondaryManifestPath, "utf8"));
const board = await loadConnectedBoardWorkload(api, fixture, secondary);
const all = specs.find((spec) => spec.kind === "all"), feedback = specs.find((spec) => spec.kind === "feedback");
const post = secondary.entities.feedback.find((entry) => entry.status === "open");
assert.ok(all && feedback && post);
const prefix = `/projects/${feedback.projectId}/feedback?post=`;

function installProbes(boardSource) {
  window.__fbBoardReady = new Function(`return (${boardSource})`)();
}

function ready({ kind, tabId, href, postId, postTitle, prefix, allCards, allIds }) {
  const visible = (node) => !!node?.getClientRects().length && getComputedStyle(node).visibility !== "hidden" &&
    !node.closest('[inert], [aria-hidden="true"]');
  const loading = [...document.querySelectorAll('[data-slot="skeleton"], [role="status"][aria-label="Loading"], [data-board-loading-skeleton]')].some(visible);
  if (window.__fbSampling) window.__fbSkeletonFrames += loading ? 1 : 0;
  const tab = document.querySelector(`[data-app-tab-id="${tabId}"][aria-selected="true"]`);
  if (!visible(tab) || location.pathname !== new URL(href, location.origin).pathname || loading) return false;
  let done;
  if (kind === "all") done = window.__fbBoardReady(allCards, undefined, allIds);
  else if (!postId) done = [...document.querySelectorAll(`[data-navigation-href^="${prefix}"]`)].some(visible);
  else {
    // Settled on a selected post with its detail; which post is recorded separately, because
    // the previous source resets a ?post= return to the first visible post (Task54).
    const selected = [...document.querySelectorAll(`[data-navigation-href^="${prefix}"][aria-current="true"]`)].find(visible);
    const titles = [...document.querySelectorAll("textarea")].filter(visible).map((node) => node.value.trim());
    done = !!selected && titles.some((title) => title && selected.textContent.includes(title));
    if (done) window.__fbSelected = { href: selected.dataset.navigationHref, expected: selected.dataset.navigationHref === `${prefix}${postId}`,
      title: titles.includes(postTitle) };
  }
  if (done) window.__fbReadyAt ??= performance.now();
  return done;
}

async function activate(page, spec, postId) {
  const tab = page.locator(`[data-app-tab-id="${spec.id}"]`);
  const box = await tab.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => { window.__fbSelected = undefined; window.__fbReadyAt = undefined; window.__fbSkeletonFrames = 0; window.__fbSampling = true; window.__fbClickAt = performance.now(); });
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(ready, { kind: spec.kind, tabId: spec.id, href: spec.href, postId, postTitle: post.title, prefix,
    allCards: board.cards, allIds: board.cardIds }, { timeout: 20000, polling: 16 }).catch(async (error) => {
    const state = await page.evaluate((prefix) => ({ path: location.pathname + location.search,
      selected: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId,
      rows: document.querySelectorAll(`[data-navigation-href^="${prefix}"]`).length,
      hrefs: [...document.querySelectorAll("[data-navigation-href]")].slice(0, 3).map((node) => node.dataset.navigationHref),
      loading: [...document.querySelectorAll('[data-slot="skeleton"], [role="status"][aria-label="Loading"], [data-board-loading-skeleton]')]
        .filter((node) => node.getClientRects().length).map((node) => `${node.tagName}.${node.getAttribute("data-slot") ?? node.getAttribute("aria-label")}@${node.closest("[data-app-view-active]")?.getAttribute("data-app-view-active")}`).slice(0, 5),
      tabVisible: !!document.querySelector('[data-app-tab-id][aria-selected="true"]')?.getClientRects().length,
      rowsVisible: [...document.querySelectorAll(`[data-navigation-href^="${prefix}"]`)].filter((node) => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]')).length }), prefix);
    await page.screenshot({ path: `output/playwright/performance/${label}-${spec.kind}-failure.png` });
    throw new Error(`${spec.kind} not ready: ${JSON.stringify(state)} (${error.message.split("\n")[0]})`);
  });
  return page.evaluate(() => { window.__fbSampling = false;
    return { ms: Math.round(window.__fbReadyAt - window.__fbClickAt), skeletonFrames: window.__fbSkeletonFrames,
      keptPost: window.__fbSelected?.expected ?? null }; });
}

async function openContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: base.startsWith("https:") });
  await context.addInitScript(() => localStorage.setItem("cookie_consent", "declined"));
  await context.addInitScript(installProbes, boardReady.toString());
  await context.addCookies([...cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })),
    { name: "NEXT_LOCALE", value: "en", url: base }]);
  const page = await context.newPage();
  const reads = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === `/api/projects/${feedback.projectId}/feedback`)
      reads.push({ at: Date.now(), list: url.searchParams.getAll("statuses").length ? "normal" : "full" });
  });
  await page.goto(`${base}/home`, { waitUntil: "commit" });
  await page.waitForFunction(ready, { kind: "all", tabId: all.id, href: all.href, allCards: board.cards, allIds: board.cardIds }, { timeout: 30000, polling: 16 });
  await page.waitForTimeout(3000);
  return { context, page, reads };
}

const listReads = (reads, from) => reads.filter((entry) => entry.at >= from).map((entry) => entry.list);
const browser = await chromium.launch();
const runs = [];
try {
  for (let index = 0; index < contexts; index++) {
    const run = { index };
    const warm = await openContext(browser);
    run.firstFeedback = await activate(warm.page, feedback);
    await warm.page.locator(`[data-navigation-href="${prefix}${post.id}"]`).first().click();
    await warm.page.waitForFunction(ready, { kind: "feedback", tabId: feedback.id, href: feedback.href, postId: post.id, postTitle: post.title, prefix }, { timeout: 20000, polling: 16 });
    await warm.page.waitForTimeout(1500);
    await activate(warm.page, all);
    await warm.page.waitForTimeout(2000);
    const warmFrom = Date.now();
    run.warmReturn = await activate(warm.page, feedback, post.id);
    await warm.page.waitForTimeout(1500);
    run.warmReturn.listReads = listReads(warm.reads, warmFrom);
    await warm.context.close();
    // Restart: the Feedback tab's saved location now carries ?post=.
    const cold = await openContext(browser);
    const coldFrom = Date.now();
    run.coldPost = await activate(cold.page, feedback, post.id);
    await cold.page.waitForTimeout(1500);
    run.coldPost.listReads = listReads(cold.reads, coldFrom);
    await cold.context.close();
    console.log(JSON.stringify(run));
    runs.push(run);
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
await writeFile(`output/playwright/performance/${label}.json`, JSON.stringify({ label, base, post: post.id, runs }, null, 2));
