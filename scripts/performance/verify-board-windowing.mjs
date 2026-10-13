import assert from "node:assert/strict";
import { revealBoardIssue } from "./board-readiness.mjs";
import { assertScope, id } from "./seed.mjs";

/** Actual product interactions; no replacement data or latency aggregation. */
export async function verifyBoardWindowing({ page, fixture, issueStatus, results, api, cdp, touch = false, mutations = false }) {
  const root = page.locator('[data-app-view-active="true"]');
  const column = root.locator(`[data-board-column-status="${issueStatus}"]`);
  const card = () => root.locator(`[data-issue-id="${fixture.firstIssue}"]`);
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await revealBoardIssue(page, fixture.firstIssue, issueStatus);
  const source = await root.evaluate((node) => ({
    windowedColumns: node.querySelectorAll('[data-board-windowed]').length,
    cards: node.querySelectorAll('[data-issue-id]').length,
    elements: node.querySelectorAll('*').length,
  }));
  assert.ok(source.windowedColumns >= 5 && source.cards < 150, "Actual populated windows must bound card DOM");
  const initialScroll = await column.evaluate((node) => node.scrollTop);
  assert.ok(initialScroll > 0, "Verify an offscreen marked issue through real scrolling");
  await card().evaluate((node) => { window.__instant.pinnedCard = node; });
  await card().getByRole("button", { name: "Change priority", exact: true }).click();
  await page.locator('[data-floating-surface]').filter({ visible: true }).first().waitFor();
  await column.evaluate((node) => { node.scrollTop = 0; }); await frames();
  assert.equal(await card().evaluate((node) => node === window.__instant.pinnedCard), true);
  assert.equal(await card().getByRole("button", { name: "Change priority", exact: true }).getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  await page.locator('[data-floating-surface]').filter({ visible: true }).first().waitFor({ state: "hidden" });
  await root.locator('[data-board-column-scroller]').first().evaluate((node) => node.focus());
  await column.evaluate((node) => { node.scrollTop = 20; }); await frames();
  await revealBoardIssue(page, fixture.firstIssue, issueStatus);
  await card().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy as prompt", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Custom…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Custom prompt", exact: true });
  await dialog.waitFor();
  const draft = dialog.locator("textarea");
  await draft.fill("MIN-683 unsent windowing verification draft");
  await card().evaluate((node) => { window.__instant.dialogCard = node; });
  await column.evaluate((node) => { node.scrollTop = 0; }); await frames();
  assert.equal(await card().evaluate((node) => node === window.__instant.dialogCard), true);
  assert.equal(await draft.inputValue(), "MIN-683 unsent windowing verification draft");
  await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  await revealBoardIssue(page, fixture.firstIssue, issueStatus);
  await card().evaluate((node) => { window.__instant.dragCard = node; });
  const box = await card().boundingBox(); assert.ok(box);
  await page.mouse.move(box.x + Math.min(90, box.width / 2), box.y + 35);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(90, box.width / 2) + 12, box.y + 45, { steps: 3 });
  const target = root.locator('[data-board-column-status="todo"]');
  await target.scrollIntoViewIfNeeded();
  const destination = await target.boundingBox(); assert.ok(destination);
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 100, { steps: 8 });
  await root.locator('[data-board-drop-indicator]').waitFor();
  await page.waitForFunction(() => {
    const marker = document.querySelector('[data-app-view-active="true"] [data-board-drop-indicator]');
    const column = marker?.closest('[data-board-column-scroller]');
    if (!marker || !column) return false;
    const line = marker.getBoundingClientRect(), view = column.getBoundingClientRect();
    return line.top >= view.top && line.bottom <= view.bottom;
  });
  await column.evaluate((node) => { node.scrollTop = 0; }); await frames();
  assert.equal(await card().evaluate((node) => node === window.__instant.dragCard), true);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await root.locator('[data-board-drop-indicator]').waitFor({ state: "hidden" });
  await revealBoardIssue(page, fixture.firstIssue, issueStatus);
  await page.setViewportSize({ width: 1100, height: results.viewport.height - 120 });
  await frames();
  assert.ok(await card().count());
  await page.setViewportSize(results.viewport); await frames();
  await revealBoardIssue(page, fixture.firstIssue, issueStatus);
  await column.evaluate((node) => { node.scrollTop = 0; }); await frames();
  await column.locator('[data-board-row-id]').first().locator('button:not([disabled]),a[href],[tabindex="0"]').first().focus();
  const traversed = new Set();
  for (let step = 0; step < 180 && traversed.size < 12; step++) {
    const focused = await page.evaluate(() => document.activeElement?.closest('[data-board-row-id]')?.getAttribute('data-board-row-id'));
    assert.ok(focused, "Tab must not skip unmounted logical rows and escape to the footer");
    traversed.add(focused);
    await page.keyboard.press("Tab");
  }
  assert.ok(traversed.size >= 12, "Keyboard traversal must cross the initial window");
  assert.ok(await column.evaluate((node) => node.scrollTop > 0));
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press("Shift+Tab");
    assert.ok(await page.evaluate(() => document.activeElement?.closest('[data-board-row-id]')),
      "Reverse traversal must preserve the logical column");
  }
  results.windowingVerification = { ...source, offscreenIssueRevealed: true, fieldPopoverPinned: true,
    unsentDialogDraftPinned: true, dragSourcePinned: true, distantDropTargetRevealed: true,
    cancelledDrag: true, responsiveScroll: true, keyboardWindowTraversal: true };
  if (touch) {
    assert.ok(cdp, "Touch verification requires the actual Chromium input session");
    await column.evaluate((node) => { node.scrollTop = 0; }); await frames();
    const view = await column.boundingBox(); assert.ok(view);
    await page.evaluate(() => {
      window.__instant.touchEvents = 0;
      window.__instant.onTouch = () => { window.__instant.touchEvents++; };
      document.addEventListener("touchstart", window.__instant.onTouch, { passive: true });
    });
    try {
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      await cdp.send("Input.synthesizeScrollGesture", { x: view.x + view.width / 2,
        y: view.y + Math.min(view.height / 2, 300), yDistance: -420,
        speed: 1500, preventFling: true, gestureSourceType: "touch" });
      await frames();
      const scroll = await column.evaluate((node) => node.scrollTop);
      const events = await page.evaluate(() => window.__instant.touchEvents);
      assert.ok(scroll > 200 && events > 0, "A genuine browser touch gesture must scroll the windowed column");
      assert.equal(await root.locator('[data-board-drop-indicator]').count(), 0, "Touch scrolling must not start mouse-only dragging");
      results.windowingVerification.touchGestureScroll = { scrollTop: scroll, touchEvents: events, simulated: true };
    } finally {
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.evaluate(() => document.removeEventListener("touchstart", window.__instant.onTouch));
    }
  }
  if (mutations) await verifyLanding({ page, root, fixture, api, results });
}

