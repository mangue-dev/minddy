"use client";

// THE EDITOR ENGINE of minddy (MIN-728): pages, issue and objective
// descriptions, comments, creation dialogs and the notebook all mount this one
// component, configured per surface. A fix made here is made everywhere.
//
// Its document schema comes from `pageExtensions()`, and it names no block:
// the registry (components/pages/blocks) is the catalog, and this same call
// is the one the Markdown projection makes (lib/pages-markdown.ts), so the
// editor and the agents read the same schema, by construction.
//
// What a surface chooses:
// - `blocks`: the whole page catalog, or the `document` set without the
//   page-tree blocks (subpages);
// - `blockChrome`: the handle and `+` gutter beside each block. Pages show it;
//   descriptions, comments and dialogs hide it — it takes room and is not
//   useful there. The “/” menu stays everywhere;
// - `collaboration`: the live session of a shared document (MIN-688);
// - `size`: the page typography, or the compact one of panels and comments.
//
// What it adds on top, and which does not affect the document:
// - `NodeRange`: selection of several blocks with a drag or a ⇧-click,
//   on which all menu actions operate ⋯ ;
// - the mention pill (components/markdown-mention.tsx) placed on the node
//   bare of the schema, and its suggestion “@”;
// - the “/” menu, connected to the register, and the chrome of the block
//   (components/pages/block-gutter.tsx): the margin on hover and the menu ⋯.
//
// Version history is not here: it stays a page feature (MIN-271), and this
// editor just renders its JSON on each keystroke.

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  EditorContent,
  useEditor,
  type Editor,
  type Extensions,
  type JSONContent,
} from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import { NodeRange } from "@tiptap/extension-node-range";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import {
  MENTION_HYDRATION_META,
  MentionNode,
  MentionSuggest,
  hydrateMentions,
  type MentionSuggestOptions,
} from "@/components/markdown-mention";
import type { MentionScan } from "@/lib/mention-scan";
import { pageExtensions } from "@/components/pages/page-extensions";
import type { BlockSet } from "@/components/pages/blocks";
import { taskItemNodeView } from "@/components/scratchpad/task-item-view";
import { subpageNodeView } from "@/components/pages/blocks/subpage-view";
import { imageNodeView } from "@/components/pages/blocks/image-view";
import { fileNodeView } from "@/components/pages/blocks/file-view";
import { calloutNodeView } from "@/components/pages/blocks/callout-view";
import {
  PageUploadsProvider,
  type PageUploads,
} from "@/components/pages/page-uploads";
import { Arrows } from "@/components/editor-arrows";
import { noteTyping, trackPointerFreshness } from "@/lib/keyboard/hover-keys";
import { setDetailsLabels } from "@/components/pages/blocks/details";
import { setCodeBlockLabels } from "@/components/code-block-lowlight";
import { codeBlockEditorExtension } from "@/components/code-block-node-view";
import {
  BlockPlaceholder,
  pagePlaceholder,
} from "@/components/pages/block-placeholder";
import { BlockGutter } from "@/components/pages/block-gutter";
import { BlockFlash } from "@/components/pages/block-flash";
import { BlockComments } from "@/components/pages/block-comments";
import {
  PageCommentBubble,
  type PageCommentAnchor,
} from "@/components/pages/page-comment-bubble";
import { focusDocumentEnd } from "@/components/pages/block-actions";
import { handleNodeLinkClick } from "@/components/editor-node-link";
import { handleMarkdownLinkClick } from "@/components/markdown-link-mark";
import { insertNotionCalloutPaste } from "@/lib/pages-callout-paste";
import {
  MentionLinksProvider,
  type MentionLinks,
} from "@/components/mention-links";
import {
  PageSlashCommand,
  pageSlashItems,
  type PageSlashItem,
} from "@/components/pages/page-slash-command";
import {
  PagesLookupProvider,
  type PagesLookup,
} from "@/components/pages/pages-lookup";
import { TitleBridge } from "@/components/pages/title-bridge";
import { MarkdownLinkMenu } from "@/components/markdown-link-menu";
import {
  PageCollaboration,
  pageCaretsKey,
  type BodyCollaboration,
} from "@/components/pages/page-collaboration";
import { isCollabRemoteTransaction } from "@/lib/page-collaboration-origin";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { EDITABLE_CHANGED_META } from "@/components/editor/use-editor-editable";

