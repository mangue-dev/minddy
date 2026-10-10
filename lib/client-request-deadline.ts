/** Wall-clock deadline covering session preparation, headers, and response body. */
export async function withClientRequestDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  callerSignal?: AbortSignal | null,
): Promise<T> {
  const controller = new AbortController();
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, controller.signal])
    : controller.signal;
  signal.throwIfAborted();
  let reject!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, fail) => { reject = fail; });
  const onAbort = () => reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);
  try {
    return await Promise.race([work(signal), aborted]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
