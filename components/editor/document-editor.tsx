"use client";

// The DOCUMENT editor (MIN-728): the shared engine (./rich-editor.tsx) as the
// panels, dialogs and comments mount it — the `document` block set, no block
// chrome, the compact typography, and a Markdown value in and out.
//
// Markdown is what these surfaces store today and what every external reader
// (forge sync, MCP, Numo, notifications) reads. The engine parses it with the
// same schema as the page projection and serializes it back with the same
// serializer, so a description edited here round-trips like a page body.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor, Extensions, JSONContent } from "@tiptap/react";
import { cn } from "@/lib/utils";
import {
  RichEditor,
  editorMarkdown,
  type RichEditorMentions,
  type RichEditorPlaceholder,
} from "@/components/editor/rich-editor";
import { hydrateMentions } from "@/components/markdown-mention";
import type { MentionOption } from "@/components/mention-suggest";
import type { MentionLinks } from "@/components/mention-links";
import type { MentionScan } from "@/lib/mention-scan";
import type { PageSlashItem } from "@/components/pages/page-slash-command";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";
import { documentForEditor } from "@/lib/pages-markdown";
import type { BodyCollaboration } from "@/components/pages/page-collaboration";
import { useAttachmentImageUploads } from "@/components/editor/document-uploads";
import { onEditorDom } from "@/components/editor/editor-dom";

/**
 * What a document can quote. Absent = surface without mentions (the public
 * feedback board, where an “@” must not designate anyone from here).
 *
 * `options` is the list proposed after the “@”; `scan` is the rule which
 * finds mentions of a text ALREADY written, to give them their pill at
 * when opening. The two are deduced from the same sources (lib/use-mention-sources)
 * but remain distinct: we only offer what is quotable here, so
 * we reread everything that could be cited.
 */
export interface DocumentEditorMentions {
  options: MentionOption[];
  scan: MentionScan;
  /** Where each pill leads — a ticket, an objective, a page opens with one
   click; a person leads nowhere (components/mention-links). */
  links?: MentionLinks;
  /** The first “@” typed — loads the list at that time. */
  onQuery?: () => void;
}

/** What a COMPOSER drives from outside the editor: quote, dictate and
    uploads write INTO the surface, and the send shortcut goes through it. */
export interface DocumentEditorApi {
  getMarkdown(): string;
  /** Replace the whole content (external write: quote, a sent comment). */
  setMarkdown(markdown: string): void;
  /** Insert AT the caret (dictation, pasted uploads). */
  insertMarkdown(markdown: string): void;
  focus(): void;
  /** The live editor, for the rare surface that reads its document. */
  editor(): Editor | null;
}

export interface DocumentEditorProps {
  /** The Markdown at mount. Remount with `key` to load another document. */
  value: string;
  /**
   * The stored editor document of this text (MIN-728), when the surface has
   * one. It opens as stored while its projection still equals `value`;
   * otherwise its untouched blocks are kept and the rest comes from `value`
   * (`documentForEditor`). Read at mount, like `value`.
   */
  document?: JSONContent | null;
  /**
   * The live session of a shared description (MIN-728). With it the editor
   * opens `document` as the stream's head, as is, and every change goes to
   * the session as steps: `onCommit` and `onChange` are not for saving then.
   * Read at mount.
   */
  collaboration?: BodyCollaboration | null;
  /**
   * Where pasted, dropped and “/”-inserted images are stored (MIN-728):
   * `projects/<projectId>` for a description. Absent = no images can be
   * added (the blocks already there still show). Read at mount.
   */
  uploadScope?: string | null;
  /** The Markdown on blur, when the editor is editable, with its document. */
  onCommit?: (markdown: string, document: JSONContent) => void;
  /** Live emptiness signal (fires on mount and on each edit). */
  onEmptyChange?: (empty: boolean) => void;
  /** The content has just been MODIFIED (typing, pasting) — never by the
   pill rebuild: tells the caller that what is on screen is no longer what it
   loaded. */
  onEdit?: () => void;
  /** Live Markdown, on every edit, with its document. */
  onChange?: (markdown: string, document: JSONContent) => void;
  /** Send shortcut (⌘/Ctrl+Enter, or plain Enter when the account chose
      that). Shift+Enter stays a newline, and an open menu (“@”, “/”)
      consumes the key before this fires. */
  onSubmit?: () => void;
  /** Whether images are still being sent: a form waits for them before it
   submits, since their address arrives when the upload ends. */
  onUploadingChange?: (uploading: boolean) => void;
  /** Escape with no menu open: a composer closes or cancels with it. */
  onEscape?: () => void;
  /** ↑ from the first line, or ⌫ at the very start: the caret leaves for the
      title above, with its x for ↑ (MIN-756, see title-bridge.ts). Read at
      mount: pass it from the first render. */
  onLeaveTop?: (x?: number) => void;
  autoFocus?: boolean;
  /** One call, as soon as the surface exists: the caller keeps the handles
      and writes into the editor without owning its state. */
  apiRef?: (api: DocumentEditorApi) => void;
  mentions?: DocumentEditorMentions;
  placeholder?: RichEditorPlaceholder;
  /** Surface actions appended to the “/” menu (stable identity). */
  slashActions?: PageSlashItem[];
  /** Surface extensions (stable identity, read at mount). */
  extensions?: Extensions;
  /** `document` everywhere but the notebook, which takes the page size. */
  size?: "page" | "compact";
  className?: string;
  contentClassName?: string;
  /** Rendered without editing (project readers): no caret, no commit. */
  readOnly?: boolean;
  /** Accessible name of the editable region. */
  ariaLabel?: string;
}

