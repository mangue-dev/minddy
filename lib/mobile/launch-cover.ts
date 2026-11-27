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
 * revealed with everything it shows, does not wait for the shell's other
 * startup reads.
 *
 * The app's own chrome counts too: the bottom bar is drawn by the shell, a
 * few frames after the page asks for it. {@link holdLaunchCover} keeps the
 * cover for it, for at most {@link LAUNCH_HOLD_MAX_MS} once the content is
 * there, so the page does not appear without its bar.
 */
import { onFirstContent } from "@/lib/first-content";
import { getMobileBridge } from "@/lib/mobile/bridge";

/** The longest the cover waits, once the content is shown, for what holds it. */
export const LAUNCH_HOLD_MAX_MS = 1_000;

let released = false;
let pageShown = false;
const pageShownListeners = new Set<() => void>();
const holds = new Set<symbol>();
const holdListeners = new Set<() => void>();

/**
 * Keeps the launch cover until the returned function is called: part of what
 * the app shows at launch is still being drawn. Bounded by
 * {@link LAUNCH_HOLD_MAX_MS}; releasing twice, or after the cover has
 * lifted, does nothing.
 */
export function holdLaunchCover(): () => void {
  if (released) return () => {};
  const hold = Symbol("launch-cover-hold");
  holds.add(hold);
  return () => {
    if (!holds.delete(hold) || holds.size > 0) return;
    const pending = new Set(holdListeners);
    holdListeners.clear();
    for (const listener of pending) listener();
  };
}

/** Run `listener` once nothing holds the cover, or after the limit. */
function onHoldsReleased(listener: () => void): () => void {
  if (holds.size === 0) {
    listener();
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(timer);
    holdListeners.delete(run);
    listener();
  };
  holdListeners.add(run);
  timer = setTimeout(run, LAUNCH_HOLD_MAX_MS);
  return () => {
    clearTimeout(timer);
    holdListeners.delete(run);
  };
}

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
 * content is reached (or the page marked itself shown), nothing holds the
 * cover any more, then two frames have passed, so the cover lifts over
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
  let stopHolds = () => {};
  const stop = onContentShown(() => {
    stopHolds = onHoldsReleased(() => {
      handle = frame(() => {
        handle = frame(() => {
          handle = null;
          if (released) return;
          released = true;
          holds.clear();
          void shell.contentShown?.().catch(() => {});
        });
      });
    });
  });
  return () => {
    stop();
    stopHolds();
    if (handle !== null) cancelFrame(handle);
  };
}

/** Tests only. */
export function resetLaunchCoverForTests(): void {
  released = false;
  pageShown = false;
  pageShownListeners.clear();
  holds.clear();
  holdListeners.clear();
}
