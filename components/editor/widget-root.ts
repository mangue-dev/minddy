import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Renders React content into a ProseMirror widget's DOM node.
 *
 * ProseMirror builds and drops widgets while it updates the view, and the
 * editor can update the view during a React render. Rendering or unmounting a
 * root at that moment makes React warn about nested updates (MIN-981), so both
 * wait for a microtask: the widget is still filled before the next paint.
 * Returns the teardown to call when the widget is destroyed.
 */
export function mountWidgetRoot(host: HTMLElement, content: ReactNode): () => void {
  let root: Root | null = null;
  let dropped = false;
  queueMicrotask(() => {
    if (dropped) return;
    root = createRoot(host);
    root.render(content);
  });
  return () => {
    if (dropped) return;
    dropped = true;
    queueMicrotask(() => root?.unmount());
  };
}
