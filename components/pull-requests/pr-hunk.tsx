"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from "mangue-ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import type { FileDiff as FileDiffInstance, PostRenderPhase } from "@pierre/diffs";
import { PrDiffWorkers } from "@/components/pull-requests/pr-diff-workers";
import { DIFF_LINE_DIFF_TYPE, DIFF_THEMES, DIFF_UNSAFE_CSS } from "@/lib/diff-theme";
import { useEffectiveColorScheme } from "@/components/pull-requests/use-effective-color-scheme";
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
  startLine,
  side,
  outdated = false,
  resolved = false,
  maxLines,
  className,
  headerClassName,
}: {
  /** Path of the commented file — it carries the anchor AND decides the grammar. */
  path: string;
  /** The fragment of the forge. GitLab does not serve any of them: the header remains alone. */
  diffHunk?: string | null;
  /** Aimed line, when you know it — it completes the anchor of the header. */
  line?: number | null;
  /** First line for a multi-line comment. */
  startLine?: number | null;
  /** Side used to find the selected range inside the unified hunk. */
  side?: "LEFT" | "RIGHT";
  /** Whether the forge says the referenced code is no longer current. */
  outdated?: boolean;
  /** Whether the review conversation has already been resolved. */
  resolved?: boolean;
  /** Number of lines kept (the last ones). `0` = the whole hunk. */
  maxLines?: number;
  className?: string;
  /** Optional density override for the file/line accordion header. */
  headerClassName?: string;
}) {
  const t = useTranslations("PullRequests");
  const resolvedTheme = useEffectiveColorScheme();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  /**
   * The fragment, analyzed once. `null` when there is no hunk, or when the
   * lib does not recognize a file there — the header then alone holds the information,
   * as before, rather than displaying an empty box.
   */
  const fileDiff = useMemo(() => {
    const patch = hunkPatch(
      path,
      diffHunk ?? "",
      maxLines,
      startLine != null && line != null && startLine < line
        ? { startLine, endLine: line, side: side ?? "RIGHT" }
        : undefined,
    );
    if (!patch) return null;
    const [parsed] = parsePatchFiles(patch);
    return parsed?.files[0] ?? null;
  }, [path, diffHunk, line, startLine, side, maxLines]);

  /** Keep the embedded diff's Shadow DOM reusable across Strict Mode remounts. */
  const onPostRender = useCallback(
    (node: HTMLElement, _instance: FileDiffInstance, phase: PostRenderPhase) => {
      node.style.colorScheme = resolvedTheme;
      if (phase === "unmount") node.shadowRoot?.replaceChildren();
    },
    [resolvedTheme],
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
      unsafeCSS: DIFF_UNSAFE_CSS,
      onPostRender,
    }),
    [resolvedTheme, isMobile, onPostRender],
  );

  // The folder is deleted, the file name is — the share of `pr-diff`.
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);

  // The path is painted in two pieces so a long directory can fade while the
  // filename remains prominent. The line range has its own row below, like on
  // GitHub, instead of being compressed into `path:lastLine`.
  const anchor = (
    <span className="min-w-0 flex-1 truncate font-mono text-xs">
      <span className="text-muted-foreground">{dir}</span>
      <span className="font-medium text-foreground">{name}</span>
    </span>
  );
  const title =
    line != null
      ? startLine != null && startLine < line
        ? t("staleRangeAnchor", { path, start: startLine, end: line })
        : t("staleAnchor", { path, line })
      : path;
  const lineLabel =
    line == null
      ? null
      : startLine != null && startLine < line
        ? t("lineAnchorRange", { start: startLine, end: line })
        : t("lineAnchor", { line });
  const statusBadge = resolved ? (
    <Badge
      variant="secondary"
      data-testid="pr-hunk-resolved"
      data-diff-nonselectable
      className="mr-2.5 shrink-0 cursor-default select-none border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
    >
      {t("resolvedComment")}
    </Badge>
  ) : outdated ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          data-testid="pr-hunk-outdated"
          data-diff-nonselectable
          tabIndex={0}
          className="mr-2.5 shrink-0 cursor-default select-none border-amber-500/50 bg-amber-500/10 text-amber-700 outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-300"
        >
          {t("outdatedComment")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">
        {t("outdatedCommentTooltip")}
      </TooltipContent>
    </Tooltip>
  ) : null;

  // Without an extract (GitLab does not serve any), the header has nothing left to fold:
  // it becomes an anchor line again, without chevron or gesture. A button that doesn't
  // nothing is worse than a label.
  if (!fileDiff) {
    return (
      <div className={className}>
        <div
          data-testid="pr-hunk-header"
          className={cn("flex items-center px-2.5 py-1.5", headerClassName)}
          title={title}
        >
          {anchor}
          {statusBadge}
        </div>
        {lineLabel ? (
          <div
            data-testid="pr-hunk-line-label"
            className="px-2.5 pb-1.5 font-mono text-[11px] text-muted-foreground"
          >
            {lineLabel}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("pr-diff-view diff-selectable overflow-clip", className)}>
      <div
        data-testid="pr-hunk-header"
        className={cn(
          "flex w-full items-center transition-colors hover:bg-muted/60",
          collapsed ? null : "border-b border-border",
          headerClassName,
        )}
      >
        <button
          data-testid="pr-hunk-toggle"
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          title={title}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5 text-left outline-none"
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          {anchor}
        </button>
        {statusBadge}
      </div>
      {collapsed ? null : (
        <>
          {lineLabel ? (
            <div
              data-testid="pr-hunk-line-label"
              className="px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
            >
              {lineLabel}
            </div>
          ) : null}
          <PrDiffWorkers>
            <FileDiff fileDiff={fileDiff} options={options} />
          </PrDiffWorkers>
        </>
      )}
    </div>
  );
}
