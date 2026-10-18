"use client";

// The page editor: the shared engine (components/editor/rich-editor.tsx) with
// the whole page catalog, the block chrome, the bottom reserve and the page's
// own hooks — subpages, uploads, passage comments and the title bridge.
//
// Everything about editing itself lives in the engine, so that issue and
// objective descriptions, comments and the notebook edit exactly like a page
// (MIN-728). This file only states what a page is.

import type { MutableRefObject } from "react";
import type { Editor, JSONContent } from "@tiptap/react";
import { RichEditor, type RichEditorMentions } from "@/components/editor/rich-editor";
import type { PageUploads } from "@/components/pages/page-uploads";
import type { MentionLinks } from "@/components/mention-links";
import type { PageCommentAnchor } from "@/components/pages/page-comment-bubble";
import type { PagesLookup } from "@/components/pages/pages-lookup";
import type { BodyCollaboration } from "@/components/pages/page-collaboration";

export { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks";

export type PageEditorMentions = RichEditorMentions;

export function PageEditor({
  initialContent,
  onChange,
  pages,
  uploads,
  mentions,
  mentionLinks,
  editorRef,
  onEditor,
  onSubpagesRemoved,
  onLeaveTop,
  onComment,
  collaboration = null,
  editable = true,
  className,
}: {
  /** The body of the page in JSON ProseMirror — storage (markdown is a
   projection, cf. MIN-269). Read at MOUNT only. */
  initialContent: JSONContent | null;
  onChange: (content: JSONContent) => void;
  /** How to resolve a subpage, and how to create one (MIN-272). */
  pages?: PagesLookup;
  onSubpagesRemoved?: (pageIds: string[]) => void;
  /** Optional, like `pages`: without it the editor makes the blocks already
   there but doesn't accept new ones — what a version preview needs. */
  uploads?: PageUploads & { addFiles: (files: Iterable<File>, options?: { at?: number }) => void };
  mentions?: PageEditorMentions;
  mentionLinks?: MentionLinks | null;
  editorRef?: MutableRefObject<Editor | null>;
  onEditor?: (editor: Editor | null) => void;
  onLeaveTop?: () => void;
  onComment?: (anchor: PageCommentAnchor) => void;
  collaboration?: BodyCollaboration | null;
  /** READ-ONLY (MIN-277): the preview of a version of the history. */
  editable?: boolean;
  className?: string;
}) {
  return (
    <RichEditor
      initialContent={initialContent}
      onChange={(content) => onChange(content)}
      blocks="page"
      blockChrome
      bottomReserve
      size="page"
      pages={pages}
      uploads={uploads}
      mentions={mentions}
      mentionLinks={mentionLinks}
      editorRef={editorRef}
      onEditor={onEditor}
      onSubpagesRemoved={onSubpagesRemoved}
      onLeaveTop={onLeaveTop}
      onComment={onComment}
      collaboration={collaboration}
      editable={editable}
      className={className}
    />
  );
}
