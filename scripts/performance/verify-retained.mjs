import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, assertScope, id } from "./seed.mjs";

// Browser correctness checks, not an INP or timing benchmark. Run against an
// already-built local production server, outside concurrent measurements.
loadEnv();
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Use a local production server");
const output = "output/playwright/performance";
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(`${output}/workload.json`, "utf8"));
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

const label = process.env.MINDDY_PERF_LABEL ?? "pass2-retained";
assert.match(label, /^[a-zA-Z0-9_-]+$/, "Invalid output label");
const tempTabs = [
  { id: id("retained-verification-tab-global"), custom_name: "MIN-540 retention: global", href: "/all" },
  { id: id("retained-verification-tab-project"), custom_name: "MIN-540 retention: project", href: `/projects/${fixture.projects[0]}` },
  { id: id("retained-verification-tab-third"), custom_name: "MIN-540 retention: third", href: `/projects/${fixture.projects[1]}` },
];
const [globalTab, projectTab, thirdTab] = tempTabs;
const browser = await chromium.launch({ headless: !process.argv.includes("--headed") });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US", colorScheme: "dark", reducedMotion: "no-preference" });
await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
await context.addInitScript(({ owner, first }) => {
  localStorage.setItem("cookie_consent", "declined");
  sessionStorage.setItem(`minddy.app-tabs.${owner}`, JSON.stringify({ id: first.id, href: first.href }));
  window.__retentionEvents = [];
  document.addEventListener("scroll", (event) => {
    const node = event.target;
    if (node instanceof HTMLElement && node.hasAttribute("data-board-column-scroller")) {
      window.__retentionEvents.push({ kind: "scroll", path: location.pathname, view: node.closest("[data-retained-app-view]")?.getAttribute("data-retained-app-view"), column: node.dataset.boardColumnStatus, top: node.scrollTop });
    }
  }, true);
  document.addEventListener("focusin", (event) => {
    const node = event.target;
    if (node instanceof HTMLElement) window.__retentionEvents.push({ kind: "focus", path: location.pathname, tag: node.tagName, label: node.getAttribute("aria-label"), column: node.closest("[data-board-column-scroller]")?.getAttribute("data-board-column-status") });
  }, true);
}, { owner: fixture.userId, first: globalTab });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const results = { kind: "production-browser-correctness", label, timestamp: new Date().toISOString(), checks: [], pageErrors, cleanup: [], limitations: [
  "The issue modal blocks the tab strip and no global tab-switch shortcut is provided. Browser checks close it before switching; Activity portal suspension and Plan retention are covered by component tests.",
], status: "running" };
const activeSelector = '[data-retained-app-view][data-app-view-active="true"]';
const active = () => page.locator(activeSelector);
const visibleDialogs = () => page.locator('[role="dialog"][data-state="open"]:visible');
const card = (issueId = fixture.firstIssue) => active().locator(`[data-issue-id="${issueId}"]`);
const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const selectFields = (tab) => ({ id: tab.id, user_id: tab.user_id, href: tab.href, custom_name: tab.custom_name, pinned: tab.pinned, position: tab.position });
let preservedTabs = [];
let originalIssue;
let issueMayHaveMoved = false;
let globalCount;
let filteredCount;
let savedScroll;

