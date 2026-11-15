import type { DesktopIpcHandlers } from "@/lib/desktop/ipc-main";
import { navigationDecision } from "@/lib/desktop/nav-guard";

interface NavigationDependencies {
  /** The selected server's origin. */
  origin: () => string;
  openExternal: (url: string) => void;
  /** The sign-in link held for the current document (auth-link-delivery.ts). */
  authLinks: { ready: (renderer: number) => void; notReady: (renderer: number) => void };
  showServerChoice: () => void;
}

type NavigationChannel =
  | "minddy:open-external"
  | "minddy:open-agent-app"
  | "minddy:auth-link"
  | "minddy:server-picker:open";

/** Where the page asks the shell to go: the system browser, an agent app, a held sign-in link, the server choice. */
export function navigationHandlers<E extends { sender: { id: number } }>(
  deps: NavigationDependencies,
): Pick<DesktopIpcHandlers<E>, NavigationChannel> {
  return {
    "minddy:open-external": (_event, url) => {
      // Handing a `file://` URL or another app's scheme to the system is
      // execution: only what the navigation guard lets out leaves.
      if (navigationDecision(url, deps.origin()) === "block") return;
      deps.openExternal(url);
    },
    // The contract admits only the exact "new conversation" link of a known
    // agent app (agent-app-links.ts, MIN-951).
    "minddy:open-agent-app": (_event, link) => deps.openExternal(link),
    // A link that launched the app waits for the current document to
    // subscribe, then goes to that document alone (MIN-310).
    "minddy:auth-link": {
      ready: ({ sender }) => deps.authLinks.ready(sender.id),
      notReady: ({ sender }) => deps.authLinks.notReady(sender.id),
    },
    "minddy:server-picker:open": () => deps.showServerChoice(),
  };
}
