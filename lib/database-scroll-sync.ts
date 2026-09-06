/** Synchronize two native scrollers without feeding delayed mirror events back. */
export function bindDatabaseScrollSync(
  viewport: HTMLElement,
  scrollbar: HTMLElement,
): () => void {
  let viewportPosition = viewport.scrollLeft;
  scrollbar.scrollLeft = viewportPosition;
  let scrollbarPosition = scrollbar.scrollLeft;

  const updateAria = () => {
    scrollbar.setAttribute("aria-valuenow", String(viewport.scrollLeft));
  };
  const fromViewport = () => {
    const position = viewport.scrollLeft;
    if (position === viewportPosition) return;
    viewportPosition = position;
    if (scrollbar.scrollLeft !== position) scrollbar.scrollLeft = position;
    // Read back the browser's applied value, which can be rounded or clamped.
    scrollbarPosition = scrollbar.scrollLeft;
    updateAria();
  };
  const fromScrollbar = () => {
    const position = scrollbar.scrollLeft;
    if (position === scrollbarPosition) return;
    scrollbarPosition = position;
    if (viewport.scrollLeft !== position) viewport.scrollLeft = position;
    viewportPosition = viewport.scrollLeft;
    updateAria();
  };

  updateAria();
  viewport.addEventListener("scroll", fromViewport, { passive: true });
  scrollbar.addEventListener("scroll", fromScrollbar, { passive: true });
  return () => {
    viewport.removeEventListener("scroll", fromViewport);
    scrollbar.removeEventListener("scroll", fromScrollbar);
  };
}
