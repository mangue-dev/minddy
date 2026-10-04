/** Poll only while the document is visible, with one request at a time. */
export function startVisiblePoll(
  read: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AbortController | undefined;
  let resumePending = false;
  const isVisible = () => document.visibilityState !== "hidden";

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const poll = async () => {
    if (stopped || !isVisible() || pending) return;
    clearTimer();
    const controller = new AbortController();
    const startedAt = Date.now();
    pending = controller;
    resumePending = false;
    try {
      await read(controller.signal);
    } catch {
      // Cancellation and transient failures retry on the next visible read.
    } finally {
      pending = undefined;
      if (!stopped && isVisible()) {
        if (resumePending) void poll();
        else timer = setTimeout(() => void poll(), Math.max(0, intervalMs - (Date.now() - startedAt)));
      }
    }
  };
  const onVisibility = () => {
    clearTimer();
    if (!isVisible()) {
      resumePending = false;
      pending?.abort();
    } else if (pending) {
      // Wait for the cancelled read to settle before catching up.
      resumePending = true;
    } else {
      void poll();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  void poll();
  return () => {
    stopped = true;
    clearTimer();
    document.removeEventListener("visibilitychange", onVisibility);
    pending?.abort();
  };
}
