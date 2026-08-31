"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Badge, cn, SegmentedControl, toast, useIsMobile, useTheme } from "mangue-ui";
import { ChevronDown, ChevronRight, WrapText } from "lucide-react";
import { applyPatch } from "diff";
import { getLineAnnotationName, parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { PrDiffWorkers } from "@/components/pull-requests/pr-diff-workers";
import type {
  DiffLineAnnotation,
  FileDiff as FileDiffInstance,
  FileDiffContentsLoader,
  FileDiffMetadata,
  DiffLineEventBaseProps,
  PostRenderPhase,
  SelectedLineRange,
} from "@pierre/diffs";
import {
  fetchPrFileSourceApi,
  postPrReviewCommentApi,
  type ApiError,
  type PrEndpoint,
  type PullRequestFile,
  type PullRequestReviewComment,
} from "@/lib/agent-api";
import { noPatchKind } from "@/lib/diff-binary";
import {
  DIFF_LINE_DIFF_TYPE,
  DIFF_RANGE_ATTRIBUTE,
  DIFF_THEMES,
  DIFF_UNSAFE_CSS,
} from "@/lib/diff-theme";
import { PrImageDiff } from "@/components/pull-requests/pr-image-diff";
import { PrFileTreeButton } from "@/components/pull-requests/pr-file-tree";
import {
  DiffCounters,
  DiffStatBar,
  FilePathLabel,
} from "@/components/pull-requests/pr-file-marks";
import {
  fileAnchorId,
  fileStatusOf,
  FILE_STATUS_LABELS,
  type FileStatus,
} from "@/lib/pr-file-tree";
import { groupReviewThreads, type ReviewThreadState } from "@/lib/pr-review-threads";
import type { ReviewCommentReaction } from "@/lib/pr-review-reactions";
import type { RepoProviderId } from "@/lib/repo-providers";
import {
  anchorKey,
  commentAnchor,
  lineKind,
  sharedStartLine,
  threadAnchor,
  toGithubSide,
  type CommentAnchor,
  type DiffSide,
  type PrReviewThread,
} from "@/lib/pr-diff-anchors";
import {
  LineComposer,
  LineWidget,
  ReviewThreadCard,
  StaleThreads,
  useCommentReactions,
  useReviewReplies,
  useThreadResolution,
} from "@/components/pull-requests/pr-review-comments";

/**
 * Diff view of a PR (MIN-66, passed to `@pierre/diffs` in MIN-181): list of
 * collapsible files with +/− counters, unified ↔ side-by-side toggle, and
 * unfolding the hidden context between the hunks GitHub style. Consumed by the
 * detail panel of a PR (pre-detail), the diff panels of a commit and
 * of an agent run.
 *
 * GitHub returns one `patch` per file (a fragment of hunks): we reconstruct a
 * complete unified diff around, then we have it analyzed by the lib. The files
 * binaries/too big arrive without `patch` → fallback “see on GitHub”.
 *
 * What the lib supports, and which lived here before: coloring
 * (Shiki, out of rendering, so no more line ceiling), word-for-word marking
 * retouched lines, unfolding bars, virtualization,
 * multi-line selection. What remains to us: the file map, the anchor
 * review threads, and the two rules of the forge which decide where a
 * comment has the right to go.
 */

/** Number of lines that an arrow expands at once (like GitHub). */
const EXPANSION_LINE_COUNT = 20;

type ViewType = "unified" | "split";

/**
 * What an annotation carries to `renderAnnotation`: the anchor key
 * (which indexes drafts and composers) and threads to stack under the line.
 */
interface AnnotationMeta {
  key: string;
  line: number;
  threads: PrReviewThread[];
}

type ThreadAnnotation = DiffLineAnnotation<AnnotationMeta>;

/** Path that addresses the base version: the old name if the file has been renamed. */
function basePathOf(f: PullRequestFile): string {
  return f.previous_filename ?? f.filename;
}

/** Rebuilt a complete unified diff from GitHub's per-file patch. */
export function toUnifiedDiff(f: PullRequestFile): string {
  if (!f.patch) return "";
  const base = basePathOf(f);
  const oldPath = f.status === "added" ? "/dev/null" : `a/${base}`;
  const newPath = f.status === "removed" ? "/dev/null" : `b/${f.filename}`;
  return `diff --git a/${base} b/${f.filename}\n--- ${oldPath}\n+++ ${newPath}\n${f.patch}\n`;
}

/**
 * What happened to the file, told in color — same shape as badges
 * PR status (`pr-state-badge`): tint at 10%, edge at 20%, never a solid color.
 * And same colors as there, so that green means the same thing of a
 * end to end of page: green added, red removed, purple renamed, blue
 * amended.
 */
const FILE_STATUS_STYLES: Record<FileStatus, string> = {
  added:
    "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/25 dark:bg-green-500/15 dark:text-green-400",
  removed: "border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/15",
  renamed:
    "border-violet-600/20 bg-violet-600/10 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400",
  modified:
    "border-blue-600/20 bg-blue-600/10 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400",
};

function FileStatusBadge({ status }: { status: FileStatus }) {
  const t = useTranslations("PullRequests");
  return (
    <Badge
      variant="secondary"
      className={cn("h-5 shrink-0 px-2 text-[10px]", FILE_STATUS_STYLES[status])}
    >
      {t(FILE_STATUS_LABELS[status])}
    </Badge>
  );
}

/** Set an attribute only if it changes — the pass rotates with each render. */
function setLabel(node: Element, label: string) {
  if (node.getAttribute("aria-label") !== label) node.setAttribute("aria-label", label);
}

/** Range covered by a remark, in the vocabulary of the lib. */
interface CommentRange {
  side: DiffSide;
  start: number;
  end: number;
}

/**
 * Paints the lines that each multi-line note covers.
 *
 * Why in DOM, and not by `selectedLines`: this prop only holds ONE
 * range per file and serves the current gesture (mouse selection), then
 * that a file can carry several range remarks at the same time. The lib
 * offers nothing else — its “decorations” cannot be controlled from
 * the exterior. We therefore pose our own attribute, and its style lives with it
 * in `lib/diff-theme`.
 *
 * Reading the lines follows exactly the rule of the lib: `data-line` carries
 * the number ON THE SIDE of the line (the one that clicking on it would say), and
 * `data-alt-line` the one opposite. Side by side, each column only speaks
 * on his side. In unified, a CONTEXT line is the only one to represent the
 * two: this is the only place where we will read the other issue.
 */
function markCommentRanges(root: ShadowRoot, ranges: CommentRange[]) {
  for (const marked of root.querySelectorAll(`[${DIFF_RANGE_ATTRIBUTE}]`)) {
    marked.removeAttribute(DIFF_RANGE_ATTRIBUTE);
  }
  if (ranges.length === 0) return;

  for (const column of root.querySelectorAll("[data-code]")) {
    const unified = column.hasAttribute("data-unified");
    const columnSide: DiffSide = column.hasAttribute("data-deletions") ? "deletions" : "additions";
    for (const row of column.querySelectorAll("[data-line]")) {
      const type = row.getAttribute("data-line-type");
      const changed = type === "change-addition" || type === "change-deletion";
      const rowSide: DiffSide = changed
        ? type === "change-deletion"
          ? "deletions"
          : "additions"
        : columnSide;

      const covered = ranges.some((range) => {
        const raw =
          rowSide === range.side
            ? row.getAttribute("data-line")
            : unified && !changed
              ? row.getAttribute("data-alt-line")
              : null;
        if (raw == null) return false;
        const line = Number(raw);
        return line >= range.start && line <= range.end;
      });
      if (!covered) continue;

      row.setAttribute(DIFF_RANGE_ATTRIBUTE, "");
      // The line number shares the index of its line, and it alone carries the
      // vertical line which gives the beach its two ends.
      const index = row.getAttribute("data-line-index");
      if (index) {
        column
          .querySelector(`[data-column-number][data-line-index="${index}"]`)
          ?.setAttribute(DIFF_RANGE_ATTRIBUTE, "");
      }
    }
  }
}

/**
 * Puts in French (or English) the unfolding bars, of which the lib writes the
 * labeled in hard text (“12 unmodified lines”, “Expand all”) and whose arrows
 * have no title.
 *
 * Done in DOM rather than props because the lib doesn't offer hooks: all
 * it is rendered in the shadows, and the only declarative way
 * (`hunkSeparators: "custom"`) is already marked `@deprecated`. The pass is
 * idempotent and without regret: she only rewrites what she recognizes, therefore the
 * day when the lib changes its formulation, we will fall back on English rather than
 * on a misinterpretation.
 */
function localizeDiffChrome(
  root: ShadowRoot,
  t: ReturnType<typeof useTranslations<"PullRequests">>,
) {
  for (const node of root.querySelectorAll("[data-unmodified-lines]")) {
    const count = /^\s*(\d+)\b/.exec(node.textContent ?? "")?.[1];
    const label = count ? t("expandGap", { count: Number(count) }) : t("expandRest");
    if (node.textContent !== label) node.textContent = label;
  }
  for (const node of root.querySelectorAll("[data-expand-all-button]")) {
    if (node.textContent !== t("expandAll")) node.textContent = t("expandAll");
  }
  for (const node of root.querySelectorAll("[data-expand-button]")) {
    if (node.hasAttribute("data-expand-up")) setLabel(node, t("expandUp"));
    else if (node.hasAttribute("data-expand-down")) setLabel(node, t("expandDown"));
    else if (node.hasAttribute("data-expand-both")) setLabel(node, t("expandBoth"));
  }
}

/**
 * Remove the final line break. A file that carries one (the normal case)
 * would otherwise give a final ghost line at the end unfolding.
 */
function trimTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content.slice(0, -1) : content;
}

