/**
 * Keeps the screen on until the returned function runs, through the Screen
 * Wake Lock API. A phone that dims and locks mid-dictation suspends the page
 * and ends the take, so the recorder holds one while it listens.
 *
 * The browser drops the lock whenever the page is hidden (another tab, the
 * app in the background), so it is requested again each time the page shows.
 * Where the API is missing (older WebViews) or refuses (low battery mode,
 * a policy), nothing happens: the screen simply follows its own timeout.
 */
export function holdScreenWakeLock(doc: Document = document): () => void {
  const wakeLock = typeof navigator === "undefined" ? undefined : navigator.wakeLock;
  if (!wakeLock) return () => {};

  let sentinel: WakeLockSentinel | null = null;
  let released = false;

  const request = async () => {
    if (released || sentinel || doc.visibilityState !== "visible") return;
    try {
      const lock = await wakeLock.request("screen");
      if (released) {
        void lock.release().catch(() => {});
        return;
      }
      sentinel = lock;
      lock.addEventListener("release", () => {
        if (sentinel === lock) sentinel = null;
      });
    } catch {
      // Refused (battery saver, hidden page, policy): best effort only.
    }
  };

  const onVisibility = () => void request();
  doc.addEventListener("visibilitychange", onVisibility);
  void request();

  return () => {
    if (released) return;
    released = true;
    doc.removeEventListener("visibilitychange", onVisibility);
    const lock = sentinel;
    sentinel = null;
    void lock?.release().catch(() => {});
  };
}
