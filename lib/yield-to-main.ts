/**
 * Hands the main thread back to the browser between two chunks of a long
 * task, so input and paint are not held up until the whole task ends.
 *
 * `scheduler.yield()` resumes ahead of other queued tasks; where it is
 * missing (Safari, Firefox before 142) a zero-delay timeout is the fallback.
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
