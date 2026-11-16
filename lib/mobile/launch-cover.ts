/**
 * The launch handshake of the native mobile app (MIN-1006).
 *
 * The shell covers the WebView with the launch screen until the first page
 * has loaded. The signed-in app keeps building itself after that load: the
 * session, the first reads, then Home's greeting and Numo's word. Lifted at
 * the load, the cover showed those steps one by one. A page that declares
 * `LAUNCH_COVER_META` (`lib/mobile/bridge.ts`) asks the shell to keep the cover until the page
 * reports, through `MinddyShell.contentShown`, that its first content is on
 * screen; the shell then crossfades into the finished page. The shell stops
 * waiting on its own after a short limit, so a slow read never keeps the app
 * on its launch screen, and a page without the meta (sign-in, an older
 * server) lifts it at the load as before.
 *
 * "First content" is `lib/first-content.ts`: the startup reads have settled
 * and no loading content is left, which includes Home's intro until it is
 * revealed (`data-pending-content`). A page that knows its content is
 * complete earlier says so with {@link markPageContentShown}: Home, once
 * revealed, does not wait for the shell's other startup reads.
 */
import { onFirstContent } from "@/lib/first-content";
import { getMobileBridge } from "@/lib/mobile/bridge";

let released = false;
let pageShown = false;
const pageShownListeners = new Set<() => void>();

/**
 * The page on screen shows its complete content, before the app's other
 * startup reads have settled: the launch cover may lift now.
 */
export function markPageContentShown(): void {
  if (pageShown) return;
  pageShown = true;
  // Each listener removes itself as it runs: iterate a detached set.
  const pending = new Set(pageShownListeners);
  pageShownListeners.clear();
  for (const listener of pending) listener();
}

/** Run `listener` once the first content is reached or the page says it is shown. */
function onContentShown(listener: () => void): () => void {
  let done = false;
  let stopFirst = () => {};
  const stop = () => {
    done = true;
    stopFirst();
    pageShownListeners.delete(run);
  };
  function run() {
    if (done) return;
    stop();
    listener();
  }
  if (pageShown) {
    run();
    return stop;
  }
  pageShownListeners.add(run);
  // Runs at once when the first content is already reached.
  stopFirst = onFirstContent(run);
  if (done) stopFirst();
  return stop;
}

/**
 * Tells the shell, once, that the first content is painted: the first
 * content is reached (or the page marked itself shown), then two frames have passed, so the cover lifts over
 * the page as it will stay and not over its last loading frame. Does nothing
 * in a browser, the desktop app or a shell without `contentShown`. Returns a
 * cancel function.
 */
export function releaseLaunchCoverOnFirstContent(
  frame: (callback: () => void) => number = (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
): () => void {
  const shell = getMobileBridge()?.shell;
  if (released || !shell?.contentShown) return () => {};
  let handle: number | null = null;
  const stop = onContentShown(() => {
    handle = frame(() => {
      handle = frame(() => {
        handle = null;
        if (released) return;
        released = true;
        void shell.contentShown?.().catch(() => {});
      });
    });
  });
  return () => {
    stop();
    if (handle !== null) cancelFrame(handle);
  };
}

/** Tests only. */
export function resetLaunchCoverForTests(): void {
  released = false;
  pageShown = false;
  pageShownListeners.clear();
}
