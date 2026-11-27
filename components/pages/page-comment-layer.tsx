"use client";

// The LAYER of comments on a page (MIN-282) — what lives ON the document,
// and nothing else.
//
// It does not render any surface in the flow: neither section nor footer. A
// discussion on a passage is read next to the passage (the thread opened by the
// block badge, components/pages/page-comment-thread.tsx); a discussion
// on the ENTIRE page can be read in its activity, with the other gestures
// (components/pages/page-activity.tsx, “Activity” tab in history).
//
// What this component holds, and which neither can hold alone:
//
// • all the blocks that EXIST in the document on the screen — it’s him,
// and not the last save, which decides what is detached;
// • the borders and dots returned to the editor;
// • the open thread, wherever we open it: the pellet of a block, or the bubble
// “Comment” which has just been born from a selection;
// • WHERE the threads are read: cards in the right margin when the pane has
// room for them, the block's badge and its popover when it does not.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { toast } from "sonner";

import {
  documentBlockIds,
  setCommentedBlocks,
  type ActiveBlockComment,
  type BlockCommentsStorage,
  type CommentedBlocks,
} from "@/components/pages/block-comments";
import {
  PageCommentThread,
  type BlockCommentTarget,
} from "@/components/pages/page-comment-thread";
import { PageCommentMargin, type MarginThreadGroup } from "@/components/pages/page-comment-margin";
import { usePageComments } from "@/lib/use-page-comments";
import { marginLayout } from "@/lib/page-comment-margin";
import { useMarginCommentsShown } from "@/lib/page-comment-margin-pref";
import { commentedBlockAnnotations, normalizeQuote, threadsOnBlock } from "@/lib/page-comments";
import { scrollPane } from "@/lib/scroll-pane";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import type { Member } from "@/lib/types";

/** The editor's box, once it is in the page. */
function editorRoot(editor: Editor | null): HTMLElement | null {
  if (!editor || editor.isDestroyed) return null;
  try {
    return editor.view.dom.closest<HTMLElement>(".page-editor");
  } catch {
    // The view is not mounted yet.
    return null;
  }
}

interface CommentMargin {
  root: HTMLElement | null;
  /** The document's column, which moves left to make room for the cards. */
  column: HTMLElement | null;
  width: number | null;
  shift: number;
  /** The width the column narrows to while cards are shown, when it must. */
  columnWidth: number | null;
}
const NO_MARGIN: CommentMargin = { root: null, column: null, width: null, shift: 0, columnWidth: null };

/**
 * The editor's box and the width its pane leaves for margin cards, or no
 * width when the threads stay behind their badges: a phone, a side panel, a
 * narrow window.
 */
function useCommentMargin(editor: Editor | null): CommentMargin {
  const mobile = useMobileLayout() === true;
  const [margin, setMargin] = useState<CommentMargin>(NO_MARGIN);
  useEffect(() => {
    const root = mobile ? null : editorRoot(editor);
    if (!root || typeof ResizeObserver !== "function") {
      setMargin(NO_MARGIN);
      return;
    }
    const pane = scrollPane(root);
    const column = root.closest<HTMLElement>("[data-page-column]");
    const measure = () => {
      // Widths only, and the text's own before any narrowing: the column's
      // place and width change with what this computes.
      const style = column ? getComputedStyle(column) : null;
      const gutter = style ? parseFloat(style.paddingLeft) || 0 : 0;
      const pads = gutter + (style ? parseFloat(style.paddingRight) || 0 : 0);
      const content = style ? parseFloat(style.getPropertyValue("--content-width")) : Number.NaN;
      const text = Number.isFinite(content) ? Math.min(content, pane.clientWidth - pads) : root.offsetWidth;
      const layout = marginLayout(pane.clientWidth, text, gutter);
      const next: CommentMargin = {
        root,
        column,
        width: layout?.width ?? null,
        shift: layout?.shift ?? 0,
        columnWidth: layout?.text != null ? layout.text + pads : null,
      };
      setMargin((current) =>
        current.root === root &&
        current.width === next.width &&
        current.shift === next.shift &&
        current.columnWidth === next.columnWidth
          ? current
          : next
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(root);
    measure();
    return () => observer.disconnect();
  }, [editor, mobile]);
  return margin;
}

/**
 * The block ids of the document ON SCREEN, kept current as it is edited. A
 * thread is detached against these, not against the last save: a block typed
 * a moment ago exists, and one just deleted does not.
 */
export function useDocumentBlockIds(editor: Editor | null): ReadonlySet<string> {
  const [blockIds, setBlockIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const next = documentBlockIds(editor);
      setBlockIds((current) =>
        current.size === next.size && [...next].every((id) => current.has(id)) ? current : next
      );
    };
    sync();
    editor.on("update", sync);
    return () => {
      editor.off("update", sync);
    };
  }, [editor]);
  return blockIds;
}

