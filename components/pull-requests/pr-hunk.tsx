"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, useIsMobile, useTheme } from "mangue-ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import type { FileDiff as FileDiffInstance, PostRenderPhase } from "@pierre/diffs";
import { PrDiffWorkers } from "@/components/pull-requests/pr-diff-workers";
import { DIFF_LINE_DIFF_TYPE, DIFF_THEMES } from "@/lib/diff-theme";
import { hunkPatch } from "@/lib/pr-diff-hunk";

/**
 * The code snippet of a review comment — the `diff_hunk` that the forge
 * book with the note — rendered as the Files tab renders the code: under a
 * collapsible file header, colored by Shiki, in diff mode.
 *
 * It exists because this same extract was found by hand everywhere else:
 * a minivan pad without coloring in the activity thread, a `<pre>` of the hunk
 * BRUT (including `@@` header) in the fallback of expired threads. Three renderings for
 * the same object, two of which did not look like the code view of the page
 * next door — while a line comment talks about exactly the same code.
 *
 * The rendering therefore goes through the diff lib, like `pr-diff`: same themes, same
 * word-for-word marking, same pool of workers. What it requires is to give back to
 * fragments the surrounding file — that's the job of `hunkPatch`.
 *
 * What is NOT taken from the Files tab, and deliberately: the “+” of
 * gutter (we do not comment from an extract - this is the role of the diff, to its
 * line), the unfolding of the context (an extract does not have a file around it
 * load) and the unified ↔ side-by-side toggle (four rows in two columns
 * n'apprennent rien).
 */
export function PrHunk({
  path,
  diffHunk,
  line,
  maxLines,
  className,
}: {
  /** Path of the commented file — it carries the anchor AND decides the grammar. */
  path: string;
  /** The fragment of the forge. GitLab does not serve any of them: the header remains alone. */
  diffHunk?: string | null;
  /** Aimed line, when you know it — it completes the anchor of the header. */
  line?: number | null;
  /** Number of lines kept (the last ones). `0` = the whole hunk. */
  maxLines?: number;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  /**
   * The fragment, analyzed once. `null` when there is no hunk, or when the
   * lib does not recognize a file there — the header then alone holds the information,
   * as before, rather than displaying an empty box.
   */
  const fileDiff = useMemo(() => {
    const patch = hunkPatch(path, diffHunk ?? "", maxLines);
    if (!patch) return null;
    const [parsed] = parsePatchFiles(patch);
    return parsed?.files[0] ?? null;
  }, [path, diffHunk, maxLines]);

  /**
   * The same shadow cleanup as `pr-diff`, and for the same reason: the empty lib
   * its `<pre>` upon disassembly but LEAVES it in the Shadow DOM, where its `hydrate`
   * following takes it for an already painted rendering. In development, `reactStrictMode`
   * goes back to the same node — the extract would be born empty.
   */
  const onPostRender = useCallback(
    (node: HTMLElement, _instance: FileDiffInstance, phase: PostRenderPhase) => {
      if (phase === "unmount") node.shadowRoot?.replaceChildren();
    },
    [],
  );

  const options = useMemo(
    () => ({
      theme: DIFF_THEMES,
      themeType: resolvedTheme,
      diffStyle: "unified" as const,
      // Same rule as the Files tab: we scroll, except on a fairly small screen.
      // narrow so that scrolling never shows an entire line again.
      overflow: isMobile ? ("wrap" as const) : ("scroll" as const),
      // The header is ours — it’s the one that folds.
      disableFileHeader: true,
      // `simple` only places a separator BETWEEN two hunks, and an extract does not have one
      // than one: nothing is displayed. `line-info` would announce “N lines not
      // modified” with the arrow that goes with it, for an unfolding that does not exist
      // here (no `loadDiffFiles`: there is no surrounding file to load).
      hunkSeparators: "simple" as const,
      lineDiffType: DIFF_LINE_DIFF_TYPE,
      onPostRender,
    }),
    [resolvedTheme, isMobile, onPostRender],
  );

  // The folder is deleted, the file name is — the share of `pr-diff`.
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);

  // The anchor, painted in two pieces. The colon is not text to
  // translate: both catalogs write `{path}:{line}`, and it is this
  // this form that we assemble here to be able to blur the file.
  const anchor = (
    <span className="min-w-0 flex-1 truncate font-mono text-xs">
      <span className="text-muted-foreground">{dir}</span>
      <span className="font-medium text-foreground">{name}</span>
      {line != null ? <span className="text-muted-foreground">:{line}</span> : null}
    </span>
  );
  const title = line != null ? t("staleAnchor", { path, line }) : path;

  // Without an extract (GitLab does not serve any), the header has nothing left to fold:
  // it becomes an anchor line again, without chevron or gesture. A button that doesn't
  // nothing is worse than a label.
  if (!fileDiff) {
    return (
      <div className={cn("px-2.5 py-1.5", className)} title={title}>
        {anchor}
      </div>
    );
  }

  return (
    <div className={cn("pr-diff-view overflow-clip", className)}>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        title={title}
        className={cn(
          "flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-muted/60",
          collapsed ? null : "border-b border-border",
        )}
      >
        {collapsed ? (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        {anchor}
      </button>
      {collapsed ? null : (
        <PrDiffWorkers>
          <FileDiff fileDiff={fileDiff} options={options} />
        </PrDiffWorkers>
      )}
    </div>
  );
}