export interface RichEditorMentions extends MentionSuggestOptions {
  /** Rebuild mention nodes from the plain-text form stored by agent writes. */
  scan: MentionScan;
}

/** The typography of a surface. `page` is the document-sized body of pages and
 the notebook; `compact` the panel-sized one of descriptions and comments. */
export type RichEditorSize = "page" | "compact";

/* Body typography. The edition IS the preview: there is no raw Markdown mode.
 The compact scale mirrors `<Markdown>`, so a committed description reads like
 the surface that wrote it. */
const PROSE_BASE = cn(
  "leading-relaxed break-words outline-none",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
  "[&_li]:my-0.5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[1em]",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_strong]:font-semibold"
  // The leaflet is NOT here: its node view does not render `<details>` but
  // three `div[data-type]`, which these selectors never touched. Its
  // layout lives in app/globals.css, along with the rest of what needs to be aimed at
  // attributes rather than tags.
);

const PROSE: Record<RichEditorSize, string> = {
  page: cn(
    PROSE_BASE,
    "text-base",
    "[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
    "[&_h2]:mt-5 [&_h2]:mb-1.5 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
    "[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-semibold",
    "[&_hr]:my-4 [&_hr]:border-border"
  ),
  compact: cn(
    PROSE_BASE,
    "text-sm",
    "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
    "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
    "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
    "[&_hr]:my-3 [&_hr]:border-border"
  ),
};

/** Fixed at the module level: tiptap rereads the options each time it is rendered and
 reapplies everything that has changed IDENTITY, from its own effect. With
 React node views in the middle (tasks, subpages), it amounts to
 `flushSync` in the middle of the commit phase — which React refuses. Nothing
 must move from one rendering to another. */
function editorPropsFor(size: RichEditorSize) {
  return {
    attributes: { class: PROSE[size] },
    scrollMargin: { top: 0, right: 0, bottom: 160, left: 0 },
    scrollThreshold: { top: 0, right: 0, bottom: 160, left: 0 },
    // Clicking on the anchor of a node view does not belong to the Link extension:
    // the why, and the two navigations that he avoided, are in
    // components/editor-node-link.ts.
    handleClick: (view: EditorView, pos: number, event: MouseEvent) =>
      handleNodeLinkClick(event) || handleMarkdownLinkClick(view, pos, event),
    // Writing expires the pointer: as long as you have not moved the mouse again, the
    // task that it hovers no longer takes ⇧P (see hover-keys.ts). “Typing wins
    // as long as you write” is the only thing that separates the shortcut from
    // the letter. The signal is the STRIKE, not the change of document: the
    // arrows are there, a programmed insertion is not.
    handleKeyDown: () => {
      noteTyping();
      return false;
    },
  };
}

/**
 * Files from a clipboard or from a drop, when they are the ones you want.
 *
 * Discernment comes down to one rule: a transfer can carry FILES AND
 * TEXT at the same time — copying an image from a web page gives the file
 * and the `<img>` HTML that goes with it, copying a file from the Finder gives the
 * file and its name. We take the files as soon as there is an IMAGE among them
 * (this is the “I paste this capture” gesture, and the byte is better than a link
 * to the next site, which will stop responding); otherwise, only when the
 * transfer does not carry any text to paste.
 *
 * Making `true` on this path is what cuts the `transformPastedText` from
 * tiptap-markdown: without this, an image paste would go through the reading
 * markdown and would find nothing to read there.
 */
function filesToUpload(transfer: DataTransfer | null, imagesOnly = false): File[] | null {
  const all = Array.from(transfer?.files ?? []).filter((file) => file.size > 0);
  // Outside pages only images go into the document (MIN-728): other files are
  // left to the surface, which may attach them as resources.
  const files = imagesOnly ? all.filter((file) => file.type.startsWith("image/")) : all;
  if (files.length === 0) return null;
  if (files.some((file) => file.type.startsWith("image/"))) return files;
  const text = transfer?.getData("text/plain") ?? "";
  return text.trim() ? null : files;
}

