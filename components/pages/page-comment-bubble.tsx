"use client";

// The contextual text toolbar for a page selection.
//
// Tiptap's BubbleMenu owns positioning and waits 300 ms after the last selection
// update before appearing. That delay keeps the toolbar still while the user is
// extending a selection. Formatting commands and the comment action share the
// same menu, so selecting text produces one stable affordance instead of a
// comment-only bubble followed by a separate editor menu.
//
// `onMouseDown.preventDefault()` preserves the ProseMirror selection while a
// toolbar button receives the pointer. Comments anchor to the first top-level
// block containing the selection start, matching block handles and block links.

import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code2,
  Italic,
  Link2,
  MessageSquarePlus,
  Strikethrough,
  Unlink,
} from "lucide-react";
import { cn } from "mangue-ui";

import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";
import { MAX_QUOTE_LENGTH } from "@/lib/page-comments";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** What clicking on the bubble does: where to anchor, and what we're talking about. */
export interface PageCommentAnchor {
  blockId: string;
  quote?: string;
  /** Open a new composer even when this block already has comments. */
  startNew?: boolean;
}

/** The first level block that contains this position, and its id. */
function anchorBlockId(editor: Editor, pos: number): string | null {
  const resolved = editor.state.doc.resolve(pos);
  // `depth >= 1`: node of depth 1 is the first level block. A
  // selection in a bullet therefore goes back to the list, like everywhere else.
  const node = resolved.depth >= 1 ? resolved.node(1) : null;
  const id = node?.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
  return typeof id === "string" && id ? id : null;
}

const SELECTION_MENU_DELAY_MS = 300;

function shouldShowSelectionMenu({ editor }: { editor: Editor }): boolean {
  const { selection } = editor.state;
  const { from, to, empty } = selection;
  return (
    editor.isEditable &&
    editor.view.hasFocus() &&
    selection instanceof TextSelection &&
    !empty &&
    !editor.isActive("codeBlock") &&
    !!editor.state.doc.textBetween(from, to, " ").trim()
  );
}

function ToolbarButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-muted-foreground",
            "transition-colors hover:bg-control hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active && "bg-control text-foreground"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function PageCommentBubble({
  editor,
  onComment,
}: {
  editor: Editor;
  onComment: (anchor: PageCommentAnchor) => void;
}) {
  const t = useTranslations("Pages");
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      link: current.isActive("link"),
    }),
  });

  const comment = () => {
    if (!editor || editor.isDestroyed) return;
    const { from, to } = editor.state.selection;
    const quote = editor.state.doc.textBetween(from, to, " ").trim();
    const blockId = anchorBlockId(editor, from);
    if (!blockId || !quote) return;
    onComment({
      blockId,
      quote: quote.slice(0, MAX_QUOTE_LENGTH),
      startNew: true,
    });
  };

  const editLink = () => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.getAttributes("link").href;
    const href = window.prompt(
      t("selectionLinkPrompt"),
      typeof current === "string" ? current : "https://"
    );
    if (href === null) return;
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={SELECTION_MENU_DELAY_MS}
      shouldShow={shouldShowSelectionMenu}
      options={{ placement: "top", offset: 8 }}
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md"
      )}
    >
      <ToolbarButton
        label={t("selectionBold")}
        active={active?.bold}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label={t("selectionItalic")}
        active={active?.italic}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label={t("selectionStrike")}
        active={active?.strike}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label={t("selectionCode")}
        active={active?.code}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      >
        <Code2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label={active?.link ? t("selectionEditLink") : t("selectionAddLink")}
        active={active?.link}
        onClick={editLink}
      >
        <Link2 className="size-4" />
      </ToolbarButton>
      {active?.link ? (
        <ToolbarButton
          label={t("selectionRemoveLink")}
          onClick={() => editor?.chain().focus().extendMarkRange("link").unsetLink().run()}
        >
          <Unlink className="size-4" />
        </ToolbarButton>
      ) : null}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
      <ToolbarButton label={t("commentSelection")} onClick={comment}>
        <MessageSquarePlus className="size-4" />
      </ToolbarButton>
    </BubbleMenu>
  );
}
