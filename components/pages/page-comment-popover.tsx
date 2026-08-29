"use client";

// The wire of a BLOCK, placed on the block (MIN-282).
//
// This is the half that gives meaning to the anchor: a discussion on “this
// sentence itself” is read next to the sentence, not in a footer where it
// should remember what she was talking about. The PAGE thread has no
// text to be alongside — it lives in the activity of history
// (components/pages/page-activity.tsx).
//
// ─── Positionnement ──────────────────────────────────────────────────────────
//
// In SCREEN coordinates, measured on the block node, like the bubble of
// selection: the column of the document already carries the gutter reserve and the
// positioning of the block chrome, and none of this should go down in
// the editor. The panel is placed on the RIGHT when the window is wide enough — the
// natural place, the one that Notion and Google Docs taught everyone —
// and goes back UNDER the block when it is not, rather than coming out of
// the screen.
//
// It is measured by scrolling: the document scrolls under it, and a panel
// anchored to a block that is no longer there is worse than a closed panel.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { Button, cn } from "mangue-ui";
import { X } from "lucide-react";

import {
  CommentBlock,
  CommentComposer,
  ReplyComposer,
} from "@/components/issue-timeline";
import { posOfBlockId } from "@/components/pages/block-actions";
import {
  hasOpenDismissibleLayer,
  isInOverlayLayer,
} from "@/lib/overlay-layers";
import type { PageThread } from "@/lib/page-comments";
import type { Member } from "@/lib/types";

/** Width of the panel, and the margin it keeps with the edge of the window. */
const WIDTH = 340;
const GAP = 16;
const MARGIN = 12;


export interface BlockCommentTarget {
  blockId: string;
  /** The extract, when the thread opens on a selection that we have just made. */
  quote?: string;
  /** Start a separate thread even if the block already has discussions. */
  startNew?: boolean;
}

