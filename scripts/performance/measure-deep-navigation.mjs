import assert from "node:assert/strict";
import { id } from "./seed.mjs";

/** Genuine sidebar/tree clicks, with destination identity and complete content. */
export async function measureDeepNavigation({ page, fixture, activeTab, pageTab, repeats, clickMeasured, results, windowingCompatible = false }) {
  results.protocol = windowingCompatible ? "min683-deep-v3-visible-source-counts" : "min683-deep-v2-alternating-documents";
  const projects = fixture.projects.slice(0, 2);
  const sameTab = (tab) => !!document.querySelector(`[data-app-tab-id="${tab}"][aria-selected="true"]`);
  const projectReady = ({ project, tab }) => {
    const root = document.querySelector('[data-app-view-active="true"]');
    const cards = root?.querySelectorAll("[data-issue-id]");
    if (window.__instant.windowingCompatible) return location.pathname === `/projects/${project}` &&
      !!document.querySelector(`[data-app-tab-id="${tab}"][aria-selected="true"]`) &&
      window.__instant.boardReady(100, `Performance task ${project === window.__instant.projects[0] ? 1 : 2}.`);
    return location.pathname === `/projects/${project}` &&
      !!document.querySelector(`[data-app-tab-id="${tab}"][aria-selected="true"]`) &&
      !!root?.getClientRects().length && !root.inert && cards.length === 100 &&
      [...cards].every((node) => node.textContent.includes(`Performance task ${project === window.__instant.projects[0] ? 1 : 2}.`));
  };
  await page.evaluate((projects) => { window.__instant.projects = projects; }, projects);
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
    const treeReady = ({ href, tab }) => location.pathname.startsWith(href) &&
      !!document.querySelector(`[data-app-tab-id="${tab}"][aria-selected="true"]`) &&
      [...document.querySelectorAll('[data-sidebar-page-row] a[href]')].filter((node) => node.getClientRects().length).length === 20;
    await clickMeasured(name, item, pages ? treeReady : projectReady,
      pages ? { href, tab: activeTab } : { project: projects[index], tab: activeTab });
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
  const pageReady = ({ href, title, tab }) => {
    if (location.pathname !== href || !document.querySelector(`[data-app-tab-id="${tab}"][aria-selected="true"]`)) return false;
    return [...document.querySelectorAll(".page-editor .tiptap")].some((node) =>
      node.getClientRects().length &&
      node.querySelectorAll(":scope > h2").length === 8 && node.querySelectorAll(":scope > p").length === 72 &&
      [...document.querySelectorAll('h1, textarea')].some((header) => header.getClientRects().length &&
        (header.value ?? header.textContent).trim() === title));
  };
  async function openPage(project, document, name) {
    const href = `/projects/${projects[project]}/pages/${id(`page-${project}-${document}`)}`;
    await clickMeasured(name, page.locator(`[data-sidebar-page-row] a[href="${href}"]:visible`).first(), pageReady,
      { href, title: `Performance guide ${project + 1}.${document + 1}`, tab: activeTab });
    return results.measurements.at(-1);
  }
  // Use distinct owned Page destinations: opening a destination already in
  // another tab intentionally activates that tab in the normal product.
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
  results.verification = { sameTabPreserved: true, projectCardIdentityVerified: true, pageIdentityAndBlockCountVerified: true,
    expectedProjectCards: 100, expectedPageBlocks: 80, realForgeDetailMeasured: false };
}
