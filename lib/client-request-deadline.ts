/** Optional wall-clock deadline with caller cancellation and listener cleanup. */
export async function withClientRequestDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number | null,
  callerSignal?: AbortSignal | null,
): Promise<T> {
  const controller = new AbortController();
  // Explicit forwarding also works in browsers without AbortSignal.any.
  const signal = controller.signal;
  const forwardAbort = () => controller.abort(callerSignal!.reason);
  if (callerSignal?.aborted) forwardAbort();
  else callerSignal?.addEventListener("abort", forwardAbort, { once: true });
  let reject!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, fail) => { reject = fail; });
  const onAbort = () => reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = timeoutMs === null ? undefined : setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);
  try {
    signal.throwIfAborted();
    return await Promise.race([work(signal), aborted]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}