/** An “@” or “/” suggestion menu is open: Enter picks its entry. Tiptap's
    suggestion plugins keep `{ active }` in their state. */
export function suggestionMenuOpen(editor: Editor): boolean {
  return editor.state.plugins.some((plugin) => {
    const state: unknown = plugin.getState(editor.state);
    return typeof state === "object" && state !== null && "active" in state &&
      "range" in state && (state as { active: unknown }).active === true;
  });
}

export function DocumentEditor({
  value,
  document,
  collaboration = null,
  uploadScope = null,
  onCommit,
  onEmptyChange,
  onEdit,
  onChange,
  onSubmit,
  onUploadingChange,
  onEscape,
  onLeaveTop,
  autoFocus,
  apiRef,
  mentions,
  placeholder,
  slashActions,
  extensions,
  size = "compact",
  className,
  contentClassName,
  readOnly = false,
  ariaLabel,
}: DocumentEditorProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  // A live description opens the stream's head as is: its Markdown may lag
  // behind it by the few seconds before materialization.
  const [initial] = useState(() =>
    collaboration && document ? document : documentForEditor(value, document));
  const [live] = useState(() => collaboration);

  // Images: the engine is always mounted (hooks), handed to the editor only
  // for an editable surface that has somewhere to store them.
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;
  const imageUploads = useAttachmentImageUploads(editorRef, uploadScope ?? "");
  const [canUpload] = useState(() => !!uploadScope && !readOnly);
  const uploadingRef = useRef(onUploadingChange);
  uploadingRef.current = onUploadingChange;
  const uploading = (imageUploads.sending ?? 0) > 0;
  useEffect(() => {
    uploadingRef.current?.(uploading);
  }, [uploading]);

  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;
  // Fixed during editing: switching a surface from “without mentions” to
  // “with” would rebuild the schema, which no caller does.
  const [hasMentions] = useState(!!mentions);
  const engineMentions = useMemo<RichEditorMentions | undefined>(
    () =>
      hasMentions
        ? {
            items: () => mentionsRef.current?.options ?? [],
            onQuery: () => mentionsRef.current?.onQuery?.(),
            // Read through the ref so a scanner that arrives later (the index
            // loads at dead time) still rebuilds the pills.
            scan: (text) => mentionsRef.current?.scan(text) ?? [{ type: "text", text }],
          }
        : undefined,
    [hasMentions]
  );
  // The pill rebuild runs when the scanner changes identity: hand the engine a
  // new reader each time the caller's scanner moves.
  const scan = mentions?.scan;
  const liveMentions = useMemo(
    () => (engineMentions && scan ? { ...engineMentions, scan } : engineMentions),
    [engineMentions, scan]
  );

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onEmptyRef = useRef(onEmptyChange);
  onEmptyRef.current = onEmptyChange;
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const isSend = useIsSendShortcut();

  // An edit is a change of what the document SAYS. Stamping block IDs when the
  // editor is created changes the ProseMirror document but not its Markdown,
  // and must not read as the viewer editing the description they opened.
  const markdownRef = useRef<string | null>(null);
  const handleChange = useCallback((_content: unknown, live: Editor) => {
    const markdown = editorMarkdown(live);
    const previous = markdownRef.current;
    markdownRef.current = markdown;
    if (previous === null || previous === markdown) return;
    onEmptyRef.current?.(live.isEmpty);
    onChangeRef.current?.(markdown, live.getJSON());
    onEditRef.current?.();
  }, []);

  const handleBlur = useCallback(
    (live: Editor) => {
      if (live.isEditable && !readOnly) onCommitRef.current?.(editorMarkdown(live), live.getJSON());
    },
    [readOnly]
  );

  // The baseline and the first emptiness signal, once the document is parsed.
  useEffect(() => {
    // A destroyed instance is about to be replaced (`onEditor` follows).
    if (!editor || editor.isDestroyed) return;
    markdownRef.current ??= editorMarkdown(editor);
    onEmptyRef.current?.(editor.isEmpty);
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    apiRef?.({
      getMarkdown: () => (editor.isDestroyed ? "" : editorMarkdown(editor)),
      setMarkdown: (markdown) => {
        if (editor.isDestroyed) return;
        editor.commands.setContent(markdown, { emitUpdate: true });
        // Pills rest outside the commit phase, and only when the surface is
        // not being written into.
        queueMicrotask(() => {
          if (editor.isDestroyed || editor.isFocused) return;
          const current = mentionsRef.current?.scan;
          if (current) hydrateMentions(editor, current);
        });
      },
      insertMarkdown: (markdown) => {
        if (!editor.isDestroyed) editor.commands.insertContent(markdown);
      },
      focus: () => {
        if (!editor.isDestroyed) editor.commands.focus("end");
      },
      editor: () => (editor.isDestroyed ? null : editor),
    });
  }, [editor, apiRef]);

  // The send shortcut, on the DOM in the CAPTURE phase: ProseMirror's own
  // Enter (a new paragraph, a list item) would otherwise take the key first,
  // and plain Enter never sent in the “Enter sends” mode. An open “@” or “/”
  // menu keeps the key to pick its entry.
  // Escape stays in the BUBBLE phase, after the menus that close on it.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    return onEditorDom(editor, (dom) => {
      const onSend = (event: KeyboardEvent) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing || !submitRef.current) return;
        if (!isSend(event) || suggestionMenuOpen(editor)) return;
        // The key lands on this very element, where ProseMirror listens too:
        // only an immediate stop keeps its Enter from running after the send.
        event.preventDefault();
        event.stopImmediatePropagation();
        submitRef.current();
      };
      const onEscape = (event: KeyboardEvent) => {
        if (event.defaultPrevented) return;
        if (event.key === "Escape" && escapeRef.current) {
          event.preventDefault();
          escapeRef.current();
        }
      };
      dom.addEventListener("keydown", onSend, true);
      dom.addEventListener("keydown", onEscape);
      return () => {
        dom.removeEventListener("keydown", onSend, true);
        dom.removeEventListener("keydown", onEscape);
      };
    });
  }, [editor, isSend]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !ariaLabel) return;
    return onEditorDom(editor, (dom) => {
      dom.setAttribute("aria-label", ariaLabel);
    });
  }, [editor, ariaLabel]);

  return (
    <div
      className={cn("relative cursor-text", className)}
      onMouseDown={(event) => {
        // Clicking the empty space below the content still focuses the editor;
        // a click in the margin beside a line already placed the caret there.
        if (event.defaultPrevented) return;
        if (event.target === event.currentTarget && editor && !editor.isDestroyed) editor.commands.focus("end");
      }}
    >
      <RichEditor
        initialContent={initial}
        onChange={handleChange}
        onBlur={handleBlur}
        onEditor={setEditor}
        onLeaveTop={readOnly ? undefined : onLeaveTop}
        blocks="document"
        blockChrome={false}
        size={size}
        mentions={liveMentions}
        collaboration={live}
        uploads={canUpload ? imageUploads : undefined}
        mentionLinks={mentions?.links ?? null}
        editable={!readOnly}
        placeholder={placeholder}
        slashActions={slashActions}
        extensions={extensions}
        autoFocus={autoFocus}
        immediateRender
        contentClassName={contentClassName}
      />
    </div>
  );
}
