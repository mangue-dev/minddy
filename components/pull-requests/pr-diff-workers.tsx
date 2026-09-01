"use client";

import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { ReactNode } from "react";
import { DIFF_LINE_DIFF_TYPE, DIFF_THEMES } from "@/lib/diff-theme";
import { useEffectiveColorScheme } from "@/components/pull-requests/use-effective-color-scheme";

/**
 * Two workers keep large diffs off the main thread without loading eight copies
 * of Shiki. The pool renders both themes; each diff host selects the painted one
 * through its forced `color-scheme`. Remounting on a scheme change also prevents
 * cached light-theme worker output from leaking into dark mode.
 */
export function PrDiffWorkers({ children }: { children: ReactNode }) {
  const resolvedTheme = useEffectiveColorScheme();

  return (
    <WorkerPoolContextProvider
      key={resolvedTheme}
      poolOptions={{
        poolSize: 2,
        // Turbopack copies this URL as an asset instead of bundling its imports.
        // The portable worker is self-contained and therefore survives that copy.
        workerFactory: () =>
          new Worker(new URL("@pierre/diffs/worker/worker-portable.js", import.meta.url), {
            type: "module",
          }),
      }}
      highlighterOptions={{
        theme: DIFF_THEMES,
        lineDiffType: DIFF_LINE_DIFF_TYPE,
        tokenizeMaxLineLength: 1_000,
        maxLineDiffLength: 2_000,
        // The JavaScript engine avoids a relative WASM URL that would break after
        // Turbopack moves the portable worker into the static asset directory.
        preferredHighlighter: "shiki-js",
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  );
}
