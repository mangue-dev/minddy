import assert from "node:assert/strict";
import { id } from "./seed.mjs";

/** Genuine sidebar/tree clicks, with destination identity and complete content. */
export async function measureDeepNavigation({ page, fixture, activeTab, pageTab, repeats, clickMeasured, results, windowingCompatible = false, connectedBoard, allowedTabIds, pageTrees }) {
  results.protocol = windowingCompatible ? "min683-deep-v5-canonical-editable-pages" : "min683-deep-v2-alternating-documents";
  const projects = fixture.projects.slice(0, 2);
  const sameTab = (tab) => !!document.querySelector(`[data-app-tab-id="${tab}"][aria-selected="true"]`);
  const projectReady = ({ project, tab }) => {
    const root = document.querySelector('[data-app-view-active="true"]');
    const cards = root?.querySelectorAll("[data-issue-id]");
    if (window.__instant.windowingCompatible) return location.pathname === `/projects/${project}` &&
      !!document.querySelector(`[data-app-tab-id="${tab}"][aria-selected="true"]`) &&
      window.__instant.boardReady(window.__instant.projectCounts[project].cards, undefined, window.__instant.projectCounts[project].cardIds);
    return location.pathname === `/projects/${project}` &&
      !!document.querySelector(`[data-app-tab-id="${tab}"][aria-selected="true"]`) &&
      !!root?.getClientRects().length && !root.inert && cards.length === window.__instant.projectCounts[project].cards &&
      [...cards].every((node) => node.textContent.trim() && (!window.__instant.projectCounts[project].cardIds || window.__instant.projectCounts[project].cardIds.includes(node.dataset.issueId)));
  };
  await page.evaluate(({ projects, counts }) => { window.__instant.projects = projects; window.__instant.projectCounts = counts; },
    { projects, counts: connectedBoard?.perProject ?? Object.fromEntries(projects.map((id) => [id, { cards: 100 }])) });
  const menuReady = () => [...document.querySelectorAll('[role="menu"]')].some((node) => node.getClientRects().length);
  async function switchProject(index, name, pages = false) {
    const current = projects.indexOf(new URL(page.url()).pathname.split("/")[2]);
    assert.ok(current >= 0);
    if (pages) {
      await clickMeasured(`${name}-back`, page.locator('[data-sidebar-back]:visible').last(),
        ({ current }) => [...document.querySelectorAll(`[data-sidebar-project-context] button[aria-label="Performance ${current + 1}"]`)]
          .some((node) => node.getClientRects().length), { current });
    }
    const trigger = page.locator(`[data-sidebar-project-context] button[aria-label="Performance ${current + 1}"]:visible`);
    await clickMeasured(`${name}-menu`, trigger, menuReady, null);
    const href = `/projects/${projects[index]}${pages ? "/pages" : ""}`;
    const item = page.locator(`[role="menu"] a[href="${href}"]:visible`);
    assert.equal(await item.count(), 1);
    const treeReady = ({ href, tabIds, pageIds }) => {
      if (!window.__instant.pageTreeReady({ href, tabIds, pageIds })) return false;
      if (location.pathname === href) return true;
      const spec = window.__instant.pageSpecifications[location.pathname];
      const selected = document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId;
      return !!spec && window.__instant.pageReady({ ...spec, tab: selected });
    };
    await clickMeasured(name, item, pages ? treeReady : projectReady,
      pages ? { href, tabIds: allowedTabIds ?? [activeTab, pageTab.id], pageIds: pageTrees[href] } : { project: projects[index], tab: activeTab });
    if (pages) {
      const selected = await page.locator('[data-app-tab-id][aria-selected="true"]').getAttribute("data-app-tab-id");
      assert.ok((allowedTabIds ?? [activeTab, pageTab.id]).includes(selected));
      (results.sectionTabTransitions ??= []).push({ name, fromTab: activeTab, selectedTab: selected, href });
      activeTab = selected;
    }
    return results.measurements.at(-1);
  }
  // No extra destination tab exists for project 2 or its documents. The
  // ordinary idle opportunity in the parent runner remains identical.
  await switchProject(1, "first-project-switch");
  await switchProject(0, "first-project-return");
  for (let index = 0; index < repeats; index++) {
    await switchProject(1, "project-switch");
    await switchProject(0, "project-return");
    await page.waitForTimeout(350);
  }
  await page.evaluate((ids) => { window.__instant.deepAllowedTabs = ids; }, allowedTabIds ?? [activeTab, pageTab.id]);
  results.pageTabTransitions = [];
  const pageReady = ({ href, tab }) => {
    const selected = document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId;
    if (tab && selected !== tab || !window.__instant.deepAllowedTabs.includes(selected)) return false;
    return window.__instant.pageReady({ ...window.__instant.pageSpecifications[href], tab: selected });
  };
  async function openPage(project, document, name) {
    const href = `/projects/${projects[project]}/pages/${id(`page-${project}-${document}`)}`;
    await clickMeasured(name, page.locator(`[data-sidebar-page-row] a[href="${href}"]:visible`).first(), pageReady,
      { href });
    const selected = await page.locator('[data-app-tab-id][aria-selected="true"]').getAttribute("data-app-tab-id");
    assert.ok((allowedTabIds ?? [activeTab, pageTab.id]).includes(selected));
    results.pageTabTransitions.push({ name, fromTab: activeTab, selectedTab: selected, href });
    activeTab = selected;
    return results.measurements.at(-1);
  }
  // Opening the stable foreign Page intentionally activates its existing tab.
  // Track the actual authorized selection while preserving the original four
  // normalized documents; visiting another old document could normalize it.
  activeTab = pageTab.id;
  await clickMeasured("initial-page-tab", page.locator(`[data-app-tab-id="${activeTab}"]`), pageReady,
    { href: pageTab.href, title: "Performance guide 1.11", tab: activeTab });
  await openPage(0, 11, "first-page-switch");
  await openPage(0, 10, "first-page-return");
  for (let index = 0; index < repeats; index++) {
    await openPage(0, 11, "page-switch");
    await openPage(0, 10, "page-return");
    await page.waitForTimeout(350);
  }
  await switchProject(1, "first-cross-project-pages", true);
  await openPage(1, 0, "first-cross-project-page");
  await openPage(1, 1, "first-cross-project-page-switch");
  const completeFlow = (name, section, document) => {
    assert.equal(section.timeOrigin, document.timeOrigin);
    results.measurements.push({ name, timeOrigin: section.timeOrigin, start: section.start,
      domMs: document.start + document.domMs - section.start,
      paintMs: document.start + document.paintMs - section.start,
      completeMs: document.start + document.completeMs - section.start,
      componentSamples: [section.name, document.name],
    });
  };
  for (let index = 0; index < repeats; index++) {
    const returning = await switchProject(0, "cross-project-pages-return", true);
    const returned = await openPage(0, 11 - index % 2, "cross-project-page-return");
    completeFlow("cross-project-document-return", returning, returned);
    const switching = await switchProject(1, "cross-project-pages-switch", true);
    const switched = await openPage(1, index % 2, "cross-project-page-switch");
    completeFlow("cross-project-document-switch", switching, switched);
    await page.waitForTimeout(350);
  }
  assert.equal(await page.evaluate(sameTab, activeTab), true);
  results.verification = { selectedAuthorizedTabVerified: true, existingStablePageActivationRecorded: true, projectCardIdentityVerified: true, pageIdentityAndBlockCountVerified: true,
    expectedProjectCards: Object.fromEntries(projects.map((project) => [project, connectedBoard?.perProject[project]?.cards ?? 100])),
    expectedPageBlocks: 80, realForgeDetailMeasured: false };
}
