/**
 * Where is the shell update, seen from the PAGE (MIN-353).
 *
 * ## Why the page needs to know
 *
 * The native box is an instant: it opens once, at the end du
 * download, and whoever responds "later" no longer has anything in front of their eyes.
 * The state lasts - the new version remains on the disk until the next ⌘Q.
 * Hence this second surface, in the sidebar: it asks for nothing,
 * it OBSERVES, and it is found when we see it seeks.
 *
 * ## State, not events
 *
 * electron-updater speaks in events (`update-available`, `update-downloaded`,
 * `error`), and a a subscriber who arrives afterwards never hears them. But the renderer
 * ALWAYS arrives afterwards: the window reloads, we change the channel, the
 * page rewinds. The main process therefore holds the state, the page reads it — and the
 * replay of the subscription, as for the macOS buttons, is what makes the
 * difference between “there is no update” and “I was not there when
 * we said it”.
 *
 * PUR module: `desktop/src/updater.ts` reduces events here,
 * `components/app-sidebar.tsx` displays the result.
 */

export type DesktopUpdateStatus =
  /** Nothing to report — almost always the case, and that of the browser. */
  | { state: "idle" }
  /** A new version is coming down. Nothing to do, nothing to click. */
  | { state: "downloading"; version: string }
  /** It's on the disk. This is the only state where a gesture is possible. */
  | { state: "ready"; version: string };

export const IDLE_UPDATE_STATUS: DesktopUpdateStatus = { state: "idle" };

/** What the shell learns from electron-updater, reduced to what matters. */
export type DesktopUpdateEvent =
  | { kind: "available"; version: string }
  | { kind: "downloaded"; version: string }
  | { kind: "error" };

/**
 * The next state.
 *
 * **Two rules, and each repairs a round trip that we would have seen on the screen.**
 *
 * 1. **An already ready version does not become "in progress" again.** The check
 * runs every six hours and announces again what it finds, downloaded or
 * no: without this guard, an update placed on the disk on Monday
 * went back to "download..." every six hours, and never came out
 * never — the second `update-downloaded` is not guaranteed.
 * 2. **An error does not erase what is ready.** The file is there; a hotel Wi-Fi
 * that fails the next check does not remove it from the
 * disk. Removing the line at this point erases the only thing that still allowed you to install.
 *
 * An error DURING the download, on the other hand, returns to silence: there is nothing on the disk and nothing to announce.
 */
export function reduceUpdateStatus(
  current: DesktopUpdateStatus,
  event: DesktopUpdateEvent
): DesktopUpdateStatus {
  if (event.kind === "downloaded") {
    return { state: "ready", version: event.version };
  }
  if (event.kind === "available") {
    if (current.state === "ready" && current.version === event.version) {
      return current;
    }
    return { state: "downloading", version: event.version };
  }
  return current.state === "ready" ? current : IDLE_UPDATE_STATUS;
}