async function api(path, method = "GET", data) {
  const response = await context.request.fetch(`${base}${path}`, { method, ...(data === undefined ? {} : { data }) });
  const body = await response.json();
  if (!response.ok()) throw new Error(`${method} ${path} failed (${response.status()}): ${body.code ?? body.error ?? "request failed"}`);
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
    const response = await context.request.delete(`${base}/api/me/app-tabs/${spec.id}`, { data: { revision: tab.revision } });
    if (response.ok()) return;
    if (response.status() !== 409) throw new Error(`Temporary tab cleanup failed (${response.status()})`);
  }
  throw new Error("Temporary tab kept changing during cleanup");
}
async function retainedInvariant() {
  const state = await page.locator("[data-retained-app-view]").evaluateAll((nodes) => nodes.map((node) => ({
    key: node.dataset.retainedAppView, active: node.dataset.appViewActive === "true", inert: node.inert,
    visible: node.checkVisibility(), hidden: node.getAttribute("aria-hidden"),
  })));
  assert.ok(state.length >= 1 && state.length <= 2, `Retained view count ${state.length} exceeds the LRU bound`);
  assert.equal(state.filter((view) => view.active).length, 1, "Exactly one board must be active");
  for (const view of state) {
    assert.equal(view.visible, view.active, "Retained board visibility differs from activation");
    assert.equal(view.inert, !view.active, "Hidden boards must be inert");
    if (!view.active) assert.equal(view.hidden, "true", "Hidden board remains in the accessibility tree");
  }
  return state;
}
async function activate(spec, { expectedCount, title } = {}) {
  const tab = page.locator(`[data-app-tab-id="${spec.id}"]`);
  await tab.click();
  await page.waitForFunction(({ tabId, pathname, count, selector }) => {
    const tab = document.querySelector(`[data-app-tab-id="${tabId}"]`);
    const roots = document.querySelectorAll(selector);
    return location.pathname === pathname && tab?.getAttribute("aria-selected") === "true" && roots.length === 1 &&
      roots[0].checkVisibility() && roots[0].querySelectorAll("[data-issue-id]").length === count;
  }, { tabId: spec.id, pathname: new URL(spec.href, base).pathname, count: expectedCount ?? (spec === globalTab ? filteredCount ?? globalCount ?? 600 : 100), selector: activeSelector });
  if (title) await page.waitForFunction((part) => document.title.includes(part), title);
  await frames();
  await page.evaluate((name) => window.__retentionEvents.push({ kind: "activated", name, columns: [...document.querySelectorAll('[data-app-view-active="true"] [data-board-column-scroller]')].map((node) => ({ status: node.dataset.boardColumnStatus, top: node.scrollTop })) }), spec.custom_name);
  return retainedInvariant();
}
async function pointer(locator, modifiers = []) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box, "Missing pointer target");
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  try { await page.mouse.click(box.x + box.width / 2, box.y + Math.min(25, box.height / 2)); }
  finally { for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier); }
}
async function closeVisibleDialog() {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"][data-state="open"]')].some((node) => node.checkVisibility()));
  await frames();
}
async function check(name, action) {
  const started = Date.now();
  try {
    const detail = await action();
    assert.equal(pageErrors.length, 0, `Browser errors: ${pageErrors.join("; ")}`);
    results.checks.push({ name, status: "passed", durationMs: Date.now() - started, detail });
    console.log(JSON.stringify({ name, status: "passed" }));
  } catch (error) {
    results.checks.push({ name, status: "failed", durationMs: Date.now() - started, error: error.message });
    await page.screenshot({ path: `${output}/${label}-failure.png` }).catch(() => {});
    results.events = await page.evaluate(() => window.__retentionEvents).catch(() => []);
    throw error;
  }
}
async function dragTo(status) {
  const source = card();
  await source.scrollIntoViewIfNeeded();
  const destination = active().locator(`[data-board-column-scroller][data-board-column-status="${status}"]`);
  await destination.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await destination.boundingBox();
  assert.ok(from && to, "Missing active-board drag geometry");
  const confirmed = page.waitForResponse((response) => response.url() === `${base}/api/issues/${fixture.firstIssue}` && response.request().method() === "PATCH" && response.ok());
  await page.mouse.move(from.x + from.width / 2, from.y + 30);
  await page.mouse.down();
  try {
    await page.mouse.move(from.x + from.width / 2 + 14, from.y + 30, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + Math.min(70, to.height / 2), { steps: 12 });
  } finally { await page.mouse.up(); }
  await confirmed;
  await active().locator(`[data-issue-id="${fixture.firstIssue}"][data-column-status="${status}"]`).waitFor({ state: "visible" });
  assert.equal((await api(`/api/issues/${fixture.firstIssue}`)).status, status, "Drop was not persisted");
  await frames();
}