/**
 * A PR file: collapsible header + diff. Component apart because everything
 * the state (composers open, drafts, anchors actually rendered) is PAR
 * file — impossible to fit in parent's `files.map`.
 */
function PrDiffFile({
  file,
  fileDiff,
  viewType,
  wrap,
  themeType,
  locale,
  endpoint,
  prUrl,
  provider,
  readOnly,
  expandableContext,
  canResolve,
  collapsed,
  onToggle,
  registerCard,
  reviewComments,
  reviewThreads,
  reviewReactions,
  onCommentPosted,
}: {
  file: PullRequestFile;
  /** Diff analyzed from the file, absent when there is no patch (binary, image, etc.). */
  fileDiff?: FileDiffMetadata;
  viewType: ViewType;
  /** Fold lines that are too long rather than scrolling horizontally. */
  wrap: boolean;
  /** Resolved minddy theme — it forces the `light-dark()` branch of the lib. */
  themeType: "light" | "dark";
  /** Active local — the size of the images is formatted with (KB/MB, separators). */
  locale: string;
  endpoint: PrEndpoint;
  prUrl?: string | null;
  provider?: RepoProviderId;
  /** Read only: neither “+” gutter nor “Reply”. */
  readOnly?: boolean;
  /** Is the basic version rereadable by `endpoint`? Wrong for a difference
      local not pushed: proposing unfolding would then end in 404. */
  expandableContext: boolean;
  /** Resolve a thread, separately: it is a write on the repository (MIN-144). */
  canResolve?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  /** Give the card to the parent, who is the one who knows how to scroll to it. */
  registerCard: (path: string, node: HTMLElement | null) => void;
  /** Review comments for THIS file (already filtered by parent). */
  reviewComments: PullRequestReviewComment[];
  /** Status of the PR wires, ALL files combined: pairing is done by
      root id, not by path — no need to filter it upstream. */
  reviewThreads: ReviewThreadState[];
  /** RA reactions, all files combined: matched by id of
      comment, as children are by root id. */
  reviewReactions: ReviewCommentReaction[];
  onCommentPosted: () => unknown;
}) {
  const t = useTranslations("PullRequests");

  const setCardRef = useCallback(
    (node: HTMLDivElement | null) => registerCard(file.filename, node),
    [registerCard, file.filename],
  );

  // Drafts indexed by anchor key: a failed submission KEEPS its text, and
  // opening a second composer does not destroy the first. They are only emptied
  // success or explicit cancellation.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openAnchors, setOpenAnchors] = useState<Record<string, CommentAnchor>>({});
  const [postingKey, setPostingKey] = useState<string | null>(null);

  /**
   * Anchors whose lib actually rendered the line. Reported AFTER each rendering
   * (`onPostRender`), and not deducted from hunks: this is the only measurement that follows
   * unfolding, the state of which lives in the lib. A thread that is not there folds
   * in the “outdated”, and returns to its place as soon as the surrounding context is
   * unfolded — the property that was previously guaranteed by hand.
   */
  const [placedKeys, setPlacedKeys] = useState<ReadonlySet<string>>(EMPTY_KEYS);
  const instanceRef = useRef<FileDiffInstance<AnnotationMeta> | null>(null);

  const replies = useReviewReplies(endpoint, onCommentPosted);
  const resolution = useThreadResolution(endpoint, onCommentPosted);
  const reactions = useCommentReactions(endpoint, onCommentPosted, reviewReactions, !readOnly);

  const threads = useMemo(
    () => groupReviewThreads(reviewComments, reviewThreads),
    [reviewComments, reviewThreads],
  );

  /**
   * An annotation per targeted line: the wires of this line, plus an entry
   * empty for an open composer where there are no wires yet. The lib place
   * each under its line, or not at all if the line is not rendered.
   */
  const lineAnnotations = useMemo(() => {
    const byKey = new Map<string, ThreadAnnotation>();
    const ensure = (side: ThreadAnnotation["side"], line: number): ThreadAnnotation => {
      const key = anchorKey({ side, line });
      const existing = byKey.get(key);
      if (existing) return existing;
      const created: ThreadAnnotation = {
        side,
        lineNumber: line,
        metadata: { key, line, threads: [] },
      };
      byKey.set(key, created);
      return created;
    };
    for (const thread of threads) {
      const anchor = threadAnchor(thread);
      if (!anchor) continue;
      ensure(anchor.side, anchor.line).metadata.threads.push(thread);
    }
    for (const anchor of Object.values(openAnchors)) ensure(anchor.side, anchor.line);
    return [...byKey.values()];
  }, [threads, openAnchors]);

  /**
   * The areas to paint: one per multi-line remark. Without them, a
   * comment placed on ten lines reads like a comment on the last
   * — the title says so, but you have to read it to see it.
   */
  const commentRanges = useMemo(() => {
    const ranges: CommentRange[] = [];
    for (const thread of threads) {
      const anchor = threadAnchor(thread);
      const start = thread.root.start_line;
      // `line` is the LAST line of the range: a “range” that does not
      // would not rise above is not one of them.
      if (!anchor || start == null || start >= anchor.line) continue;
      ranges.push({ side: anchor.side, start, end: anchor.line });
    }
    return ranges;
  }, [threads]);

  /** Wires that don't anchor anywhere in the rendered diff — folded at the bottom. */
  const staleThreads = useMemo(() => {
    return threads.filter((thread) => {
      const anchor = threadAnchor(thread);
      return !anchor || !placedKeys.has(anchorKey(anchor));
    });
  }, [threads, placedKeys]);

  const closeComposer = useCallback((key: string) => {
    setOpenAnchors(({ [key]: _closed, ...rest }) => rest);
    setDrafts(({ [key]: _cleared, ...rest }) => rest);
    // The range remains highlighted as long as the composer is open; she turns off
    // with it, like on GitHub.
    instanceRef.current?.setSelectedLines(null);
  }, []);

  const submitComment = useCallback(
    async (key: string) => {
      const anchor = openAnchors[key];
      const body = (drafts[key] ?? "").trim();
      if (!anchor || !body || postingKey) return;
      setPostingKey(key);
      try {
        await postPrReviewCommentApi(endpoint, {
          body,
          // A review comment addresses the CURRENT path of the file, even
          // renamed (unlike unfold, which reads the base version).
          path: file.filename,
          line: anchor.line,
          side: toGithubSide(anchor.side),
          ...(anchor.startLine != null
            ? {
                startLine: anchor.startLine,
                startSide: toGithubSide(anchor.startSide ?? anchor.side),
              }
            : {}),
        });
        // Closed (and draft emptied) on SUCCESS only: on failure compose it
        // remains open with the text.
        closeComposer(key);
        await onCommentPosted();
      } catch (err) {
        const apiErr = err as ApiError;
        toast.error(apiErr.code === "lineNotInDiff" ? t("lineNotInDiffError") : apiErr.message);
      } finally {
        setPostingKey(null);
      }
    },
    [openAnchors, drafts, postingKey, endpoint, file.filename, closeComposer, onCommentPosted, t],
  );

  /**
   * Load both versions of the file so that the lib can unfold the
   * hidden context. Called at the FIRST unfolding of this file: open a PR
   * of thirty files without unfolding anything does not trigger any calls.
   *
   * The server only serves the BASE version — that's all the unfolding has.
   * need left side, and the head version is deduced exactly in him
   * applying the patch. A second route (and a second round trip) for a
   * text we could reconstruct was not justified.
   */
  const loadDiffFiles = useCallback<FileDiffContentsLoader>(
    async (meta) => {
      try {
        const { content } = await fetchPrFileSourceApi(endpoint, basePathOf(file));
        const oldContents = trimTrailingNewline(content);
        const patched = applyPatch(oldContents, toUnifiedDiff(file));
        if (patched === false) {
          // The base moved beneath us (head pushed back between sight opening
          // and the click): without both versions, the lib cannot unfold anything.
          throw new Error("Patch does not apply to the base revision");
        }
        return {
          oldFile: { name: basePathOf(file), contents: oldContents },
          newFile: { name: meta.name, contents: trimTrailingNewline(patched) },
        };
      } catch (err) {
        // The lib swallows the failure (it logs it and leaves the diff in place):
        // without this word, clicking on the unfold bar would simply
        // nothing, and nothing would say why. The bar remains re-clickable.
        toast.error(t("expandFailed"));
        throw err;
      }
    },
    [endpoint, file, t],
  );

  /**
   * An added file has no base version, a deleted file has no
   * head version — and in both cases the patch IS already the entire file:
   * there is nothing to unfold. Without a loader, the lib does not offer the affordance,
   * rather than proposing an unfolding which would end in 404.
   */
  const expandable =
    expandableContext && file.status !== "added" && file.status !== "removed";

  /**
   * Opens the composer on the gutter selection. `range` wears the beach
   * complete sliding: it is this which offers the multi-line comment,
   * that the server already knew how to send.
   */
  const onGutterUtilityClick = useCallback(
    (range: SelectedLineRange) => {
      const hunks = fileDiff?.hunks ?? [];
      const anchor = commentAnchor(hunks, range, {
        // GitLab anchors a note on ONE line (`old_line`/`new_line`): him
        // sending a range would silently reduce it to its last point.
        multiLine: provider !== "gitlab",
      });
      if (!anchor) {
        instanceRef.current?.setSelectedLines(null);
        return;
      }
      const key = anchorKey(anchor);
      setOpenAnchors((prev) => (prev[key] ? prev : { ...prev, [key]: anchor }));
    },
    [fileDiff, provider],
  );

  /**
   * Name the “+” of the gutter when hovering over the line.
   *
   * Not in the translation pass above: this button does not exist yet
   * at the time of rendering. The lib makes it DETACHED and only hooks it to a
   * line only when hovering — that is, just before this call. Without title, it
   * only has one icon, so no accessible name.
   */
  const onLineEnter = useCallback(
    ({ numberElement }: DiffLineEventBaseProps) => {
      const button = numberElement.querySelector("[data-utility-button]");
      if (button) setLabel(button, t("addLineComment"));
    },
    [t],
  );

  const renderAnnotation = useCallback(
    (annotation: ThreadAnnotation): ReactNode => {
      const { key, line, threads: list } = annotation.metadata;
      // Not yet placed: these threads are returned to the obsolete fold, and
      // mounting them here in addition would duplicate them (two cards, two states of
      // unfolded, for the same thread). The first rendering necessarily goes through this — the
      // reading has not yet taken place — then `onPostRender` puts everything back in place,
      // before painting.
      if (!placedKeys.has(key)) return null;
      const anchor = openAnchors[key];
      return (
        <LineWidget
          anchor={{
            line,
            // The range of a multi-line remark: the one we are currently making
            // to write, if not that of the threads already there. The sons only give it
            // if they all agree on it — two different ranges under the
            // same number cannot be summed up in a single title, and we fall back
            // then on the anchor line, which is always true.
            startLine: anchor ? anchor.startLine : (sharedStartLine(list) ?? undefined),
            kind: lineKind(fileDiff?.hunks ?? [], annotation.side, line) ?? "context",
          }}
        >
          {list.map((thread) => (
            <ReviewThreadCard
              key={thread.id}
              thread={thread}
              replies={replies}
              resolution={canResolve ? resolution : undefined}
              reactions={reactions}
              readOnly={readOnly}
            />
          ))}
          {anchor ? (
            <LineComposer
              value={drafts[key] ?? ""}
              onChange={(transform) =>
                setDrafts((prev) => ({
                  ...prev,
                  [key]: transform(prev[key] ?? ""),
                }))
              }
              onSubmit={() => void submitComment(key)}
              onCancel={() => closeComposer(key)}
              submitting={postingKey === key}
            />
          ) : null}
        </LineWidget>
      );
    },
    [
      fileDiff,
      placedKeys,
      openAnchors,
      drafts,
      postingKey,
      replies,
      resolution,
      reactions,
      readOnly,
      canResolve,
      submitComment,
      closeComposer,
    ],
  );

  /**
   * After each rendering of the lib (assembly, option change, unfolding):
   * keep control of the instance, translate the unfolding bars, and raise
   * which annotations found their line. The reading can be read in the shadows —
   * one `<slot>` per placed annotation, named as the lib names it — because
   * it is the only thing that tells the truth about the state of unfolding.
   */
  const onPostRender = useCallback(
    (node: HTMLElement, instance: FileDiffInstance<AnnotationMeta>, phase: PostRenderPhase) => {
      if (phase === "unmount") {
        instanceRef.current = null;
        // Make the shadow proper — otherwise the FOLLOWING assembly on the same
        // element thinks it is dealing with pre-rendered HTML.
        //
        // Unmounting the lib empties the `<pre>` but LEAVES it in the Shadow
        // DOM. Its `hydrate` reads this as "the diff is already painted, I didn't
        // to reconnect with it”: he skips the rendering, and we stay on the
        // empty skeleton. In production it is not visible — React throws
        // the element with the component. In development, `reactStrictMode`
        // mounts, disassembles and reassembles ON THE SAME NODE: the diff was born empty,
        // and it was necessary to fold then unfold the file (so two clicks) to
        // obtain a new element which itself could be painted.
        //
        // Adopted style sheets live on `shadowRoot`, not among
        // his children: they survive, and the next rendering reconstructs the
        // rest (sprite, theme, code).
        node.shadowRoot?.replaceChildren();
        return;
      }
      instanceRef.current = instance;
      const root = node.shadowRoot;
      if (!root) return;
      localizeDiffChrome(root, t);
      markCommentRanges(root, commentRanges);
      const placed = new Set<string>();
      for (const annotation of lineAnnotations) {
        const slot = getLineAnnotationName(annotation);
        if (root.querySelector(`slot[name="${slot}"]`)) placed.add(annotation.metadata.key);
      }
      setPlacedKeys((prev) => (sameKeys(prev, placed) ? prev : placed));
    },
    [lineAnnotations, commentRanges, t],
  );

  const options = useMemo(
    () => ({
      theme: DIFF_THEMES,
      themeType,
      diffStyle: viewType,
      // The regime decided above, side by side as well as unified: the lib
      // synchronizes the scrolling of its two panes.
      overflow: wrap ? ("wrap" as const) : ("scroll" as const),
      disableFileHeader: true,
      // The card already has the name of the file and its counters: the separator
      // only has to say what it hides, and offer to unfold it.
      hunkSeparators: "line-info" as const,
      expansionLineCount: EXPANSION_LINE_COUNT,
      // Duplicate assumed with the worker pool, which wins when it colors:
      // it's the main thread's fold, and it should render the same thing.
      lineDiffType: DIFF_LINE_DIFF_TYPE,
      unsafeCSS: DIFF_UNSAFE_CSS,
      loadDiffFiles: expandable ? loadDiffFiles : undefined,
      enableGutterUtility: !readOnly,
      onGutterUtilityClick: readOnly ? undefined : onGutterUtilityClick,
      onLineEnter: readOnly ? undefined : onLineEnter,
      onPostRender,
    }),
    [
      themeType,
      viewType,
      wrap,
      expandable,
      loadDiffFiles,
      readOnly,
      onGutterUtilityClick,
      onLineEnter,
      onPostRender,
    ],
  );

  // A file without a patch: an image we can show, a binary we cannot,
  // file without content change (pure renaming), or text file that the
  // forge deemed it too bulky — four situations that the single message
  // from before was confusing.
  const missing = fileDiff ? null : noPatchKind(file);

  return (
    // `overflow-clip` and not `overflow-hidden`: both cut corners
    // rounded, but `hidden` makes the map a SCROLL CONTAINER, this
    // which neutralizes the `sticky` of the header (it would stick to the edge of the card,
    // i.e. nowhere). `clip` does not scroll, so the header sticks to the
    // real container, that of the host.
    <div
      ref={setCardRef}
      id={fileAnchorId(file.filename)}
      className="overflow-clip rounded-md border border-border"
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          // Sticking to the top edge, everywhere: `top-0` and nothing else. The three
          // hosts have a container that starts under a header (the banner
          // the PR, that of the two sheets), so the file header comes there
          // pose against it — and a shift, however small, would read like a
          // element that floats.
          //
          // Sticky IN ITS CARD: the `sticky` is bounded by its block
          // container, so the header of the next file chases the previous one by
          // arriving. This is the intended behavior, and it's free — especially
          // don't make a single floating header on top of the list.
          "sticky top-0 z-10 flex w-full items-center gap-2 bg-card px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60",
          // The diff has the SAME background as the map (`--diffs-light-bg: var(--card)`):
          // without this trait, the pasted header would float in the middle of the code without
          // let's see where it starts.
          collapsed ? null : "border-b border-border",
        )}
      >
        {collapsed ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
        <FilePathLabel path={file.filename} previousPath={file.previous_filename} />
        <FileStatusBadge status={fileStatusOf(file)} />
        <DiffCounters additions={file.additions} deletions={file.deletions} />
        <DiffStatBar additions={file.additions} deletions={file.deletions} />
      </button>
      {collapsed ? null : (
        <>
          {fileDiff ? (
            <FileDiff<AnnotationMeta>
              fileDiff={fileDiff}
              options={options}
              lineAnnotations={lineAnnotations}
              renderAnnotation={renderAnnotation}
            />
          ) : missing === "image" ? (
            <PrImageDiff file={file} endpoint={endpoint} locale={locale} />
          ) : (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              {missing === "binary"
                ? t("binaryFile")
                : missing === "unchanged"
                  ? t("noContentChange")
                  : t("tooLargeFile")}{" "}
              {/* Nothing to go elsewhere when there is nothing to see. */}
              {prUrl && missing !== "unchanged" ? (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline"
                >
                  {t(provider === "gitlab" ? "viewOnGitlab" : "viewOnGithub")}
                </a>
              ) : null}
            </div>
          )}
          {/* Outside `fileDiff ?`: a binary or oversized file has no
              diff, so NONE of his sons anchor — they all live here
              rather than disappearing with the diff that we don't know how to render. */}
          <StaleThreads
            threads={staleThreads}
            replies={replies}
            resolution={canResolve ? resolution : undefined}
            reactions={reactions}
            readOnly={readOnly}
          />
        </>
      )}
    </div>
  );
}

