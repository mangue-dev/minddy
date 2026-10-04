import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// Native UI-only checks; tab persistence is virtual, all Minddy content is real.
export async function verifyNavigationState({ page, context, specs, select, ready, base, output, label }) {
  const state = { checks: [], cleanup: false };
  const save = () => writeFile(`${output}/${label}-navigation-state.json`, JSON.stringify(state, null, 2));
  try {
    await select(specs[0]); await ready(specs[0]);
    const columns = page.locator('[data-app-view-active="true"] [data-board-column-scroller]');
    const scrollIndex = await columns.evaluateAll((nodes) => nodes.findIndex((node) => node.scrollHeight - node.clientHeight > 140)); assert.ok(scrollIndex >= 0);
    const column = await columns.nth(scrollIndex).elementHandle();
    await column.evaluate((node) => { node.scrollTop = 140; node.dispatchEvent(new Event('scroll')); });
    await select(specs[8]); await ready(specs[8]); await select(specs[0]); await ready(specs[0]);
    const scrolled = await column.evaluate((node) => ({ connected: node.isConnected, top: node.scrollTop }));
    assert.ok(scrolled.connected); assert.equal(scrolled.top, 140);
    state.checks.push({ name: 'retained-global-column-scroll', passed: true, ...scrolled }); await save();

    for (let i = 0; i < 3; i++) { await select(specs[9]); await ready(specs[9]); await select(specs[11]); await ready(specs[11]); }
    await select(specs[9]); await ready(specs[9]);
    const field = () => page.locator('input[placeholder^="Filter"]').filter({ visible: true }).first();
    await field().fill('MIN-614'); await field().evaluate((node) => node.setSelectionRange(0, 7));
    const input = await field().elementHandle();
    await select(specs[11]); await ready(specs[11]);
    const retained = await input.evaluate((node) => node.isConnected);
    await select(specs[9]); await ready(specs[9]);
    const returned = await field().evaluate((node) => ({ value: node.value, selectionStart: node.selectionStart, selectionEnd: node.selectionEnd }));
    if (retained) { assert.equal(returned.value, 'MIN-614'); assert.equal(returned.selectionEnd, 7); }
    await page.keyboard.press('/'); assert.equal(await field().evaluate((node) => document.activeElement === node), true);
    state.checks.push({ name: 'feedback-filter-selection-focus', retained, returned, currentShortcutFocused: true }); await field().fill(''); await save();

    const control = page.locator(`[data-app-tab-id="${specs[9].id}"]`);
    const order = () => page.locator('[data-app-tab-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.appTabId));
    const before = await order(); await control.focus(); await control.press('Alt+Shift+ArrowLeft');
    await page.waitForFunction(({ id, before }) => [...document.querySelectorAll('[data-app-tab-id]')].findIndex((node) => node.dataset.appTabId === id) === before - 1, { id: specs[9].id, before: before.indexOf(specs[9].id) });
    await page.waitForFunction(() => !document.querySelector('[role="tablist"][aria-busy="true"]'));
    await control.press('Alt+Shift+ArrowRight');
    await page.waitForFunction((expected) => JSON.stringify([...document.querySelectorAll('[data-app-tab-id]')].map((node) => node.dataset.appTabId)) === JSON.stringify(expected), before);
    assert.equal(await control.getAttribute('aria-selected'), 'true');
    state.checks.push({ name: 'keyboard-tab-reorder-and-restore', passed: true }); await save();

    // Sidebar panel scope is intentional independent UI state. Enter the
    // project through its actual navigation link before using its picker.
    await select(specs[0]); await ready(specs[0]);
    await page.locator(`a[href="${specs[6].href}"]`).filter({ visible: true }).first().click(); await ready(specs[6]);
    await page.locator(`a[href="${specs[5].href}"]`).filter({ visible: true }).first().click(); await ready(specs[5]);
    const projectId = (spec) => spec.href.split('/')[2];
    const projects = await Promise.all([specs[5], specs[11]].map(async (spec) => {
      const response = await context.request.get(`${base}/api/projects/${projectId(spec)}`); assert.ok(response.ok()); return response.json();
    }));
    await page.getByRole('button', { name: 'Triage', exact: true }).click();
    await page.getByRole('button', { name: projects[0].name, exact: true }).click();
    await page.getByRole('menuitem', { name: projects[1].name, exact: true }).click(); await ready(specs[11]);
    for (const index of [0, 1]) {
      await page.getByRole('button', { name: 'Triage', exact: true }).click();
      await page.getByRole('button', { name: projects[1 - index].name, exact: true }).click();
      await page.getByRole('menuitem', { name: projects[index].name, exact: true }).click(); await ready(specs[index ? 11 : 5]);
    }
    await page.getByRole('button', { name: 'Triage', exact: true }).click();
    await page.locator(`a[href="${specs[7].href}"]`).filter({ visible: true }).first().click(); await ready(specs[7]);
    state.checks.push({ name: 'project-picker-then-new-project-pages', passed: true, route: specs[7].href }); await save();
    await page.screenshot({ path: `${output}/${label}-navigation-dark.png` });
    // Visual proof only: the account theme remains authoritative in all
    // performance samples; no account preference is written for this image.
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.screenshot({ path: `${output}/${label}-navigation-light.png` });
  } catch (error) { state.error = error.message; state.failureUrl = page.url(); await page.screenshot({ path: `${output}/${label}-state-failure.png` }); await save(); throw error; }
  finally { state.cleanup = true; await save(); }
}
