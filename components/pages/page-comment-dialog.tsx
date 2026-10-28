"use client";

// The thread of a BLOCK (MIN-282): the passage it was written about, its
// discussions and their replies, and the field to write a new one.
//
// A DIALOG on a desktop and the shared bottom sheet on a phone (the `Dialog`
// primitive swaps itself in the mobile layout), rather than a panel anchored
// beside the block: the panel was measured against the block on every scroll
// and keystroke, fell under the block on narrow windows, and on a phone had no
// room at all next to the keyboard. The block stays highlighted by its badge;
// the dialog says which passage it is about.
//
// The PAGE thread has no text to be alongside — it lives in the activity of
// history (components/pages/page-activity.tsx).

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobileSheetScrollArea } from "@/components/ui/mobile-sheet";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import {
  CommentBlock,
  CommentComposer,
  CommentPermissionsProvider,
  ReplyComposer,
} from "@/components/issue-timeline";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { posOfBlockId } from "@/components/pages/block-actions";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";
import type { PageThread } from "@/lib/page-comments";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import type { Member } from "@/lib/types";

export interface BlockCommentTarget {
  blockId: string;
  /** The extract, when the thread opens on a selection that we have just made. */
  quote?: string;
  /** Start a separate thread even if the block already has discussions. */
  startNew?: boolean;
}

export function PageCommentDialog({
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
  const mentions = useDescriptionMentions(projectId, members);
  // Project roles (MIN-693): readers without the comment option only read.
  const { canWrite, canComment } = useProjectCapabilities(projectId);

  // The block disappears under the dialog (⌘Z, a teammate): the thread is not
  // lost — it returns to the activity, marked detached — but this dialog has
  // nothing left to be about.
  useEffect(() => {
    if (!editor) return;
    const check = () => {
      if (!editor.isDestroyed && posOfBlockId(editor, target.blockId) === null) onClose();
    };
    check();
    editor.on("transaction", check);
    return () => {
      editor.off("transaction", check);
    };
  }, [editor, target.blockId, onClose]);

  // Start with a composer for a new selection thread, an explicit block-menu
  // comment, or a block with no existing discussion. Otherwise open the thread.
  const fresh = !!target.startNew || !!target.quote || threads.length === 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex max-h-[min(85dvh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        // The “⋯” menu of a comment and its confirmation live above it.
        onInteractOutside={keepOverlayOpenForPopper}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <DialogTitle className="text-base">
            {fresh ? t("commentOnSelection") : t("comments")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("commentOnBlock")}</DialogDescription>
        </DialogHeader>

        <MobileSheetScrollArea className="min-h-0 flex-1 overflow-y-auto scrollbar-quiet">
          {/* Keep the frozen extract visible while composing a new selection thread. */}
          {fresh && target.quote ? (
            <p className="mx-4 mt-4 border-l-2 border-brand/50 pl-2 text-sm italic text-muted-foreground line-clamp-4">
              {target.quote}
            </p>
          ) : null}

          <CommentPermissionsProvider canComment={canComment} canModerate={canWrite}>
            {threads.map((thread) => (
              <ThreadPanel
                key={thread.root.id}
                thread={thread}
                members={members}
                currentUserId={currentUserId}
                projectId={projectId}
                mentions={mentions}
                canReply={canComment}
                onAdd={onAdd}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </CommentPermissionsProvider>
        </MobileSheetScrollArea>

        {fresh && canComment && (
          <div className="relative shrink-0 border-t border-border/60 p-4">
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
      </DialogContent>
    </Dialog>
  );
}

function ThreadPanel({
  thread,
  members,
  currentUserId,
  projectId,
  mentions,
  canReply,
  onAdd,
  onEdit,
  onDelete,
}: {
  thread: PageThread;
  members: Member[];
  currentUserId: string | null;
  projectId: string;
  mentions: DocumentEditorMentions;
  canReply: boolean;
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
      <p className="mx-4 mt-4 border-l-2 border-brand/50 pl-2 text-sm italic text-muted-foreground line-clamp-3">
        {root.quote ?? t("commentOnBlock")}
      </p>

      <div className="px-4 py-3">
        <CommentBlock
          comment={root}
          ctx={ctx}
          mentions={mentions}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
          onDeleteAttachment={noAttachments}
          deletesReplies={replies.length > 0}
          liveTable="page_comments"
        />
      </div>
      {replies.map((reply) => (
        <div key={reply.id} className="border-t border-border/60 px-4 py-3">
          <CommentBlock
            comment={reply}
            ctx={ctx}
            mentions={mentions}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleteAttachment={noAttachments}
            deletesReplies={false}
            liveTable="page_comments"
            isReply
          />
        </div>
      ))}
      {!root.delivery && canReply && <div className="border-t border-border/60">
        <ReplyComposer
          members={members}
          mentions={mentions}
          currentUserId={currentUserId}
          projectId={projectId}
          rootId={root.id}
          allowAttachments={false}
          onReply={(parentId, body, mentionedUserIds) =>
            onAdd({ body, mentionedUserIds, parentId })
          }
        />
      </div>}
    </div>
  );
}

/** A page thread has no attachment (see `allowAttachments`): the
 hook exists for the shared signature, and is never called. */
const noAttachments = async () => {};
