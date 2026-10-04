import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { id } from "./seed.mjs";

// Run only against the authenticated, marked fixture validated by the parent.
export async function measureRetainedReturns({ page, context, fixture, boardTab, pagesTab, tabs, base, measure, frames, diagnostic, output, label }) {
  const selector = '[data-retained-app-view][data-app-view-active="true"]';
  const active = () => page.locator(selector);
  const tab = (spec) => page.locator(`[data-app-tab-id="${spec.id}"]`);
  const project = { id: id("min614-pass2-project-tab"), custom_name: "MIN-614 pass 2 project", href: `/projects/${fixture.projects[0]}` };
  assert.ok(!tabs.some((entry) => entry.id === project.id), "Temporary tab already exists; inspect its owner before cleanup");
  const api = async (route, method = "GET", data) => {
    let response;
    try { response = await context.request.fetch(`${base}${route}`, { method, ...(data === undefined ? {} : { data }) }); }
    catch { throw new Error(`${method} ${route}: transport failed`); }
    assert.ok(response.ok(), `${method} ${route}: ${response.status()}`);
    return response.json();
  };
  let original;
  let changed = false;
  let created = false;
  let filtered = false;
  const repetitions = diagnostic ? 1 : 10;
  const journal = { temporaryTab: project, cleanup: false };
  const save = () => writeFile(`${output}/${label}-checks.json`, JSON.stringify(journal, null, 2));
  await save();
  async function ready(spec, count, title) {
    await page.waitForFunction(({ spec, count, title, selector }) => {
      const roots = document.querySelectorAll(selector);
      const root = roots[0];
      return location.pathname === new URL(spec.href, location.origin).pathname &&
        document.querySelector(`[data-app-tab-id="${spec.id}"]`)?.getAttribute("aria-selected") === "true" &&
        roots.length === 1 && root.checkVisibility() && !root.inert &&
        root.querySelectorAll("[data-issue-id]").length === count &&
        (!title || root.textContent.includes(title)) &&
        ![...document.querySelectorAll('[role="dialog"][data-state="open"]')].some((node) => node.checkVisibility());
    }, { spec, count, title, selector }, { timeout: 45000 });
  }
  async function input() {
    await active().locator('button[aria-label="Filters"]').click();
    await page.locator('[role="menu"]').getByRole("menuitem", { name: "Hide done issues", exact: true }).waitFor();
    await frames();
    await page.keyboard.press("Escape");
  }
  const pagesReady = () => pagesTab.href === `/projects/${fixture.projects[0]}/pages`
    ? page.locator(`a[href="${pagesTab.href}/${fixture.firstPage}"]`).first().waitFor()
    : page.locator(".page-editor .tiptap").waitFor();
  async function pages() {
    await tab(pagesTab).click();
    await pagesReady();
    await frames();
  }
  async function returns(name, setup, spec = boardTab, count = 600) {
    for (let run = 0; run < repetitions; run++) {
      await setup();
      await measure(`${name}-${run}`, () => tab(spec).click(), () => ready(spec, count), input);
    }
  }
  async function toggleFilter() {
    await active().locator('button[aria-label="Filters"]').click();
    await page.locator('[role="menu"]').getByRole("menuitem", { name: "Hide done issues", exact: true }).click();
    await page.keyboard.press("Escape");
    filtered = !filtered;
    await ready(boardTab, filtered ? 480 : 600);
  }
  try {
    await tab(boardTab).click();
    await ready(boardTab, 600);
    for (let run = 0; run < repetitions; run++) {
      await measure(`issue-open-${run}`, () => active().locator("[data-issue-id]").first().click(), () => page.locator('[role="dialog"][data-state="open"]').waitFor());
      await measure(`issue-return-${run}`, () => page.keyboard.press("Escape"), () => ready(boardTab, 600), input);
    }
    await returns("page-return", pages);
    created = true; await save();
    await api("/api/me/app-tabs", "POST", { id: project.id });
    const row = (await api("/api/me/app-tabs")).find((entry) => entry.id === project.id);
    await api(`/api/me/app-tabs/${project.id}`, "PATCH", { revision: row.revision, patch: { href: project.href, custom_name: project.custom_name, pinned: true } });
    // Load the new tab list through a normal document load, outside warm timings.
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(boardTab, 600);
    await tab(project).click();
    await ready(project, 100);
    await tab(boardTab).click();
    await ready(boardTab, 600);
    for (let run = 0; run < repetitions; run++) {
      await measure(`board-to-project-${run}`, () => tab(project).click(), () => ready(project, 100), input);
      await measure(`board-return-${run}`, () => tab(boardTab).click(), () => ready(boardTab, 600), input);
    }
    const scrollers = active().locator("[data-board-column-scroller]");
    const offsets = await scrollers.evaluateAll((nodes) => nodes.map((node) => { node.scrollTop = 180; return { status: node.dataset.boardColumnStatus, top: node.scrollTop }; }));
    assert.ok(offsets.some((offset) => offset.top > 0));
    await frames();
    await returns("scrolled-return", pages);
    assert.deepEqual(await scrollers.evaluateAll((nodes) => nodes.map((node) => ({ status: node.dataset.boardColumnStatus, top: node.scrollTop }))), offsets, "Column offsets changed on activation");
    await scrollers.evaluateAll((nodes) => nodes.forEach((node) => { node.scrollTop = 0; }));
    await toggleFilter();
    await returns("filtered-return", pages, boardTab, 480);
    await toggleFilter();
    original = await api(`/api/issues/${fixture.firstIssue}`);
    journal.originalIssue = { id: original.id, title: original.title };
    journal.eventsBefore = (await api(`/api/issues/${original.id}/events`)).length; await save();
    assert.equal(original.project_id, fixture.projects[0]);
    assert.match(original.title, /^Performance task 1\.1:/);
    for (let run = 0; run < repetitions; run++) {
      await pages();
      const title = `${original.title} [MIN-614 hidden ${run}]`;
      changed = true;
      await api(`/api/issues/${fixture.firstIssue}`, "PATCH", { title });
      // Allow the real realtime notification to arrive while Activity is hidden.
      await page.waitForTimeout(700);
      await measure(`hidden-update-return-${run}`, () => tab(boardTab).click(), () => ready(boardTab, 600, title), input);
      await api(`/api/issues/${fixture.firstIssue}`, "PATCH", { title: original.title });
      changed = false;
      await ready(boardTab, 600, original.title);
    }
  } catch (error) { journal.journeyError = error.message.split("\n")[0]; throw error; } finally {
    const restore = async () => {
    try {
    if (changed && original) await api(`/api/issues/${fixture.firstIssue}`, "PATCH", { title: original.title });
    if (filtered && await active().count()) await toggleFilter();
    if (created) {
      // Close the live page first so tab reconciliation cannot recreate the row.
      await page.goto("about:blank");
      const row = (await api("/api/me/app-tabs")).find((entry) => entry.id === project.id);
      if (row) {
        assert.equal(row.custom_name, project.custom_name);
        const response = await context.request.delete(`${base}/api/me/app-tabs/${project.id}`, { data: { revision: row.revision } });
        assert.ok(response.ok(), "Temporary tab cleanup failed");
      }
      await page.goto(`${base}${boardTab.href}`, { waitUntil: "domcontentloaded" });
      await ready(boardTab, 600);
    }
    assert.ok(!(await api("/api/me/app-tabs")).some((entry) => entry.id === project.id));
    if (original) { assert.equal((await api(`/api/issues/${original.id}`)).title, original.title); journal.eventsAfter = (await api(`/api/issues/${original.id}/events`)).length; }
    journal.cleanup = true;
    } catch (error) { journal.cleanupError = error.message.split("\n")[0]; throw error; } finally { await save(); }
    };
    await restore();
  }
}
