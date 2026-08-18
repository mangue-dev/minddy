"use client";

import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { ReactNode } from "react";
import { DIFF_LINE_DIFF_TYPE, DIFF_THEMES } from "@/lib/diff-theme";

/**
 * The pool of workers that colors the diffs (MIN-181).
 *
 * This is what replaces the line ceiling from before: the coloring is no longer done
 * in the rendering, nor even on the main thread — a lockfile of 20,000
 * lines no longer freezes the tab, it arrives colored a little later.
 *
 * **Two workers**, not the default eight: a PR view colors a few
 * files at a time, and each worker loads its own copy of Shiki. The pool
 * is a lib-side module singleton, mounted and unmounted with the view.
 *
 * ⚠️ The pool slices for everyone. Checked in `DiffHunksRenderer`: as soon as
 * a pool is present, ITS rendering options (theme, style of
 * marking, max line length) take precedence over those of each
 * component. The pair of themes and the marking style therefore live in
 * `lib/diff-theme` and are passed IN BOTH places — it's the same setting, it
 * has only one source.
 *
 * The light/dark choice remains per component (`themeType`): the pool
 * colors with BOTH themes at once, and it is the `color-scheme` of the
 * Shadow DOM which decides which one is displayed.
 */
export function PrDiffWorkers({ children }: { children: ReactNode }) {
  return (
    <WorkerPoolContextProvider
      poolOptions={{
        poolSize: 2,
        // The **portable** variant, and not `worker/worker.js`: checked on the
        // build of this repository, Turbopack processes `new URL(…, import.meta.url)`
        // like an ASSET — it copies the file as is into `static/media`
        // without passing it through the packager. `worker.js` would achieve this with its
        // `import … from "shiki/core"` intact, which the browser does not know
        // resolve: the worker would die on loading. `worker-portable.js` is
        // already autonomous, so it survives copying.
        workerFactory: () =>
          new Worker(new URL("@pierre/diffs/worker/worker-portable.js", import.meta.url), {
            type: "module",
          }),
      }}
      highlighterOptions={{
        theme: DIFF_THEMES,
        lineDiffType: DIFF_LINE_DIFF_TYPE,
        // The JS engine, not WebAssembly: the only `import()` variant
        // portable keeps pointing the `.wasm` in RELATIVE, and it would not survive
        // copy it back to active. Said here rather than left at default, so that the
        // dependency between the two choices is written somewhere.
        preferredHighlighter: "shiki-js",
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  );
}
