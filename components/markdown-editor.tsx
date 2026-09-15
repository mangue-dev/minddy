"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { EditorProps } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import {
  setCodeBlockLabels,
} from "@/components/code-block-lowlight";
import { codeBlockEditorExtension } from "@/components/code-block-node-view";
import { Arrows } from "@/components/editor-arrows";
import {
  MENTION_HYDRATION_META,
  MentionNode,
  MentionSuggest,
  hydrateMentions,
} from "@/components/markdown-mention";
import {
  MentionLinksProvider,
  type MentionLinks,
} from "@/components/mention-links";
import { handleNodeLinkClick } from "@/components/editor-node-link";
import {
  handleMarkdownLinkClick,
  MarkdownLinkMark,
} from "@/components/markdown-link-mark";
import { MarkdownLinkMenu } from "@/components/markdown-link-menu";
import type { MentionOption } from "@/components/mention-suggest";
import type { MentionScan } from "@/lib/mention-scan";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";

/**
 * What a description can quote. Absent = surface without mentions (the public feedback board
 *, where an “@” must not designate anyone from here).
 *
 * `options` is the list proposed after the “@”; `scan` is the rule which
 * finds mentions of a text ALREADY written, to give them their pill at
 * when opening. The two are deduced from the same sources (lib/use-mention-sources)
 * but remain distinct: we only offer what is quotable here, so
 * we reread everything that could be cited.
 */
export interface MarkdownEditorMentions {
  options: MentionOption[];
  scan: MentionScan;
  /** Where each pill leads — a ticket, an objective, a page opens with one
 click; a person leads nowhere (components/mention-links). */
  links?: MentionLinks;
  /** The first “@” typed — loads the list at that time. */
  onQuery?: () => void;
}

/* Rendered-markdown typography — mirrors <Markdown> so the editing surface reads
   exactly like the committed description (same sizes, spacing, colors). */
const PROSE = cn(
  "text-sm leading-relaxed break-words outline-none",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[1em]",
  "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
  "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
  "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_strong]:font-semibold",
  "[&_hr]:my-3 [&_hr]:border-border",
);

/** ProseMirror view settings — frozen outside the component, cf. the rule
 above the call to `useEditor`. */
const EDITOR_PROPS: EditorProps = {
  attributes: { class: PROSE },
  // Clicking on the pill of a mention does not belong to the Link extension:
  // it grabs all `<a>` of the document and opens it in a new tab, which
  // did TWO navigations for one click (components/editor-node-link.ts).
  handleClick: (view, pos, event) =>
    handleNodeLinkClick(event) || handleMarkdownLinkClick(view, pos, event),
};

/**
 * Borderless WYSIWYG markdown editor. Content is edited as rendered rich text
 * (Notion-style — bold/headings/lists show live) and read/written as markdown.
 * No box, no radius: the editing surface is the description.
 *
 * Remount per issue with `key={issue.id}` so state resets cleanly; commits the
 * current markdown on blur.
 */
/** What a COMPOSER drives from outside the editor: quote, dictate and
    uploads write INTO the surface, and the send shortcut goes through it. */
export interface MarkdownEditorApi {
  getMarkdown(): string;
  /** Replace the whole content (external write: quote). */
  setMarkdown(markdown: string): void;
  /** Insert AT the caret (dictation, pasted uploads). */
  insertMarkdown(markdown: string): void;
  focus(): void;
}

