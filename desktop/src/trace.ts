/**
 * The MAIN process trace (MIN-307) — **off by default**.
 *
 * The counterpart of lib/desktop/trace.ts, on the shell side. It exists because the
 * page cannot see what is happening here: it ignores when the window is
 * hidden rather than closed, when macOS puts it to sleep, and what `applyWindowButtons`
 * actually posed on her. But this is exactly where the events live
 * which separate the shell from the browser.
 *
 * **Power on**: `MINDDY_TRACE=1` in the process environment. The lines
 * go to standard output — in development `npm --prefix desktop run
 * dev`, in binary signed system logs.
 *
 * What is instrumented, and why:
 *
 * - `applyWindowButtons` / `publishWindowButtons` — the two halves of the bridge seen
 * from here. A request for the page without publication in return, or vice versa, is
 * reads in one line;
 * - `did-start-loading` — the reset which follows a full load, that
 * which left the lights absent (MIN-304);
 * - `show` / `hide` / `blur` — ⌘W and the red light HIDE the window instead of
 * destroy it, so the same document lives dozens of cycles per day;
 * - `powerMonitor` on `suspend` / `resume` / `lock-screen` — the most common cause
 * frequent socket outages, and the page knows nothing about it: it does not see
 * than the `visibilitychange` which follows, when it follows.
 */

/** Does the track turn? Read once, when the module loads. */
export const TRACING = process.env.MINDDY_TRACE === "1";

/**
 * A trace line. **No-op when the trace is off** — this is what allows
 * to seed them at hot spots without thinking about it.
 *
 * The detail is passed as an object and not formatted by the caller: a `trace()`
 * off should not cost anything, not even a concatenation.
 */
export function trace(kind: string, detail?: Record<string, unknown>): void {
  if (!TRACING) return;
  const at = (process.uptime() * 1000).toFixed(0).padStart(8, " ");
  const tail = detail
    ? " " +
      Object.entries(detail)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" ")
    : "";
  console.log(`[minddy:trace] ${at}ms ${kind}${tail}`);
}