export function PageCommentPopover({
  editor,
  target,
  threads,
  members,
  currentUserId,
  projectId,
  onClose,
  onAdd,
  onEdit,
  onDelete,
}: {
  editor: Editor | null;
  /** The block from which we open the thread, and extract it if it is a BORN thread. */
  target: BlockCommentTarget;
  /** The wires of this block — empty when you have just opened one. */
  threads: PageThread[];
  members: Member[];
  currentUserId: string | null;
  projectId: string;
  onClose: () => void;
  onAdd: (input: {
    body: string;
    mentionedUserIds: string[];
    blockId?: string | null;
    quote?: string | null;
    parentId?: string | null;
  }) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const t = useTranslations("Pages");
  const tTimeline = useTranslations("Timeline");
  const panel = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  const measure = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    const pos = posOfBlockId(editor, target.blockId);
    if (pos === null) {
      // The block has just disappeared before our eyes (⌘Z, a teammate). The thread
      // is not lost: he returns to the activity, marked detached.
      onClose();
      return;
    }
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const rect = dom.getBoundingClientRect();
    const room = window.innerWidth - rect.right - GAP - MARGIN;
    const left =
      room >= WIDTH
        ? rect.right + GAP
        : Math.max(MARGIN, Math.min(rect.left, window.innerWidth - WIDTH - MARGIN));
    const top = room >= WIDTH ? rect.top : rect.bottom + 8;
    setBox({
      top: Math.max(MARGIN, Math.min(top, window.innerHeight - 160)),
      left,
    });
  }, [editor, target.blockId, onClose]);

  useEffect(() => {
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // The document moves (keystroke, remote writing): the block can go down.
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", measure);
    return () => {
      editor.off("transaction", measure);
    };
  }, [editor, measure]);

  // Close escape, and a click ELSEWHERE too — except in the panel, except on one
  // pill (clicking one from another block must open ITS thread, not close
  // this one and let the user click twice), and except in a layer
  // open ABOVE: the “⋯” menu of a comment and its dialog
  // confirmation are carried at the end of `body`, therefore “elsewhere” in the sense of the DOM.
  // Without this last exception, deleting a comment was impossible —
  // clicking on “Delete” closed the panel, which removed the dialog
  // before we could confirm (lib/overlay-layers.ts).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (hasOpenDismissibleLayer(document)) return;
      event.stopPropagation();
      onClose();
    };
    const onDown = (event: MouseEvent) => {
      const node = event.target as HTMLElement | null;
      if (panel.current?.contains(node ?? null)) return;
      if (node?.closest(".page-block-comment-badge")) return;
      if (isInOverlayLayer(node)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [onClose]);

  if (!box) return null;

  // Start with a composer for a new selection thread, an explicit block-menu
  // comment, or a block with no existing discussion. Otherwise open the thread.
  const fresh = !!target.startNew || !!target.quote || threads.length === 0;

  return (
    <div
      ref={panel}
      style={{ top: box.top, left: box.left, width: WIDTH }}
      className={cn(
        "fixed z-40 flex max-h-[min(70vh,32rem)] flex-col overflow-visible",
        "rounded-lg border border-border bg-popover shadow-lg"
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {fresh ? t("commentOnSelection") : t("comments")}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("closeThread")}
          className="-my-1 size-6 rounded-full text-muted-foreground"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 overflow-y-auto scrollbar-quiet">
        {/* Keep the frozen extract visible while composing a new selection thread. */}
        {fresh && target.quote ? (
          <p className="mx-3 mt-3 border-l-2 border-brand/50 pl-2 text-xs italic text-muted-foreground line-clamp-3">
            {target.quote}
          </p>
        ) : null}

        {threads.map((thread) => (
          <ThreadPanel
            key={thread.root.id}
            thread={thread}
            members={members}
            currentUserId={currentUserId}
            projectId={projectId}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      {fresh && (
        <div className="relative shrink-0 p-3">
          <CommentComposer
            members={members}
            projectId={projectId}
            allowAttachments={false}
            autoFocus
            placeholder={
              target.quote
                ? t("commentOnSelectionPlaceholder")
                : t("commentOnBlockPlaceholder")
            }
            submitLabel={tTimeline("comment")}
            onSubmit={async (body, mentionedUserIds) => {
              await onAdd({
                body,
                mentionedUserIds,
                blockId: target.blockId,
                quote: target.quote ?? null,
              });
              onClose();
            }}
          />
        </div>
      )}
    </div>
  );
}

function ThreadPanel({
  thread,
  members,
  currentUserId,
  projectId,
  onAdd,
  onEdit,
  onDelete,
}: {
  thread: PageThread;
  members: Member[];
  currentUserId: string | null;
  projectId: string;
  onAdd: (input: {
    body: string;
    mentionedUserIds: string[];
    parentId?: string | null;
  }) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const t = useTranslations("Pages");
  const { root, replies } = thread;
  const ctx = { members };

  return (
    <div className="border-b border-border/60 last:border-b-0">
      {/* The extract from the thread, as it read when we wrote it: the block could
 be rewritten since, and that's precisely what we want to see. */}
      <p className="mx-3 mt-3 border-l-2 border-brand/50 pl-2 text-xs italic text-muted-foreground line-clamp-2">
        {root.quote ?? t("commentOnBlock")}
      </p>

      <div className="px-3 py-3">
        <CommentBlock
          comment={root}
          ctx={ctx}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
          onDeleteAttachment={noAttachments}
          deletesReplies={replies.length > 0}
        />
      </div>
      {replies.map((reply) => (
        <div key={reply.id} className="border-t border-border/60 px-3 py-3">
          <CommentBlock
            comment={reply}
            ctx={ctx}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleteAttachment={noAttachments}
            deletesReplies={false}
            isReply
          />
        </div>
      ))}
      <div className="border-t border-border/60">
        <ReplyComposer
          members={members}
          currentUserId={currentUserId}
          projectId={projectId}
          rootId={root.id}
          allowAttachments={false}
          onReply={(parentId, body, mentionedUserIds) =>
            onAdd({ body, mentionedUserIds, parentId })
          }
        />
      </div>
    </div>
  );
}

/** A page thread has no attachment (see `allowAttachments`): the
 hook exists for the shared signature, and is never called. */
const noAttachments = async () => {};
