"use client";

/**
 * The desktop app trace (MIN-307) — **off by default**.
 *
 * The bumps felt in the shell do not reproduce on demand:
 * the time to open DevTools and press Save is over. A
 * profiling session will therefore never find them. You need the opposite — an instrumentation that runs constantly, keeps a ROTATING trace of the last {@link TRACE_WINDOW_MS}, and freezes on command. The gesture becomes
 * “I just saw it, dump”.
 *
 * **Starting**: `localStorage.setItem("minddy.trace", "1")`, then reloading.
 * **Dumping**: ⌥⇧T copies the current window to the clipboard (the
 * permission `clipboard-sanitized-write` is already granted by the shell).
 * Nothing to redeploy, nothing that runs on others.
 *
 * ## What the probe picks up, and why each source is there
 *
 * - **`longtask`** — frames lost, measured rather than felt.
 * - **`event`** with `durationThreshold: 16` — a `pointerdown` whose
 * `processingStart` arrives 100 ms after the gesture called a frame lost BEFORE
 * logic; a `pointerdown` which **never** appears says that macOS has swallowed it
 * (sliding region).
 * - **floating surfaces**, and this is the delicate point: we observe
 * `data-state` with **`attributeOldValue`**, not just `childList`. Radix's
 * `Presence` keeps the node UP during the ~100 ms of its exit animation
 *: closing followed by reopening in this window does not
 * produce neither insertion nor deletion. A single `childList` observer would
 * remain silent all day on exactly the fault being sought. The two are
 * complementary, not substitutable.
 * - **`visibilitychange`** with the duration of absence — this is the condition for
 * triggering invalidation waves (lib/realtime-resume.ts).
 * - **two points of call of a line**, placed by hand: at the top of `catchUp`
 * (lib/realtime-provider.tsx) and at both ends of the window button bridge
 * (lib/use-window-buttons.ts).
 *
 * ## How to read a dump
 *
 * - `open→closed→open` on the same `slot` within 100 ms = a status toggle
 *, not an unmount.
 * - `popper −` then `popper +` **without** `state` line in between = an
 * actual teardown.
 * - a `catchUp` line followed by a `longtask` = the invalidation wave, and the
 * field `cache` tells how many queries were searched.
 */

import { getDesktopBridge } from "./bridge";

/** The key that turns on the trace. Absent or different from "1" → nothing turns. */
export const TRACE_FLAG = "minddy.trace";

/** What the spinning buffer keeps. Beyond that, the oldest lines come out. */
export const TRACE_WINDOW_MS = 90_000;

/** Memory guardrail: a burst of mutations must not swell endlessly. */
export const TRACE_MAX_ENTRIES = 4_000;

export interface TraceEntry {
  /** Milliseconds since document loaded (`performance.now()`). */
  t: number;
  kind: string;
  detail?: Record<string, unknown>;
}

export interface TraceRing {
  push(entry: TraceEntry): void;
  /** The lines still in the window, the oldest first. */
  entries(now: number): TraceEntry[];
  /** The readable dump, timestamped in seconds relative to the oldest line. */
  format(now: number): string;
}

/**
 * The rotating buffer, PUR — two terminals, the duration and the number.
 *
 * Separated from the probe installation to be testable: vitest runs on
 * bare node, without `PerformanceObserver` nor DOM.
 */
export function createTraceRing(
  windowMs: number = TRACE_WINDOW_MS,
  maxEntries: number = TRACE_MAX_ENTRIES
): TraceRing {
  let buffer: TraceEntry[] = [];

  const prune = (now: number) => {
    const floor = now - windowMs;
    let first = 0;
    while (first < buffer.length && buffer[first].t < floor) first += 1;
    if (first > 0) buffer = buffer.slice(first);
    if (buffer.length > maxEntries) {
      buffer = buffer.slice(buffer.length - maxEntries);
    }
  };

  return {
    push(entry) {
      buffer.push(entry);
      prune(entry.t);
    },
    entries(now) {
      prune(now);
      return buffer.slice();
    },
    format(now) {
      const rows = this.entries(now);
      if (rows.length === 0) return "(trace vide)";
      const origin = rows[0].t;
      return rows
        .map((row) => {
          const at = ((row.t - origin) / 1000).toFixed(3).padStart(8, " ");
          const detail = row.detail
            ? " " +
              Object.entries(row.detail)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(" ")
            : "";
          return `${at}s ${row.kind}${detail}`;
        })
        .join("\n");
    },
  };
}

