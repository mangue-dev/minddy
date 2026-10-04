export type BoardScrollPosition = { current: number };

/** Restore a preserved position without scrolling beyond the current content. */
export function restoreBoardScroll(
  node: Pick<HTMLElement, "clientWidth" | "scrollLeft" | "scrollWidth">,
  position: BoardScrollPosition
) {
  // Most reconciliations retain the requested offset. Avoid measuring content
  // geometry again when no restoration is needed.
  if (Math.abs(node.scrollLeft - position.current) <= 1) return;
  const maximum = Math.max(0, node.scrollWidth - node.clientWidth);
  const target = Math.min(position.current, maximum);
  if (Math.abs(node.scrollLeft - target) > 1) node.scrollLeft = target;
}
