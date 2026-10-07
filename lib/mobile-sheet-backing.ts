const SHEET_SELECTOR = '[data-mobile-sheet][data-slot="sheet-content"], [data-slot="alert-dialog-content"]';

/** Paint beneath the keyboard without inheriting a fixed sheet's viewport offset. */
export function observeMobileSheetBacking(media: MediaQueryList) {
  const backing = document.createElement("div");
  backing.setAttribute("data-mobile-sheet-backing", "");
  backing.setAttribute("aria-hidden", "true");
  let active: HTMLElement | null = null;
  let frame = 0;
  let disposed = false;

  const resize = new ResizeObserver(() => update());
  const mutations = new MutationObserver((records) => {
    if (records.some((record) => record.target !== backing)) update();
  });

  const paint = () => {
    frame = 0;
    if (disposed) return;
    let next: HTMLElement | null = null;
    let highest = -Infinity;
    if (media.matches) {
      for (const sheet of document.querySelectorAll<HTMLElement>(SHEET_SELECTOR)) {
        const style = getComputedStyle(sheet);
        if (!sheet.offsetHeight || style.visibility === "hidden" || style.display === "none") continue;
        // Keep the backing through Radix's exit animation, then restore its parent.
        if (sheet.dataset.state === "closed" && (!style.animationName || style.animationName === "none")) continue;
        const level = Number.parseInt(style.zIndex, 10) || 0;
        if (level >= highest) { highest = level; next = sheet; }
      }
    }
    if (next !== active) {
      resize.disconnect();
      active = next;
      if (active) resize.observe(active);
    }
    if (!active) { backing.remove(); return; }

    const style = getComputedStyle(active);
    // Equal z-index and adjacent DOM order put this above the active overlay,
    // below its content, and outside the transformed/inert page surface.
    if (backing.nextSibling !== active) active.before(backing);
    const root = document.documentElement;
    const sheetBottom = active.getBoundingClientRect().bottom;
    // A short picker still needs to cover the entire keyboard strip beneath it.
    const height = Math.max(active.offsetHeight, root.clientHeight - sheetBottom);
    const documentTop = window.scrollY + root.clientHeight - height;
    let top = documentTop;
    let left = window.scrollX;
    const parent = backing.offsetParent as HTMLElement | null;
    if (parent && (parent !== document.body || getComputedStyle(parent).position !== "static")) {
      const bounds = parent.getBoundingClientRect();
      top -= bounds.top + window.scrollY + parent.clientTop - parent.scrollTop;
      left -= bounds.left + window.scrollX + parent.clientLeft - parent.scrollLeft;
    }
    Object.assign(backing.style, {
      top: `${top}px`, left: `${left}px`, width: `${root.clientWidth}px`, height: `${height}px`,
      backgroundColor: style.backgroundColor, zIndex: style.zIndex,
      // Only expose the part below the sheet, preserving its rounded corners
      // and entrance animation when no keyboard is present.
      clipPath: `inset(${Math.min(height, Math.max(0, sheetBottom + window.scrollY - documentTop))}px 0 0 0)`,
      animationDuration: style.animationDuration,
    });
    backing.dataset.state = active.dataset.state;
    // Follow entrance/exit geometry and theme colors between observer callbacks.
    if (active.getAnimations?.().some((animation) => animation.playState === "running")) update();
  };

  function update() {
    if (!disposed && !frame && (media.matches || active)) frame = requestAnimationFrame(paint);
  }
  const watch = () => {
    mutations.disconnect();
    if (media.matches) mutations.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ["class", "style", "data-state", "data-mobile-sheet"],
    });
    update();
  };
  media.addEventListener("change", watch);
  window.addEventListener("resize", update);
  window.addEventListener("scroll", update, { passive: true });
  document.addEventListener("animationend", update);
  document.addEventListener("transitionrun", update);
  document.addEventListener("transitionend", update);
  watch();
  return {
    update,
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      media.removeEventListener("change", watch);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      document.removeEventListener("animationend", update);
      document.removeEventListener("transitionrun", update);
      document.removeEventListener("transitionend", update);
      backing.remove();
    },
  };
}