/** Explicit mutation diagnostic: only two marked issues, with exact field restoration. */
async function verifyLanding({ page, root, fixture, api, results }) {
  const ids = [fixture.firstIssue, id("issue-0-5")];
  const original = await Promise.all(ids.map((value) => api(`/api/issues/${value}`)));
  for (const issue of original) {
    assertScope("issues", issue, fixture.userId);
    assert.equal(issue.status, "backlog");
    assert.equal(issue.completed_at, null);
    assert.equal(issue.cycle_id, null);
  }
  const board = await api("/api/me/board");
  const stable = (issues) => issues.map((issue) => {
    const copy = { ...issue };
    if (ids.includes(issue.id)) delete copy.updated_at;
    return copy;
  }).sort((a, b) => a.id.localeCompare(b.id));
  let mutated = false;
  const restore = async () => {
    for (const issue of original) {
      const current = await api(`/api/issues/${issue.id}`);
      if (current.status !== issue.status || current.position !== issue.position) {
        await api(`/api/issues/${issue.id}`, "PATCH", { status: issue.status, position: issue.position });
      }
      const restored = await api(`/api/issues/${issue.id}`);
      const expected = { ...issue }, actual = { ...restored };
      delete expected.updated_at; delete actual.updated_at;
      assert.deepEqual(actual, expected, "Every issue field except the expected write timestamp must be restored");
    }
    assert.deepEqual(stable((await api("/api/me/board")).issues), stable(board.issues),
      "Only the two journaled issue timestamps may change in the connected board");
  };
  try {
    for (const count of [1, 2]) {
      await page.keyboard.press("Escape");
      for (const issue of original.slice(0, count)) {
        await revealBoardIssue(page, issue.id, "backlog");
        if (count > 1) await root.locator(`[data-issue-id="${issue.id}"]`).click({ modifiers: ["Shift"] });
      }
      await revealBoardIssue(page, ids[0], "backlog");
      const card = root.locator(`[data-issue-id="${ids[0]}"]`);
      const box = await card.boundingBox(); assert.ok(box);
      await page.evaluate(() => {
        window.__instant.landing = [];
        window.__instant.landingObserver = new MutationObserver(() => {
          const node = document.querySelector('[data-app-view-active="true"] [data-board-drop-placeholder]');
          if (node) window.__instant.landing.push({ height: node.getBoundingClientRect().height,
            duplicateVisibleSources: [...document.querySelectorAll('[data-app-view-active="true"] [data-issue-id]')]
              .filter((card) => card.closest('[data-board-row-id]')?.style.height === "0px" && getComputedStyle(card).visibility !== "hidden").length });
        });
        window.__instant.landingObserver.observe(document.body, { subtree: true, childList: true, attributes: true });
      });
      await page.mouse.move(box.x + 80, box.y + 35); await page.mouse.down();
      await page.mouse.move(box.x + 92, box.y + 45, { steps: 3 });
      const target = root.locator('[data-board-column-status="todo"]');
      await target.scrollIntoViewIfNeeded();
      const destination = await target.boundingBox(); assert.ok(destination);
      await page.mouse.move(destination.x + destination.width / 2, destination.y + 110, { steps: 8 });
      await root.locator('[data-board-drop-indicator]').waitFor();
      if (count > 1) assert.equal((await root.locator('[data-board-drop-indicator]').textContent()).trim(), "2");
      const writes = original.slice(0, count).map((issue) => page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/issues/${issue.id}` && response.request().method() === "PATCH"));
      mutated = true;
      await page.mouse.up();
      for (const response of await Promise.all(writes)) assert.equal(response.status(), 200);
      await root.locator('[data-board-drop-placeholder]').waitFor({ state: "hidden" });
      const landing = await page.evaluate(() => { window.__instant.landingObserver.disconnect(); return window.__instant.landing; });
      assert.ok(landing.length && landing.some((frame) => frame.height > (count === 1 ? 80 : 200)), "Landing must reserve the complete bundle");
      assert.ok(landing.every((frame) => frame.duplicateVisibleSources === 0), "Landing owns volume without visible duplicate sources");
      for (const issue of original.slice(0, count)) {
        assert.equal((await api(`/api/issues/${issue.id}`)).status, "todo");
        await revealBoardIssue(page, issue.id, "todo");
      }
      await restore();
      await page.keyboard.press("Escape");
      await page.waitForFunction((ids) => ids.every((id) => {
        const card = document.querySelector(`[data-app-view-active="true"] [data-issue-id="${id}"]`);
        return !card || card.closest('[data-board-column-status]')?.getAttribute('data-board-column-status') === "backlog";
      }), ids);
      results.windowingVerification[count === 1 ? "singleLanding" : "bulkLanding"] = { writes: count, placeholderObserved: true, fieldsRestored: true };
    }
  } finally {
    await page.mouse.up(); await page.keyboard.press("Escape");
    await page.evaluate(() => window.__instant.landingObserver?.disconnect());
    if (mutated) await restore();
    results.windowingMutationRestoration = { expectedTimestampChanges: ids, fieldsAndOtherIssuesUnchanged: true };
  }
}