try {
  for (const projectId of fixture.projects.slice(0, 2)) {
    assertScope("projects", await api(`/api/projects/${projectId}`), fixture.userId);
  }
  const initialTabs = await listTabs();
  preservedTabs = initialTabs.filter((tab) => !tempTabs.some((spec) => spec.id === tab.id)).map(selectFields);
  for (const name of ["Performance board", "Performance pages"]) assert.ok(preservedTabs.some((tab) => tab.custom_name === name), `Missing protected benchmark tab: ${name}`);
  for (const spec of tempTabs) {
    await removeTemporaryTab(spec);
    await api("/api/me/app-tabs", "POST", { id: spec.id });
    const created = (await listTabs()).find((tab) => tab.id === spec.id);
    assert.ok(created);
    await api(`/api/me/app-tabs/${spec.id}`, "PATCH", { revision: created.revision, patch: { href: spec.href, custom_name: spec.custom_name } });
  }
  originalIssue = await api(`/api/issues/${fixture.firstIssue}`);
  assertScope("issues", originalIssue, fixture.userId);
  assert.equal(originalIssue.project_id, fixture.projects[0]);
  assert.match(originalIssue.title, /^Performance task 1\.1:/);
  assert.ok(["backlog", "todo"].includes(originalIssue.status), "Use a waiting fixture issue to avoid workflow side effects");

  await check("global-board-initial-state", async () => {
    await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-app-tab-id="${globalTab.id}"][aria-selected="true"]`).waitFor();
    await card().waitFor({ state: "visible" });
    await page.waitForFunction(() => document.title.includes("All issues"));
    globalCount = await active().locator("[data-issue-id]").count();
    assert.equal(globalCount, 600);
    await active().evaluate((node) => { window.__retentionGlobal = node; });
    await card().evaluate((node) => { window.__retentionCard = node; });
    await active().locator(`[data-board-column-scroller][data-board-column-status="${originalIssue.status}"]`).evaluate((node) => { window.__retentionColumn = node; });
    return { title: await page.title(), cards: globalCount, views: await retainedInvariant() };
  });
  await check("global-filter-selection-and-scroll", async () => {
    await active().getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("button", { name: "Hide done issues", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.waitForFunction((selector) => document.querySelector(selector)?.querySelectorAll("[data-issue-id]").length === 480, activeSelector);
    filteredCount = await active().locator("[data-issue-id]").count();
    await pointer(card(), ["Shift"]);
    await active().getByRole("button", { name: "Clear selection", exact: true }).waitFor({ state: "visible" });
    assert.equal(await card().locator('[class~="bg-primary/10"]').count(), 1);
    savedScroll = await active().locator(`[data-board-column-scroller][data-board-column-status="${originalIssue.status}"]`).evaluate((column) => { column.scrollTop = 180; return column.scrollTop; });
    assert.ok(savedScroll > 0, "Fixture column must scroll");
    return { cards: filteredCount, scrollTop: savedScroll };
  });
  await check("project-board-duplicate-ids-and-hotkeys", async () => {
    await activate(projectTab, { title: "Performance 1" });
    await activate(globalTab, { title: "All issues" });
    results.scrollRestoration = await active().locator(`[data-board-column-scroller][data-board-column-status="${originalIssue.status}"]`).evaluate((node) => ({ sameColumn: node === window.__retentionColumn, originalConnected: window.__retentionColumn.isConnected, top: node.scrollTop }));
    assert.equal(results.scrollRestoration.top, savedScroll, "Direct roundtrip lost column scroll before any dialogs");
    await activate(projectTab, { title: "Performance 1" });
    assert.equal(await page.locator(`[data-issue-id="${fixture.firstIssue}"]`).count(), 2, "Both retained boards should contain the fixture issue");
    assert.equal(await active().getByRole("button", { name: "Clear selection", exact: true }).count(), 0, "Hidden global selection leaked into project board");
    await page.keyboard.press("c");
    await visibleDialogs().waitFor({ state: "visible" });
    assert.equal(await visibleDialogs().count(), 1);
    await closeVisibleDialog();
    await card().hover();
    await page.keyboard.press("p");
    await page.locator('[role="menu"]:visible, [cmdk-root]:visible').first().waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    return { title: await page.title(), retainedIssueCopies: 2 };
  });
  await check("issue-panel-dismissal-and-cached-board-state", async () => {
    await pointer(card());
    const dialog = visibleDialogs();
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("tab", { name: /^Plan/ }).click();
    await page.waitForFunction(() => document.title.includes("PF1-1"));
    assert.equal(await dialog.getByRole("tab", { name: /^Plan/ }).getAttribute("aria-selected"), "true");
    // The modal deliberately owns input, including the tab strip. Exercise the
    // supported dismissal path instead of forcing a click through its overlay.
    await closeVisibleDialog();
    await activate(globalTab, { title: "All issues" });
    assert.equal(await visibleDialogs().count(), 0, "Dismissed issue dialog remained visible");
    await page.keyboard.press("c");
    await visibleDialogs().waitFor({ state: "visible" });
    await closeVisibleDialog();
    await activate(projectTab, { title: "Performance 1" });
    assert.equal(await visibleDialogs().count(), 0, "A dismissed issue panel reopened during Activity replay");
    await activate(globalTab, { title: "All issues" });
    assert.equal(await active().evaluate((node) => node === window.__retentionGlobal), true, "Global board remounted during a cached return");
    assert.equal(await card().evaluate((node) => node === window.__retentionCard), true, "Issue card remounted during a cached return");
    assert.equal(await active().locator("[data-issue-id]").count(), filteredCount, "Working filter was lost");
    assert.equal(await card().locator('[class~="bg-primary/10"]').count(), 1, "Selection was lost");
    const scroll = await active().locator(`[data-board-column-scroller][data-board-column-status="${originalIssue.status}"]`).evaluate((node) => node.scrollTop);
    assert.ok(Math.abs(scroll - savedScroll) <= 1, `Scroll changed from ${savedScroll} to ${scroll}`);
    await page.screenshot({ path: `${output}/${label}-restored-global.png` });
    return { scrollTop: scroll, cards: filteredCount, selected: true, identity: true };
  });
  await check("active-project-drag-with-hidden-duplicate-and-reversal", async () => {
    await activate(projectTab, { title: "Performance 1" });
    await active().getByRole("button", { name: "Sort", exact: true }).click();
    await page.getByRole("menuitem", { name: "Manual", exact: true }).click();
    issueMayHaveMoved = true;
    await dragTo(originalIssue.status === "backlog" ? "todo" : "backlog");
    await dragTo(originalIssue.status);
    await api(`/api/issues/${fixture.firstIssue}`, "PATCH", { status: originalIssue.status, position: originalIssue.position, assignee_id: originalIssue.assignee_id, cycle_id: originalIssue.cycle_id });
    const restored = await api(`/api/issues/${fixture.firstIssue}`);
    assert.equal(restored.status, originalIssue.status);
    assert.equal(restored.position, originalIssue.position);
    issueMayHaveMoved = false;
    await page.screenshot({ path: `${output}/${label}-project-drag-restored.png` });
    return { status: restored.status, positionRestored: true };
  });
  await check("rapid-roundtrips-and-memory-bound", async () => {
    for (let round = 0; round < 6; round++) {
      await activate(globalTab, { title: "All issues" });
      await activate(projectTab, { title: "Performance 1" });
    }
    assert.equal(await page.evaluate(() => window.__retentionGlobal.isConnected), true);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
    await cdp.detach();
    return { roundtrips: 6, retainedViews: await retainedInvariant(), heapBytes: metrics.JSHeapUsedSize, connectedNodes: await page.locator("*").count() };
  });
  await check("lru-eviction-and-close-eviction", async () => {
    await activate(thirdTab, { title: "Performance 2" });
    assert.equal(await page.evaluate(() => window.__retentionGlobal.isConnected), false, "The least recently used board was not evicted");
    await active().evaluate((node) => { window.__retentionThird = node; });
    await activate(globalTab, { title: "All issues" });
    assert.equal(await active().evaluate((node) => node === window.__retentionGlobal), false, "Evicted board unexpectedly kept its DOM");
    assert.equal(await active().locator("[data-issue-id]").count(), filteredCount, "Eviction lost the tab's working filter");
    await page.getByRole("button", { name: `Close ${thirdTab.custom_name}`, exact: true }).click();
    await page.locator(`[data-app-tab-id="${thirdTab.id}"]`).waitFor({ state: "detached" });
    await page.waitForFunction(() => !window.__retentionThird.isConnected);
    assert.equal(await page.locator("[data-retained-app-view]").count(), 1, "Closing a hidden tab retained its board");
    return { retainedViews: await retainedInvariant(), closedTabRemoved: true };
  });
  results.status = "passed";
} catch (error) {
  results.status = "failed";
  results.error = error.message;
  throw error;
} finally {
  // Stop the live session before deleting its temporary rows, so remote-close
  // recovery cannot recreate a tab while the cleanup is in progress.
  await page.close().catch(() => {});
  try {
    if (issueMayHaveMoved && originalIssue) {
      await api(`/api/issues/${fixture.firstIssue}`, "PATCH", { status: originalIssue.status, position: originalIssue.position, assignee_id: originalIssue.assignee_id, cycle_id: originalIssue.cycle_id });
      results.cleanup.push("Restored fixture issue fields");
    }
    for (const spec of tempTabs) await removeTemporaryTab(spec);
    const remaining = await listTabs();
    assert.ok(tempTabs.every((spec) => !remaining.some((tab) => tab.id === spec.id)), "Temporary tabs survived cleanup");
    for (const before of preservedTabs) {
      const current = remaining.find((tab) => tab.id === before.id);
      assert.ok(current, "An existing account tab disappeared");
      assert.deepEqual(selectFields(current), before, "An existing account tab changed");
    }
    results.cleanup.push("Removed only deterministic temporary tabs; preserved all existing tabs");
  } catch (error) {
    results.status = "failed";
    results.cleanup.push({ error: error.message });
    process.exitCode = 1;
  }
  await writeFile(`${output}/${label}.json`, JSON.stringify(results, null, 2));
  await context.close();
  await browser.close();
}
