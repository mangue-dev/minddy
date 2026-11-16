/**
 * Resolves once the images inside `root` can be painted: no element is
 * marked `data-media-pending` (a project icon still loading, see
 * `ProjectOrb`) and every `<img>` has loaded or failed, then decoded. A view
 * that reveals its content in one step (Home, MIN-1006) awaits it, so an icon
 * does not swap in just after the reveal. The caller bounds the wait.
 */
export const MEDIA_PENDING_SELECTOR = "[data-media-pending]";

export function mediaSettled(root: Element): Promise<void> {
  return new Promise((resolve) => {
    let observer: MutationObserver | null = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      observer?.disconnect();
      const images = [...root.querySelectorAll("img")];
      // `decode` waits for the load too; a failed image resolves the same way.
      void Promise.all(images.map((image) =>
        typeof image.decode === "function" ? image.decode().catch(() => {}) : undefined))
        .then(() => resolve());
    };
    const check = () => {
      if (!root.querySelector(MEDIA_PENDING_SELECTOR)) finish();
    };
    check();
    if (finished) return;
    observer = new MutationObserver(check);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-media-pending"] });
  });
}
