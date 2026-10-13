// Serialized into the actual browser. Verify complete collection counts and
// populated, hit-testable rows without requiring offscreen cards in the DOM.
export function boardReady(expectedCards, projectPrefix, expectedIds) {
  const root = document.querySelector('[data-app-view-active="true"]');
  if (!root?.getClientRects().length || root.inert ||
    !["fresh", "refreshing"].includes(root.dataset.boardReadState)) return false;
  const scrollers = [...root.querySelectorAll('[data-board-column-scroller]')];
  if (!scrollers.length) return false;
  const counts = scrollers.map((node) => {
    const header = node.parentElement?.parentElement?.firstElementChild;
    const count = [...header?.children ?? []].find((child) => child.tagName === "SPAN" && /^\d+$/.test(child.textContent.trim()));
    return count ? Number(count.textContent.trim()) : NaN;
  });
  if (counts.reduce((sum, count) => sum + count, 0) !== expectedCards) return false;
  const cards = [...root.querySelectorAll('[data-issue-id]')];
  const allowed = expectedIds ? new Set(expectedIds) : null;
  if (!cards.length || cards.some((card) => !card.textContent.trim() ||
    (allowed && !allowed.has(card.dataset.issueId)) ||
    (projectPrefix && !card.textContent.includes(projectPrefix)))) return false;
  const view = root.getBoundingClientRect();
  for (let index = 0; index < scrollers.length; index++) {
    if (!counts[index]) continue;
    const node = scrollers[index];
    const box = node.getBoundingClientRect();
    const left = Math.max(box.left, view.left, 0);
    const right = Math.min(box.right, view.right, innerWidth);
    if (right - left < 20 || box.height < 80) continue;
    if (getComputedStyle(node).visibility === "hidden" || node.closest('[inert]')) return false;
    const populated = [20, 48, 76].some((offset) => {
      const hit = document.elementFromPoint((left + right) / 2, box.top + offset);
      const card = hit?.closest('[data-issue-id]');
      return card && hit !== card && root.contains(card) && !card.closest('[inert]');
    });
    if (!populated) return false;
  }
  return true;
}

/** Position the same marked ticket with real scrolling before trusted input. */
export async function revealBoardIssue(page, issueId, status) {
  const selector = `[data-app-view-active="true"] [data-issue-id="${issueId}"]`;
  const scroller = page.locator(`[data-app-view-active="true"] [data-board-column-status="${status}"]`);
  await scroller.scrollIntoViewIfNeeded();
  const visible = () => page.evaluate(({ selector, status }) => {
    const card = document.querySelector(selector);
    const column = document.querySelector(`[data-app-view-active="true"] [data-board-column-status="${status}"]`);
    if (!card || !column) return false;
    const row = card.getBoundingClientRect(), box = column.getBoundingClientRect();
    return row.top >= box.top + 8 && row.top + Math.min(row.height, 60) <= box.bottom;
  }, { selector, status });
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (await visible()) return;
  const box = await scroller.boundingBox();
  if (!box) throw new Error("Missing marked issue column");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 1_000_000);
  await frames();
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await visible()) return;
    await page.mouse.wheel(0, -Math.max(120, box.height / 2));
    await frames();
  }
  throw new Error("Marked issue did not become visible through board scrolling");
}
