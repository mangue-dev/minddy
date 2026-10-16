"use client";

import { getFiletypeFromFileName, getThemes, preloadHighlighter, type SupportedLanguages } from "@pierre/diffs";
import { useWorkerPool, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { useEffect, type ReactNode } from "react";
import { DIFF_LINE_DIFF_TYPE, DIFF_THEMES } from "@/lib/diff-theme";
import { useEffectiveColorScheme } from "@/components/pull-requests/use-effective-color-scheme";

/** Bound public grammar preparation without copying PR patches into the pool. */
export function preparedDiffLanguages(paths: readonly string[]): SupportedLanguages[] {
  return [...new Set(paths.map(getFiletypeFromFileName))].slice(0, 5);
}

function InitializeDiffRuntime({ languages }: { languages: SupportedLanguages[] }) {
  const pool = useWorkerPool();
  const identity = languages.join("|");
  useEffect(() => {
    const langs = identity.split("|") as SupportedLanguages[];
    // Both themes and grammars must arrive before foreground requests fill the
    // browser's transport slots. This performs no source-content or forge read.
    void Promise.all([
      preloadHighlighter({ themes: getThemes(DIFF_THEMES), langs, preferredHighlighter: "shiki-js" }),
      pool?.initialize(langs),
    ]).catch(() => {});
  }, [pool, identity]);
  return null;
}

/** Keep the existing two-worker pool owned by the mounted account shell. */
export function PrDiffRuntimePreparation({ languages }: { languages: SupportedLanguages[] }) {
  return <PrDiffWorkers><InitializeDiffRuntime languages={languages} /></PrDiffWorkers>;
}

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