/** The Markdown projection of what the editor holds, the same serializer the
 server projection runs (lib/pages-markdown.ts). */
export function editorMarkdown(editor: Editor): string {
  // A destroyed editor has no storage left (tiptap empties it): React can hand
  // one over before its replacement, now that editors are built during render.
  const markdown = (editor.storage as unknown as {
    markdown?: { getMarkdown(): string };
  } | undefined)?.markdown;
  return markdown && !editor.isDestroyed ? markdown.getMarkdown() : "";
}

export type RichEditorPlaceholder =
  | string
  | ((context: { node: PMNode; depth: number }) => string);

export interface RichEditorProps {
  /**
   * The document at MOUNT: ProseMirror JSON, or Markdown that the editor reads
   * through the same parser as the projection. Tiptap does not read `content`
   * afterwards; a remote write is adopted through `editorRef`.
   */
  initialContent: JSONContent | string | null;
  /** Every change of the document made by a person here or by a collaborator. */
  onChange?: (content: JSONContent, editor: Editor) => void;
  /** The block catalog. `page` (default) or `document` (MIN-728). */
  blocks?: BlockSet;
  /** The handle and `+` gutter beside each block. */
  blockChrome?: boolean;
  /** “Copy link to block” in the block menu: only where the document has an
   address of its own (a page); the notebook has none. */
  blockLinks?: boolean;
  /** The clickable space below the last block that returns the caret to the end. */
  bottomReserve?: boolean;
  size?: RichEditorSize;
  /** How to resolve a subpage, and how to create one (MIN-272). Pages only. */
  pages?: PagesLookup;
  /**
   * Subpage blocks have just left the document (MIN-272).
   *
   * The editor decides NOTHING here: he notes. It's the caller who asks for
   * confirmation, puts the pages in the trash, and cancels the action if they
   * say no — because only he knows how many descendants would leave with them.
   */
  onSubpagesRemoved?: (pageIds: string[]) => void;
  /**
   * Uploads (MIN-280): which places an image block or file and follows it to
   * its final address. Without it the editor renders the blocks already there
   * but doesn't accept new ones, and the “/” menu does not offer them.
   */
  uploads?: PageUploads & { addFiles: (files: Iterable<File>, options?: { at?: number }) => void };
  /** Quotable “@”. */
  mentions?: RichEditorMentions;
  /** Where the pills already placed lead: a ticket, an objective, a page
   open with one click (components/mention-links). */
  mentionLinks?: MentionLinks | null;
  editorRef?: MutableRefObject<Editor | null>;
  /**
   * The editor, rendered to the caller in a form that TRIGGERS a rendering — this
   * that `editorRef` does not do. The floating TOC needs it:
   * it subscribes to the instance, and a silently posed ref would never have it
   * woken up.
   */
  onEditor?: (editor: Editor | null) => void;
  /**
   * The cursor exits the body FROM THE TOP — ⌫ at the very beginning of the document, or ↑
   * from its first line. The caller returns focus to the title, which is the line above for who writes (see title-bridge.ts).
   */
  onLeaveTop?: () => void;
  /**
   * COMMENT on a passage (MIN-282): the bubble that appears on a selection of
   * text, and what it renders — the block to anchor in, and the selected extract.
   */
  onComment?: (anchor: PageCommentAnchor) => void;
  /**
   * The live session of this document (MIN-688). With it, every local
   * transaction becomes steps for the operation authority, collaborators'
   * steps arrive as transactions, and their carets are drawn. Its identity
   * must stay stable for the editor's lifetime: it is read when the editor is
   * built. Without it the editor is the plain snapshot surface.
   */
  collaboration?: BodyCollaboration | null;
  /**
   * Read-only: a version preview, a project reader. The non-editable mounted
   * editor rather than a second rendering surface — the editor IS the surface.
   * The gutter and the reserve go out with it.
   */
  editable?: boolean;
  /** The empty-line invitation. A text replaces the page's on top-level
   paragraphs; a function decides for every empty block. Defaults to the
   page's, which depends on the block under the cursor. */
  placeholder?: RichEditorPlaceholder;
  /** Surface actions appended to the “/” menu after the blocks. Their
   identity must stay stable, like every option read at build time. */
  slashActions?: PageSlashItem[];
  /** Surface extensions mounted after the engine's (the notebook's section copy,
   a composer's send shortcut). Stable identity, read at build time. */
  extensions?: Extensions;
  /** Replacements for catalog extensions, by extension name — the notebook's
   paragraph keeps its deliberate empty lines this way. The node keeps its
   name and schema; only its behavior and serialization change. Read at
   build time. */
  nodeExtensions?: Record<string, AnyExtension>;
  autoFocus?: boolean;
  /**
   * Build the editor during the first render rather than in an effect, so the
   * first frame already shows the formatted document instead of an empty box
   * (MIN-728). Only for surfaces rendered in the browser after an
   * interaction — descriptions, comments, the notebook: a server render has
   * no editor to build. Read at mount.
   */
  immediateRender?: boolean;
  onFocus?: (editor: Editor) => void;
  onBlur?: (editor: Editor) => void;
  className?: string;
  contentClassName?: string;
}

