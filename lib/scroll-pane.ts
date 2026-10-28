/** The nearest ancestor of `element` that scrolls vertically — the pane a
    document column sits in — or the body when none does. */
export function scrollPane(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return document.body;
}
