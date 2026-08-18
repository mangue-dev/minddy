"use client";

// The LAYER of comments on a page (MIN-282) — what lives ON the document,
// and nothing else.
//
// It does not render any surface in the flow: neither section nor footer. A
// discussion on a passage is read next to the passage (the thread opened by the
// block pad, components/pages/page-comment-popover.tsx); a discussion
// on the ENTIRE page can be read in its activity, with the other gestures
// (components/pages/page-activity.tsx, “Activity” tab in history).
//
// What this component holds, and which neither can hold alone:
//
// • all the blocks that EXIST in the document on the screen — it’s him,
// and not the last save, which decides what is detached;
// • the borders and dots returned to the editor;
// • the open thread, wherever we open it: the pellet of a block, or the bubble
// “Comment” which has just been born from a selection.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";

import {
  documentBlockIds,
  setCommentedBlocks,
  type BlockCommentsStorage,
  type CommentedBlocks,
} from "@/components/pages/block-comments";
import {
  PageCommentPopover,
  type BlockCommentTarget,
} from "@/components/pages/page-comment-popover";
import { usePageComments } from "@/lib/use-page-comments";
import { commentedBlockCounts } from "@/lib/page-comments";
import type { Member } from "@/lib/types";

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
}: {
  projectId: string;
  pageId: string;
  editor: Editor | null;
  members: Member[];
  currentUserId: string | null;
  draftAnchor: BlockCommentTarget | null;
  onDraftAnchorDone: () => void;
}) {
  const t = useTranslations("Pages");
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);

  /* ── What the document is about, right now ────────────────────────────── */
  const [blockIds, setBlockIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  useEffect(() => {
    if (!editor) return;
    const sync = () => setBlockIds(documentBlockIds(editor));
    sync();
    editor.on("update", sync);
    return () => {
      editor.off("update", sync);
    };
  }, [editor]);

  const { threads, add, edit, remove } = usePageComments({
    projectId,
    pageId,
    blockIds,
  });

  /** The message count per block — what the sticker carries. The rule of this
 which lights up lives in the pure module, with the detachment: it is the same
 question, and it can be tested without setting up an editor. */
  const commentedBlocks = useMemo<CommentedBlocks>(
    () => commentedBlockCounts(threads),
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
    storage.open = (blockId) => {
      onDraftAnchorDone();
      setOpenBlockId(blockId);
    };
    storage.label = t("openThread");
    return () => {
      storage.open = null;
    };
  }, [editor, t, onDraftAnchorDone]);

  // The decorations, sent back to the editor. They follow REAL TIME
  // without anything more: the list changes, the effect replays.
  //
  // The guardrail is not a micro-optimization: `blockIds` is remanufactured at
  // each keystroke, so without it each letter typed would send a transaction
  // decoration — that the decorations already follow on their own (`set.map`).
  const painted = useRef("");
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const signature = [...commentedBlocks]
      .map(([id, count]) => `${id}:${count}`)
      .sort()
      .join(",");
    if (signature === painted.current) return;
    painted.current = signature;
    setCommentedBlocks(editor, commentedBlocks);
  }, [editor, commentedBlocks]);

  // The block whose thread is open: the one we have just selected, otherwise
  // the one whose sticker was clicked.
  const target = useMemo<BlockCommentTarget | null>(() => {
    if (draftAnchor) return draftAnchor;
    return openBlockId ? { blockId: openBlockId } : null;
  }, [draftAnchor, openBlockId]);

  const close = useCallback(() => {
    setOpenBlockId(null);
    onDraftAnchorDone();
  }, [onDraftAnchorDone]);

  // The threads OF THIS BLOCK — including when we have just started a new one on
  // a block already commented on: the current discussion must be in front of you
  // while we write, otherwise we repeat what has just been said.
  const openThreads = useMemo(
    () =>
      target
        ? threads.filter(
            (thread) => !thread.detached && thread.root.block_id === target.blockId
          )
        : [],
    [threads, target]
  );

  if (!target) return null;

  return (
    <PageCommentPopover
      editor={editor}
      target={target}
      threads={openThreads}
      members={members}
      currentUserId={currentUserId}
      projectId={projectId}
      onClose={close}
      onAdd={add}
      onEdit={edit}
      onDelete={remove}
    />
  );
}