/** The live buffer, or `null` when the trace is turned off. */
let ring: TraceRing | null = null;

/**
 * A trace line. **No-op when the trace is off** — this is what allows
 * to sow them in hot spots without thinking about it: a nullity test per call.
 */
export function trace(kind: string, detail?: Record<string, unknown>): void {
  if (!ring) return;
  ring.push({ t: performance.now(), kind, detail });
}

/** Does the trace rotate? (to avoid CALCULATE an expensive detail for nothing) */
export function isTracing(): boolean {
  return ring !== null;
}

/** The current dump, or a line that says nothing is working. */
export function dumpTrace(): string {
  if (!ring) return "(trace éteinte — localStorage.minddy.trace = \"1\" puis recharger)";
  return ring.format(performance.now());
}

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(TRACE_FLAG) === "1";
  } catch {
    // Private browsing, quota: the trace is not a reason to break the app.
    return false;
  }
}

/**
 * Installs probes. Returns its uninstaller.
 *
 * Does nothing outside the desktop app, nor without the flag: the two guards,
 * because the trace is a tool of the SHELL and we don't want an additional observer in a browser, even when turned off.
 */
export function startDesktopTrace(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!getDesktopBridge() || !readFlag()) return () => {};

  ring = createTraceRing();
  const cleanups: (() => void)[] = [];

  trace("trace:start", { ua: navigator.userAgent });

  // `durationThreshold` is an option to `event` that DOM types do not
  // not yet describe; it is well read by Chromium. Hence the enlargement
  // here rather than a `as any` at the call point.
  type ObserveOptions = PerformanceObserverInit & {
    durationThreshold?: number;
  };

  const observe = (type: string, options: ObserveOptions) => {
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const timing = entry as PerformanceEntry & {
            processingStart?: number;
            interactionId?: number;
          };
          trace(type, {
            name: entry.name,
            ms: Math.round(entry.duration),
            ...(timing.processingStart != null
              ? { lag: Math.round(timing.processingStart - entry.startTime) }
              : {}),
          });
        }
      });
      po.observe(options);
      cleanups.push(() => po.disconnect());
    } catch {
      // Input type not supported: we do without this source, not the rest.
    }
  };

  observe("longtask", { type: "longtask", buffered: true });
  observe("event", { type: "event", durationThreshold: 16, buffered: true });

  // Floating surfaces. `attributeOldValue` is what distinguishes a
  // TOGGLE state of unmount — see file header.
  const surfaces = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        const el = record.target as Element;
        trace("state", {
          slot: el.getAttribute("data-slot") ?? el.tagName.toLowerCase(),
          from: record.oldValue ?? "?",
          to: el.getAttribute("data-state") ?? "?",
        });
        continue;
      }
      for (const node of record.addedNodes) {
        if (node instanceof Element && node.hasAttribute("data-radix-popper-content-wrapper")) {
          trace("popper", { op: "+" });
        }
      }
      for (const node of record.removedNodes) {
        if (node instanceof Element && node.hasAttribute("data-radix-popper-content-wrapper")) {
          trace("popper", { op: "−" });
        }
      }
    }
  });
  surfaces.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["data-state"],
  });
  cleanups.push(() => surfaces.disconnect());

  // Resumption: it is the duration of absence which decides whether the caches are caught up.
  let hiddenSince: number | null = null;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      hiddenSince = performance.now();
      trace("hidden");
      return;
    }
    const ms = hiddenSince === null ? 0 : Math.round(performance.now() - hiddenSince);
    hiddenSince = null;
    trace("visible", { hiddenMs: ms });
  };
  document.addEventListener("visibilitychange", onVisibility);
  cleanups.push(() =>
    document.removeEventListener("visibilitychange", onVisibility)
  );

  // ⌥⇧T: the current window goes to the clipboard.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.altKey || !e.shiftKey || e.code !== "KeyT") return;
    e.preventDefault();
    void navigator.clipboard.writeText(dumpTrace());
    trace("trace:dump");
  };
  window.addEventListener("keydown", onKeyDown);
  cleanups.push(() => window.removeEventListener("keydown", onKeyDown));

  return () => {
    for (const off of cleanups) off();
    ring = null;
  };
}
