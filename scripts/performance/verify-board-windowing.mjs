import assert from "node:assert/strict";
import { revealBoardIssue } from "./board-readiness.mjs";

/** Actual product interactions; no replacement data or latency aggregation. */
export async function verifyBoardWindowing({ page, fixture, issueStatus, results }) {
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
  results.windowingVerification = { ...source, offscreenIssueRevealed: true, fieldPopoverPinned: true,
    unsentDialogDraftPinned: true, dragSourcePinned: true, distantDropTargetRevealed: true,
    cancelledDrag: true, responsiveScroll: true };
}