export function RichEditor({
  initialContent,
  onChange,
  blocks = "page",
  blockChrome = true,
  blockLinks = true,
  bottomReserve = false,
  size = "page",
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
  placeholder,
  slashActions,
  extensions: surfaceExtensions,
  nodeExtensions,
  autoFocus = false,
  immediateRender = false,
  onFocus,
  onBlur,
  className,
  contentClassName,
}: RichEditorProps) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");

  // Fixed at mount, like the schema it decides: adding uploads later would
  // need the menu rebuilt, which no surface does.
  const [uploadKinds] = useState<"all" | "images" | "none">(() =>
    !uploads ? "none" : uploads.imagesOnly ? "images" : "all");
  const slashItems = useMemo(
    () => [
      ...pageSlashItems(t, { set: blocks, uploads: uploadKinds }),
      ...(slashActions ?? []),
    ],
    [t, blocks, uploadKinds, slashActions]
  );

  // Memorized: tiptap reapplies everything that changes identity between two
  // rendered, and a remade function each time would remount the plugin.
  const [fixedPlaceholder] = useState(() => placeholder);
  const placeholderFor = useMemo(() => {
    const byBlock = pagePlaceholder(t);
    if (typeof fixedPlaceholder !== "string") return fixedPlaceholder ?? byBlock;
    // A surface's own invitation (“Add a description…”) stands for a top-level
    // line; a heading still announces its level and a nested block still
    // invites to write, as on a page.
    return (context: { node: PMNode; depth: number }) =>
      context.depth === 1 && context.node.type.name === "paragraph"
        ? fixedPlaceholder
        : byBlock(context);
  }, [fixedPlaceholder, t]);

  // The fold button of the leaflet is rendered by a node view without React: it
  // cannot read the catalog itself, we ask it here (see details.ts).
  setDetailsLabels({ expand: t("toggleExpand"), collapse: t("toggleCollapse") });
  setCodeBlockLabels({
    copy: tCommon("copy"),
    copied: tCommon("copied"),
    language: tCommon("codeLanguage"),
  });

  // The title bracket goes through a ref, and the function given to the extension
  // NEVER change identity: tiptap reapplies what moved, and a function remade
  // each time it is rendered would raise the keymap on each keystroke.
  const onLeaveTopRef = useRef(onLeaveTop);
  onLeaveTopRef.current = onLeaveTop;
  const [hasTitle] = useState(() => onLeaveTop !== undefined);
  const leaveTop = useMemo(
    () => () => {
      onLeaveTopRef.current?.();
    },
    []
  );

  // The "@" plugin keeps the options it was created with: when the extension
  // list changes, tiptap only calls setOptions and never rebuilds plugins.
  // Configure it once with readers of the latest mentions, so a new catalog
  // (a save, a renamed page, the index arriving) neither rebuilds every
  // extension nor leaves the suggestions on the first list.
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;
  const hasMentions = mentions !== undefined;
  const mentionSuggest = useMemo(
    () =>
      hasMentions
        ? MentionSuggest.configure({
            items: () => mentionsRef.current?.items() ?? [],
            onQuery: () => mentionsRef.current?.onQuery?.(),
          })
        : null,
    [hasMentions]
  );

  const [fixedSurfaceExtensions] = useState(() => surfaceExtensions ?? []);
  const [fixedNodeExtensions] = useState(() => nodeExtensions);

  const extensions = useMemo(
    () =>
      [
        // Steps and carets of the live session (MIN-688), when there is one.
        ...(collaboration ? [PageCollaboration.configure({ binding: collaboration })] : []),
        // The DIAGRAM, the same one that the markdown projection shows
        // (components/pages/page-extensions.ts). The editor adds his chrome,
        // and nothing that affects the document.
        // The TASKS view is that of the notebook (MIN-274): same menu ⋯, same
        // hover shortcuts, even right click. She injects herself here rather than
        // to live in the block file, because it pulls `mangue-ui` and
        // that the register must remain importable outside the browser (cf.
        // components/pages/blocks/task-list.ts).
        // Same thing for the SUB-PAGE, and for an even harder reason:
        // its view goes through `@tiptap/react`, a “use client” module — named
        // from the registry, it was called from the server at first
        // Numo page tool (see blocks/subpage.ts).
        ...pageExtensions({
          mention: MentionNode,
          blocks,
          nodeViews: {
            taskItem: taskItemNodeView(),
            subpage: subpageNodeView(),
            // And for the same reason again (MIN-280): both views read the
            // context of uploads and renders from React.
            image: imageNodeView(),
            pageFile: fileNodeView(),
            callout: calloutNodeView(),
          },
          extensions: { codeBlock: codeBlockEditorExtension(), ...fixedNodeExtensions },
          uniqueIdFilter: collaboration
            ? (transaction) => !isCollabRemoteTransaction(transaction)
            : undefined,
          trailingNode: !collaboration,
        }),
        ...(mentionSuggest ? [mentionSuggest] : []),
        // “->” becomes “→” under the fingers (components/editor-arrows.ts). An
        // INPUT rule, so nothing in the diagram: the markdown projection sees
        // nothing, and the document bears the real arrow.
        Arrows,
        NodeRange,
        // The placeholder is US and not @tiptap/extensions: why
        // is written in block-placeholder.ts, and it fits in two words — the
        // nested blocks, and the cursor read one keystroke late.
        BlockPlaceholder.configure({ text: placeholderFor }),
        PageSlashCommand.configure({ items: slashItems }),
        // Block flashes use decorations: ProseMirror undoes DOM mutations
        // made outside its rendering (see block-flash.ts).
        BlockFlash,
        // The EDGE of commented blocks (MIN-282). A decoration too,
        // and for one more reason than blinking: a mark would be
        // content, therefore markdown projection (see block-comments.ts).
        BlockComments,
        ...fixedSurfaceExtensions,
        // The transition to the TITLE, last and in low priority: it does not
        // takes ⌫ and ↑ only if no one else wanted them (title-bridge.ts).
        ...(hasTitle ? [TitleBridge.configure({ onLeaveTop: leaveTop })] : []),
      ] as unknown as Extensions,
    [
      placeholderFor,
      slashItems,
      mentionSuggest,
      leaveTop,
      hasTitle,
      collaboration,
      blocks,
      fixedSurfaceExtensions,
      fixedNodeExtensions,
    ]
  );

  // Activity destroys editor instances while retaining React refs. Keep the
  // current document, including silent remote merges, for the next instance.
  const documentRef = useRef<JSONContent | string | null>(initialContent);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  // Same rule as everywhere in this file: the `editorProps` do not change
  // NEVER identity, otherwise tiptap reapplies everything each time it is rendered. THE
  // uploaders change with each keystroke (their queue is a React state) —
  // they therefore go through a ref, read at the time of the gesture.
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const liveEditorRef = useRef<Editor | null>(null);

  const [fixedSize] = useState(size);
  const editorProps = useMemo(
    () => ({
      ...editorPropsFor(fixedSize),
      handlePaste: (_view: unknown, event: ClipboardEvent) => {
        const files = filesToUpload(event.clipboardData, uploadsRef.current?.imagesOnly);
        if (files && uploadsRef.current) {
          event.preventDefault();
          uploadsRef.current.addFiles(files);
          return true;
        }

        const text = event.clipboardData?.getData("text/plain") ?? "";
        const editor = liveEditorRef.current;
        if (!editor || !insertNotionCalloutPaste(editor, text)) return false;
        event.preventDefault();
        return true;
      },
      handleDrop: (
        view: {
          posAtCoords(coords: { left: number; top: number }): { pos: number } | null;
        },
        event: DragEvent,
        _slice: unknown,
        moved: boolean
      ) => {
        // `moved`: it is a block of the document that we move, not a file
        // that we bring. ProseMirror knows how to do it, and much better than us.
        if (moved) return false;
        const files = filesToUpload(event.dataTransfer, uploadsRef.current?.imagesOnly);
        if (!files || !uploadsRef.current) return false;
        event.preventDefault();
        // At the DROP location, not at the end of the document: that's all that
        // the gesture means.
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        uploadsRef.current.addFiles(files, { at: at?.pos });
        return true;
      },
    }),
    [fixedSize]
  );

  // A live editor stays read-only until its session is attached: a recreated
  // editor waits while the stream finishes the batch its predecessor had in
  // flight and rebases it (MIN-688).
  const [attached, setAttached] = useState(() => !collaboration || collaboration.stream.attached);
  const canEdit = editable && (attached || !collaboration);
  const [immediate] = useState(() => immediateRender && typeof window !== "undefined");
  const editor = useEditor({
    immediatelyRender: immediate,
    editable: canEdit,
    extensions,
    content: documentRef.current,
    editorProps,
    onBeforeCreate: ({ editor }) => {
      // Read the ref at creation time: useEditor may recreate from options
      // captured before the last transaction or before the tab was hidden.
      // A Markdown string is still the untouched initial value, which
      // tiptap-markdown has already parsed in its own hook: assigning it again
      // here would replace that parse with the raw text.
      if (typeof documentRef.current !== "string") editor.options.content = documentRef.current;
    },
    onTransaction: ({ editor, transaction }) => {
      if (!transaction.docChanged) return;
      documentRef.current = editor.getJSON();
      // Only a gesture made HERE is sent; received steps, resets and rebases
      // already belong to the authority's history.
      if (collaboration && !isCollabRemoteTransaction(transaction)) {
        collaboration.stream.noteLocalChange();
      }
    },
    onSelectionUpdate: ({ editor }) => {
      if (!collaboration?.canSend || !editor.isFocused) return;
      const { anchor, head } = editor.state.selection;
      collaboration.publishCaret({ anchor, head });
    },
    onFocus: ({ editor }) => {
      onFocusRef.current?.(editor);
      if (!collaboration?.canSend) return;
      const { anchor, head } = editor.state.selection;
      collaboration.publishCaret({ anchor, head });
    },
    onBlur: ({ editor }) => {
      collaboration?.publishCaret(null);
      onBlurRef.current?.(editor);
    },
    onUpdate: ({ editor, transaction }) => {
      // Rebuilding mention pills is presentation-only. Persisting that
      // transaction would attribute a write to the viewer who opened the page.
      if (transaction.getMeta(MENTION_HYDRATION_META)) return;
      onChangeRef.current?.(editor.getJSON(), editor);
    },
  });
  liveEditorRef.current = editor;

  // Agent writes round-trip mentions through Markdown, where they intentionally
  // become plain text. Rebuild their editor nodes once the mention index is
  // available so the surface renders the same pills as a human-authored document.
  //
  // In a live session (MIN-688) that rebuild IS a change of the shared
  // document, so it is sent — as a presentation-only batch the authority
  // verifies against the Markdown projection and records without signing the
  // document. It therefore needs a writer, and nothing else pending: a reader's
  // screen must never drift from the document every other step applies to.
  const scan = mentions?.scan;
  useEffect(() => {
    if (!editor || !scan || editor.isFocused) return;
    if (collaboration && (!collaboration.canSend || !attached)) return;
    queueMicrotask(() => {
      if (editor.isDestroyed || editor.isFocused) return;
      if (collaboration && (collaboration.stream.hasPending() || !collaboration.canHydrate())) return;
      hydrateMentions(editor, scan, { exact: !!collaboration });
    });
  }, [editor, scan, collaboration, attached]);

  // The live session drives this editor while it is mounted. Detaching keeps
  // what was not yet confirmed: the stream carries it on its own and rebases
  // the next editor onto it (Activity recreates editors while hidden).
  useEffect(() => {
    // A destroyed instance is about to be replaced: never attach the session
    // to it (MIN-728, editors built during render).
    if (!editor || editor.isDestroyed || !collaboration) return;
    const host = {
      getState: () => editor.state,
      dispatch: (transaction: Parameters<typeof editor.view.dispatch>[0]) => {
        if (!editor.isDestroyed) editor.view.dispatch(transaction);
      },
      ready: () => !editor.view.composing,
    };
    const stopAttached = collaboration.onAttachedChange(setAttached);
    collaboration.stream.attach(host);
    setAttached(collaboration.stream.attached);
    const stopCarets = collaboration.onCaretsChange(() => {
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(pageCaretsKey, true));
    });
    return () => {
      stopCarets();
      stopAttached();
      collaboration.publishCaret(null);
      collaboration.stream.detach(host);
    };
  }, [editor, collaboration]);

  // `useEditor` reads `editable` only when it creates the editor: on later
  // renders it reapplies the options but keeps the instance's own editability.
  // The live editor is created before its session attaches, so the switch to
  // editable must be made on the instance itself.
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.isEditable !== canEdit) {
      editor.setEditable(canEdit, false);
      // Node views re-read editability on a transaction (useEditorEditable):
      // an empty one, outside the history and the document.
      editor.view.dispatch(editor.state.tr.setMeta(EDITABLE_CHANGED_META, true)
        .setMeta("addToHistory", false));
    }
  }, [editor, canEdit]);

  // Focus once, after mount, outside the commit phase. A mobile sheet keeps
  // the keyboard down until the user taps (lib/mobile-sheet-focus).
  const [shouldFocus] = useState(autoFocus);
  useEffect(() => {
    if (!editor || !shouldFocus || !allowInputAutoFocus()) return;
    queueMicrotask(() => {
      if (!editor.isDestroyed) editor.commands.focus("end");
    });
  }, [editor, shouldFocus]);

  // The other half of the typing rule: moving the pointer refreshes it.
  // The listener lives as long as the editor is mounted.
  useEffect(() => trackPointerFreshness(), []);

  // In ref: the caller most often gives a `setState`, but nothing
  // requires it — a function remanufactured each time it is rendered would replay the effect
  // below, and therefore would announce `null` on each keystroke.
  const onEditorRef = useRef(onEditor);
  onEditorRef.current = onEditor;

  useEffect(() => {
    if (editor?.isDestroyed) return;
    if (editorRef) editorRef.current = editor ?? null;
    onEditorRef.current?.(editor ?? null);
    return () => {
      if (editorRef) editorRef.current = null;
      onEditorRef.current?.(null);
    };
  }, [editor, editorRef]);

  // The subpage brackets are READ at the time of the gesture, not captured:
  // they arrive with the project cache, after mounting the editor (cf.
  // blocks/subpage.ts). `removed` is the one that counts — it is through him that
  // disappearance of a block becomes a trashing (MIN-272).
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.storage.subpage) return;
    editor.storage.subpage.create = pages?.create ?? null;
    editor.storage.subpage.opened = pages?.opened ?? null;
    editor.storage.subpage.duplicate = pages?.duplicate ?? null;
    editor.storage.subpage.removed = onSubpagesRemoved ?? null;
  }, [editor, pages, onSubpagesRemoved]);

  // The “/” menu of the two MIN-280 blocks: they have nothing to convert, so
  // nothing to do with the conversion — what they are asking for is a BOX OF
  // DIALOG, which the register cannot open itself (it is mounted headless
  // by markdown projection). The block reads its `storage`, the surface places it.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const pick = uploads
      ? (accept: string) => {
          const input = document.createElement("input");
          input.type = "file";
          input.multiple = true;
          if (accept) input.accept = accept;
          input.onchange = () => {
            const files = Array.from(input.files ?? []);
            if (files.length > 0) uploadsRef.current?.addFiles(files);
          };
          // The click remains in the user gesture task (the selection in
          // the menu): this is the only condition for the browser to open the
          // dialog box.
          input.click();
        }
      : null;
    editor.storage.image.pick = pick;
    // Other files belong to pages (MIN-728).
    editor.storage.pageFile.pick = uploads?.imagesOnly ? null : pick;
  }, [editor, uploads]);

  const chrome = !!editor && editable && blockChrome;
  const body = (
    // Neither `relative` nor withdrawal here, and that's the point: the GUTTER of chrome
    // (handle + `+`) is placed to the left of the block hovered over, therefore outside the
    // text column. It is the caller who holds the column — a container
    // positioned, with the gutter reserve on the left —, and the TITLE of the
    // page is in there too.
    // `data-gutter` is not decorative: it is what lights it up, in
    // app/globals.css, extending the hover surface to the left —
    // the one which means that aiming for the margin is enough to make the chrome appear.
    // It is ONLY valid when the gutter exists: without it the body has no left
    // margin, and the negative margin would cause the text to overflow out of
    // its column.
    <div
      className={cn("page-editor", className)}
      data-gutter={chrome ? "" : undefined}
    >
      {chrome && <BlockGutter editor={editor} onComment={onComment} blockLinks={blockLinks} />}
      {/* The selection toolbar (bold, italic, link…) belongs to the editor,
 on every surface (MIN-728); a page adds the comment action. Outside pages it
 floats over the document, since comment fields and dialogs scroll. */}
      {editor && editable && (
        <PageCommentBubble editor={editor} onComment={onComment} floating={blocks !== "page"} />
      )}
      <EditorContent editor={editor} className={contentClassName} />
      <MarkdownLinkMenu editor={editor} />
      {/* The RESERVE at the bottom: around ten empty lines under the last
 block, clickable, which return the cursor to the end of the document.
 This is NOT around ten empty paragraphs — these would start in
 base, would emerge in the markdown that the agent reads, and would accumulate
 on each visit. The void is layout; only the
 click writes, and it only writes a paragraph, and only if one is missing (`focusDocumentEnd`). */}
      {editor && editable && bottomReserve && (
        <div
          aria-hidden
          className="min-h-[15rem] w-full cursor-text"
          // `mousedown` rather than `click`, and `preventDefault` with: without that
          // the browser first places the cursor where it wants (often zero
          // leaves, the area is not editable), and we see him jump.
          onMouseDown={(event) => {
            event.preventDefault();
            focusDocumentEnd(editor);
          }}
        />
      )}
    </div>
  );

  // Two contexts for two node views, and the same reason on both sides:
  // the subpage block and the mention pill are mounted at the very bottom, in
  // portals under `EditorContent`, and have no way to fetch
  // themselves the title of a page or the project of a cited ticket.
  const withLinks = (
    <MentionLinksProvider value={mentionLinks ?? null}>
      {uploads ? (
        <PageUploadsProvider value={uploads}>{body}</PageUploadsProvider>
      ) : (
        body
      )}
    </MentionLinksProvider>
  );

  return pages ? (
    <PagesLookupProvider value={pages}>{withLinks}</PagesLookupProvider>
  ) : (
    withLinks
  );
}