/** Stable references: `?? []` / `?? () => {}` online would break the memos. */
const NO_COMMENTS: PullRequestReviewComment[] = [];
const NO_THREADS: ReviewThreadState[] = [];
const NO_REACTIONS: ReviewCommentReaction[] = [];
const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();
const noop = () => {};

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

export function PrDiff({
  files,
  endpoint,
  prUrl,
  provider,
  readOnly = false,
  expandableContext = true,
  canResolve = !readOnly,
  reviewComments = NO_COMMENTS,
  reviewThreads = NO_THREADS,
  reviewReactions = NO_REACTIONS,
  onCommentPosted = noop,
  className,
}: {
  files: PullRequestFile[];
  /** Run carrying the diff — is used to load the base version of a file when unfolding. */
  endpoint: PrEndpoint;
  prUrl?: string | null;
  /** Repository provider (“See on…” link vocabulary) — GitHub default. */
  provider?: RepoProviderId;
  /** Read only: no review comments (diff view without PR — the
      agent conversation; the review lives on the Pull requests page). */
  readOnly?: boolean;
  /** Allow lazy loading of context out of hunk. */
  expandableContext?: boolean;
  /** Solve a thread, governed APART (MIN-144): comment request `read` on
      the repository, resolve request `write`. Default `!readOnly` — callers who
      do not know the distinction (agent-diff-sheet) do not change. */
  canResolve?: boolean;
  /** PR review comments, all files combined. */
  reviewComments?: PullRequestReviewComment[];
  /** Thread resolution status (MIN-139). Empty = UNKNOWN state: the wires are
      read and respond to each other, but none appears to be resolved or is resolved. */
  reviewThreads?: ReviewThreadState[];
  /** Comment emoji reactions (MIN-139). Blank = none to display. */
  reviewReactions?: ReviewCommentReaction[];
  /** Refreshes comments after successful submission. */
  onCommentPosted?: () => unknown;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const [viewType, setViewType] = useState<ViewType>("unified");
  /**
   * Folding long lines: `null` as long as no one has decided, and that's
   * then the WIDTH decides.
   *
   * Offshore, scrolling, like the forges: folding a long line breaks
   * number alignment and distorts indented code. On a phone, this
   * reasoning is reversed — the box is a few dozen characters long, so
   * scrolling horizontally never shows an entire line again, and you have to
   * scan line by line to read a hunk. Better folded code than
   * code hors champ.
   *
   * A FAULT, not a constraint: as soon as you touch the seesaw, the choice holds,
   * and it survives a screen rotation.
   */
  const [wrapChoice, setWrapChoice] = useState<boolean | null>(null);
  const wrap = wrapChoice ?? isMobile;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  /** Mounted maps, by path — what the tree targets when you click on a line. */
  const cards = useRef(new Map<string, HTMLElement>());
  const registerCard = useCallback((path: string, node: HTMLElement | null) => {
    if (node) cards.current.set(path, node);
    else cards.current.delete(path);
  }, []);

  /**
   * Take to the file: unfold it if it was folded, THEN scroll. The order
   * is not cosmetic — scrolling to a still folded map would aim for a
   * box of 40 px, and the unfolding that follows would push the diff elsewhere.
   *
   * `flushSync` rather than a `requestAnimationFrame`: it guarantees that the
   * unfolding is IN THE DOM before we measure, where the next image is
   * than a bet on React's scheduling.
   */
  const jumpToFile = useCallback((path: string) => {
    flushSync(() => {
      setCollapsed((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    });
    const card = cards.current.get(path);
    card?.scrollIntoView({ block: "start" });
    // The focus FOLLOWS the jump, on the header of the targeted file (the first button of
    // the map). Without that it would remain on the counter, at the top of the view, so
    // that the eye is twenty files lower — and Radix, by returning it to the
    // trigger when closing the panel, would bring scrolling back with it.
    // `preventScroll`: the framing has just been done, the focus does not have to be done again.
    card?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, []);

  const commentsByPath = useMemo(() => {
    const map = new Map<string, PullRequestReviewComment[]>();
    for (const c of reviewComments) {
      const list = map.get(c.path);
      if (list) list.push(c);
      else map.set(c.path, [c]);
    }
    return map;
  }, [reviewComments]);

  // Comments whose file is not in the PR (exceeding 100
  // API files, file removed since): without this fallback they would disappear
  // without leaving a trace.
  const orphanThreads = useMemo(() => {
    const known = new Set(files.map((f) => f.filename));
    return groupReviewThreads(
      reviewComments.filter((c) => !known.has(c.path)),
      reviewThreads,
    );
  }, [reviewComments, reviewThreads, files]);

  /**
   * The complete unified PR diff, in one chain. Memorized APART, and it is
   * him — not the table `files` — which controls the analysis: a refresh
   * which renders exactly the same patches renders the same string, therefore the same
   * objects of diff. But the lib HYDRATES these objects (the unfolded context is there
   * merged): recreating them at each `refetch` would erase under the fingers what
   * the user has just unfolded.
   */
  const diffText = useMemo(() => files.map(toUnifiedDiff).filter(Boolean).join("\n"), [files]);

  /**
   * Parse once, then index by path. The lib names each file
   * according to the `b/` side of the `diff --git` that we write — therefore `file.filename`,
   * for an added, deleted or renamed file as for the others.
   *
   * No cache prefix: it would index the coloring on a stable key
   * while the content of a PR changes under us (a pushed commit, a
   * review restarted).
   */
  const parsedByPath = useMemo(() => {
    const map = new Map<string, FileDiffMetadata>();
    if (!diffText) return map;
    for (const patch of parsePatchFiles(diffText)) {
      for (const parsed of patch.files) map.set(parsed.name, parsed);
    }
    return map;
  }, [diffText]);

  const orphanReplies = useReviewReplies(endpoint, onCommentPosted);
  const orphanResolution = useThreadResolution(endpoint, onCommentPosted);
  const orphanReactions = useCommentReactions(
    endpoint,
    onCommentPosted,
    reviewReactions,
    !readOnly,
  );

  if (files.length === 0) {
    // `className` carries the spacing that the host expects around the diff: the
    // losing here would stick the message to the edge.
    return <p className={cn("text-sm text-muted-foreground", className)}>{t("noDiff")}</p>;
  }

  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <PrDiffWorkers>
      <div className={cn("pr-diff-view flex flex-col gap-2", className)}>
        <div className="flex flex-col rounded-lg border border-border bg-muted/20">
          {/* Navigation and presentation answer different questions. Keeping
              them on separate rows makes the file tree the clear entry point
              instead of one control among several unrelated switches. */}
          <div className="flex min-h-10 items-center px-3">
            <PrFileTreeButton
              files={files}
              totalAdditions={totalAdd}
              totalDeletions={totalDel}
              onSelect={jumpToFile}
            />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("displayOptions")}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setWrapChoice(!wrap)}
                aria-pressed={wrap}
                aria-label={t("wrapLines")}
                title={t("wrapLines")}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md border transition-colors",
                  wrap
                    ? "border-brand/40 bg-brand/10 text-brand"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <WrapText className="size-3.5" />
              </button>
              <SegmentedControl
                className="w-40"
                value={viewType}
                onChange={setViewType}
                options={[
                  { value: "unified", label: t("unified") },
                  { value: "split", label: t("split") },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {files.map((f) => (
            <PrDiffFile
              key={f.filename}
              file={f}
              fileDiff={f.patch ? parsedByPath.get(f.filename) : undefined}
              viewType={viewType}
              wrap={wrap}
              themeType={resolvedTheme}
              locale={locale}
              endpoint={endpoint}
              prUrl={prUrl}
              provider={provider}
              readOnly={readOnly}
              expandableContext={expandableContext}
              canResolve={canResolve}
              collapsed={collapsed.has(f.filename)}
              onToggle={() => toggle(f.filename)}
              registerCard={registerCard}
              reviewComments={commentsByPath.get(f.filename) ?? NO_COMMENTS}
              reviewThreads={reviewThreads}
              reviewReactions={reviewReactions}
              onCommentPosted={onCommentPosted}
            />
          ))}
          {orphanThreads.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <StaleThreads
                threads={orphanThreads}
                replies={orphanReplies}
                resolution={canResolve ? orphanResolution : undefined}
                reactions={orphanReactions}
                readOnly={readOnly}
                label={(count) => t("orphanComments", { count })}
              />
            </div>
          ) : null}
        </div>
      </div>
    </PrDiffWorkers>
  );
}
