import type { DesktopAuthLink } from "./auth-link";

interface Options {
  currentRenderer: () => number | null;
  send: (link: DesktopAuthLink) => void;
}

/** Keep cold-start links until the current document subscribes to the bridge. */
export function createDesktopAuthLinkDelivery(options: Options) {
  let pending: DesktopAuthLink | null = null;
  let readyRenderer: number | null = null;
  function flush() {
    const current = options.currentRenderer();
    if (!pending || current === null || current !== readyRenderer) return;
    const link = pending;
    try {
      options.send(link);
      if (pending === link) pending = null;
    } catch {
      // A disappearing renderer must not consume the authentication callback.
      readyRenderer = null;
    }
  }
  return {
    receive(link: DesktopAuthLink) { pending = link; flush(); },
    ready(renderer: number) {
      if (renderer !== options.currentRenderer()) return;
      readyRenderer = renderer;
      flush();
    },
    notReady(renderer: number) {
      if (readyRenderer === renderer) readyRenderer = null;
    },
    flush,
  };
}