export function PageCommentLayer({
  projectId,
  pageId,
  editor,
  members,
  currentUserId,
  /** A selection has just been commented on from the bubble: the thread opens on
 its block, in “new” mode. */
  draftAnchor,
  onDraftAnchorDone,
  onMarginAvailable,
}: {
  projectId: string;
  pageId: string;
  editor: Editor | null;
  members: Member[];
  currentUserId: string | null;
  draftAnchor: BlockCommentTarget | null;
  onDraftAnchorDone: () => void;
  /** Whether this page could show threads beside its text: it has open block
      threads and the window has room. The header then offers the choice. */
  onMarginAvailable?: (available: boolean) => void;
}) {
  const t = useTranslations("Pages");
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  // The margin card under the pointer: its passages light up in the text.
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  // And the other way: the commented passage under the pointer lights its card.
  const [hoveredPassageId, setHoveredPassageId] = useState<string | null>(null);

  /* ── What the document is about, right now ────────────────────────────── */
  const blockIds = useDocumentBlockIds(editor);

  const { threads, add, edit, remove, resolve } = usePageComments({
    projectId,
    pageId,
    blockIds,
  });

  /** The message count per block — what the sticker carries. The rule of this
 which lights up lives in the pure module, with the detachment: it is the same
 question, and it can be tested without setting up an editor. */
  const commentedBlocks = useMemo<CommentedBlocks>(
    () => commentedBlockAnnotations(threads),
    [threads]
  );

  // The hook that the pellet calls, and its label: the widget is from the DOM
  // bare, it can read neither the i18n catalog nor a React state (cf.
  // block-comments.ts).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // `editor.storage` is not typed by extension: the name is that of
    // `BlockComments.name`, and this is the only point of contact.
    const storage = (editor.storage as unknown as Record<string, unknown>)
      .blockComments as BlockCommentsStorage | undefined;
    if (!storage) return;
    storage.open = (blockId, source) => {
      onDraftAnchorDone();
      // The badge of the open thread closes it; a click in its passage
      // leaves it open.
      setOpenBlockId((current) => (source === "badge" && current === blockId ? null : blockId));
    };
    storage.hover = setHoveredPassageId;
    storage.label = t("openThread");
    return () => {
      storage.open = null;
      storage.hover = null;
    };
  }, [editor, t, onDraftAnchorDone]);

  // The block whose thread is open: the one we have just selected, otherwise
  // the one whose sticker was clicked.
  const target = useMemo<BlockCommentTarget | null>(() => {
    if (draftAnchor) return draftAnchor;
    return openBlockId ? { blockId: openBlockId } : null;
  }, [draftAnchor, openBlockId]);

  // What the editor emphasizes while a thread is open: its block, and for a
  // comment being written the passage it will quote, as it will be stored.
  const active = useMemo<ActiveBlockComment | null>(
    () => (target ? { blockId: target.blockId, quote: normalizeQuote(target.quote) } : null),
    [target]
  );

  // The decorations, sent back to the editor. They follow REAL TIME
  // without anything more: the list changes, the effect replays.
  //
  // Block changes can leave the same annotations. Avoid dispatching another
  // decoration transaction when the existing decorations already follow the
  // document through ProseMirror's mapping.
  const painted = useRef("");
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const signature = JSON.stringify([
      [...commentedBlocks]
        .map(([id, annotation]) => [id, annotation] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
      active,
      hoveredBlockId,
    ]);
    if (signature === painted.current) return;
    painted.current = signature;
    setCommentedBlocks(editor, commentedBlocks, active, hoveredBlockId);
  }, [editor, commentedBlocks, active, hoveredBlockId]);

  const close = useCallback(() => {
    setOpenBlockId(null);
    onDraftAnchorDone();
  }, [onDraftAnchorDone]);
  const openCard = useCallback(
    (blockId: string) => {
      onDraftAnchorDone();
      setOpenBlockId(blockId);
    },
    [onDraftAnchorDone]
  );

  // The threads OF THIS BLOCK — including when we have just started a new one on
  // a block already commented on: the current discussion must be in front of you
  // while we write, otherwise we repeat what has just been said.
  const openThreads = useMemo(
    () => (target ? threadsOnBlock(threads, target.blockId) : []),
    [threads, target]
  );

  // Resolving takes the thread off the page: say so, with the way back.
  const resolveThread = useCallback(
    async (rootId: string, resolved: boolean) => {
      await resolve(rootId, resolved);
      if (!resolved) return;
      toast(t("threadResolved"), {
        action: {
          label: t("reopenThread"),
          onClick: () => void resolve(rootId, false).catch((error: Error) => toast.error(error.message)),
        },
      });
    },
    [resolve, t]
  );

  /* ── Where the threads are read ──────────────────────────────────────── */
  const { root, column, width, shift, columnWidth } = useCommentMargin(editor);
  const beside = useMarginCommentsShown();
  const fits = !!root && width !== null;
  const inMargin = fits && beside;
  // The cards replace the badges: one count beside a thread already in view
  // would say the same thing twice (app/globals.css).
  useEffect(() => {
    if (!root || !inMargin) return;
    root.dataset.commentMargin = "";
    return () => {
      delete root.dataset.commentMargin;
      // The badges were not displayed, so not placed either: an empty
      // transaction has the editor place them (block-comments.ts).
      if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
    };
  }, [editor, root, inMargin]);

  const groups = useMemo<MarginThreadGroup[]>(() => {
    const byBlock = new Map<string, MarginThreadGroup>();
    for (const thread of threads) {
      const blockId = thread.root.block_id;
      if (!blockId || thread.detached || thread.resolved) continue;
      const group = byBlock.get(blockId) ?? { blockId, threads: [] };
      group.threads.push(thread);
      byBlock.set(blockId, group);
    }
    return [...byBlock.values()];
  }, [threads]);

  const marginAvailable = fits && groups.length > 0;
  useEffect(() => {
    onMarginAvailable?.(marginAvailable);
  }, [onMarginAvailable, marginAvailable]);
  useEffect(() => () => onMarginAvailable?.(false), [onMarginAvailable]);

  // While cards are shown the text stands left of centre, so that the text
  // and its cards are centred together (app/globals.css).
  const shifted = inMargin && (groups.length > 0 || !!target);
  useEffect(() => {
    if (!column || !shifted) return;
    column.style.setProperty("--page-comment-shift", `${shift}px`);
    if (columnWidth !== null) column.style.maxWidth = `${columnWidth}px`;
    return () => {
      column.style.removeProperty("--page-comment-shift");
      column.style.maxWidth = "";
    };
  }, [column, shifted, shift, columnWidth]);

  const actions = {
    members,
    currentUserId,
    projectId,
    onAdd: add,
    onEdit: edit,
    onDelete: remove,
    onResolve: resolveThread,
  };

  if (editor && root && width !== null && beside) {
    if (groups.length === 0 && !target) return null;
    return (
      <PageCommentMargin
        editor={editor}
        root={root}
        width={width}
        groups={groups}
        target={target}
        onOpen={openCard}
        onHover={setHoveredBlockId}
        highlighted={hoveredPassageId}
        onClose={close}
        {...actions}
      />
    );
  }

  if (!target) return null;

  return (
    <PageCommentThread
      // A thread opened from another block is another popover, not this one
      // gliding across the page with its draft.
      key={target.blockId}
      editor={editor}
      target={target}
      threads={openThreads}
      onClose={close}
      {...actions}
    />
  );
}