export function MarkdownEditor({
  value,
  onCommit,
  onEmptyChange,
  onEdit,
  onChange,
  onSubmit,
  autoFocus,
  apiRef,
  mentions,
  placeholder = "Ajoute une description…",
  className,
}: {
  value: string;
  onCommit: (markdown: string) => void;
  /** Live emptiness signal (fires on mount and on each edit) — lets callers see
      typed-but-uncommitted content, since onCommit only fires on blur. */
  onEmptyChange?: (empty: boolean) => void;
  /** The content has just been MODIFIED (typing, pasting) — never in editing.
 Tells the caller that what is on the screen is no longer what he loaded:
 so as not to replace the text under the fingers, nor recommit an expired reflection to the blur. */
  onEdit?: () => void;
  /** Live markdown, on every edit — a composer reads it to arm its send
      button, a description editor may not need it. */
  onChange?: (markdown: string) => void;
  /** Send shortcut (⌘/Ctrl+Enter, or plain Enter when the account chose
      that): the composer submits through it. Shift+Enter stays a newline,
      and a mention menu open consumes the key before this fires. */
  onSubmit?: () => void;
  autoFocus?: boolean;
  /** One call, as soon as the surface exists: the caller keeps the handles
      and writes into the editor without owning its state. */
  apiRef?: (api: MarkdownEditorApi) => void;
  mentions?: MarkdownEditorMentions;
  placeholder?: string;
  className?: string;
}) {
  const tCommon = useTranslations("Common");
  const [empty, setEmpty] = useState(value.trim() === "");
  const syncEmpty = (next: boolean) => {
    setEmpty(next);
    onEmptyChange?.(next);
  };

  setCodeBlockLabels({
    copy: tCommon("copy"),
    copied: tCommon("copied"),
    language: tCommon("codeLanguage"),
  });

  // Extensions are only built once, but the list of citables
  // arrives afterwards (the index loads at dead time): the extension therefore reads
  // a REFERENCE, never a capture.
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;
  // Live callbacks pass through REFERENCE for the same reason: handlers may
  // close over a draft that moves.
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const isSend = useIsSendShortcut();
  // Fixed during editing: switch a surface from “without mentions” to “with”
  // would ask to rebuild the schema, which no caller does.
  const [hasMentions] = useState(!!mentions);

  const extensions = useMemo(
    () => [
      // The stock code block is swapped for the lowlight one (same node, same
      // attributes — only rendering changes): a fenced block in a description
      // highlights as it does once committed (components/code-block-lowlight).
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        link: false,
      }),
      MarkdownLinkMark,
      codeBlockEditorExtension(),
      Arrows,
      ...(hasMentions
        ? [
            MentionNode,
            MentionSuggest.configure({
              items: () => mentionsRef.current?.options ?? [],
              onQuery: () => mentionsRef.current?.onQuery?.(),
            }),
          ]
        : []),
      Markdown.configure({
        html: false,
        linkify: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    [hasMentions],
  );

  // The starting text, frozen during editing: tiptap only reads `content` at the
  // creation of the editor (the surface is raised by `key`, see above).
  const initialContentRef = useRef(value);
  const editorRef = useRef<Editor | null>(null);
  const editorProps = useMemo<EditorProps>(
    () => ({
      ...EDITOR_PROPS,
      handlePaste: (_view, event) => {
        const editor = editorRef.current;
        const text =
          event.clipboardData?.getData("text/plain") ||
          event.clipboardData?.getData("text");

        // Do not let ProseMirror consume the rich `text/html` clipboard flavor.
        // `insertContent` goes through tiptap-markdown's parser, so markdown
        // headings, lists and fenced code still become real editor nodes.
        event.preventDefault();
        if (!editor || !text) return true;
        editor.commands.insertContent(text);
        return true;
      },
    }),
    [],
  );

  // ⚠️ tiptap rereads these options EACH rendering and reapplies one
  // `editor.setOptions()` anything that has changed identity — from its own
  // effect, therefore in the middle of the React commit phase, where to reassemble a node view
  // (mention pills are) raises the `flushSync` error described more
  // down. Hence memorized extensions, `editorProps` outside the component and content
  // frozen: nothing moves from one rendering to another.
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContentRef.current,
    editorProps,
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      syncEmpty(editor.isEmpty);
    },
    onUpdate: ({ editor, transaction }) => {
      syncEmpty(editor.isEmpty);
      changeRef.current?.(markdownOf(editor));
      // Placing the pills on an already written text is not a typing: without
      // this guard, open a ticket whose description cites someone
      // would mark "modified", and the panel would then refuse any writing
      // distant on a text that no one has touched.
      if (transaction.getMeta(MENTION_HYDRATION_META)) return;
      onEdit?.();
    },
    // tiptap-markdown adds `markdown` storage but doesn't augment TipTap's type.
    onBlur: ({ editor }) => onCommit(markdownOf(editor)),
  });

  // ── The composer surface ────────────────────────────────────────────────
  // The markdown of an editor, read the same way on every road.
  const markdownOf = (editor: Editor): string =>
    (
      editor.storage as unknown as {
        markdown: { getMarkdown(): string };
      }
    ).markdown.getMarkdown();

  useEffect(() => {
    if (!editor) return;
    apiRef?.({
      getMarkdown: () => markdownOf(editor),
      setMarkdown: (markdown) => {
        editor.commands.clearContent();
        editor.commands.insertContent(markdown);
        // Pills rest outside the commit phase, and only when the surface is
        // not being written into — an external rewrite while typing is
        // a caller bug, and the caret must not move for it.
        queueMicrotask(() => {
          if (editor.isDestroyed || editor.isFocused) return;
          const scan = mentionsRef.current?.scan;
          if (scan) hydrateMentions(editor, scan);
        });
      },
      insertMarkdown: (markdown) => {
        editor.commands.insertContent(markdown);
      },
      focus: () => {
        editor.commands.focus("end");
      },
    });
    if (autoFocus) {
      queueMicrotask(() => {
        if (!editor.isDestroyed) editor.commands.focus("end");
      });
    }
  }, [editor, apiRef, autoFocus]);

  // The send shortcut, on the DOM in the BUBBLE phase: ProseMirror and the
  // mention menu have already had the key — a menu that picks a mention
  // prevents the event, and this listener lets it go without submitting.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.defaultPrevented || event.shiftKey)
        return;
      if (!isSend(event)) return;
      event.preventDefault();
      submitRef.current?.();
    };
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [editor, isSend]);

  // The pills of an already written text rest upon opening — and again
  // when the quotable list arrives afterwards. NEVER under the caret: a
  // description while typing must not rewrite itself (even
  // rule that the comments field).
  //
  // OUTSIDE the commit phase (`queueMicrotask`): place a mention node
  // mount a React view, and tiptap mounts it as `flushSync`. Called directly
  // in effect, React refuses — “flushSync was called from inside a lifecycle
  // method” — and the pills are placed haphazardly. A microtask
  // executes just after the commit, therefore outside of any rendering.
  const scan = mentions?.scan;
  useEffect(() => {
    if (!editor || !scan || editor.isFocused) return;
    queueMicrotask(() => {
      if (editor.isDestroyed || editor.isFocused) return;
      hydrateMentions(editor, scan);
    });
  }, [editor, scan]);

  return (
    <div
      className={cn("relative cursor-text", className)}
      onMouseDown={(e) => {
        // Clicking the empty gutter below the content should still focus the editor.
        if (e.target === e.currentTarget) editor?.commands.focus("end");
      }}
    >
      {empty && (
        <p className="pointer-events-none absolute top-0 left-0 text-sm text-muted-foreground/70">
          {placeholder}
        </p>
      )}
      {/* The pills are rendered by node views, mounted as portals
 UNDER `EditorContent`: the context set here therefore reaches them, and
 is what gives them their destination without crossing anything manually. Same layout as the lookup of the subpages of a page. */}
      <MentionLinksProvider value={mentions?.links ?? null}>
        <EditorContent editor={editor} />
        <MarkdownLinkMenu editor={editor} />
      </MentionLinksProvider>
    </div>
  );
}
