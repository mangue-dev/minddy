"use client";

// The one-page editor — editing, and nothing but editing.
//
// Ce qu'il sait du DOCUMENT tient en un appel : `pageExtensions()`. Il ne nomme
// no block, and this is the property that must be kept — the day we add
// a table block, this file does not move. And this same call is the one made
// the markdown projection (lib/pages-markdown.ts): the editor and the agent read
// the same schema, by construction.
//
// What it adds on top, and which does not affect the document:
// - `NodeRange`: selection of several blocks with a drag or a ⇧-click,
// on which all menu actions operate ⋯ ;
// - the mention pill (components/markdown-mention.tsx) placed on the node
// bare of the schema, and its suggestion “@”;
// - the “/” menu, connected to the register, and the chrome of the block
// (components/pages/block-gutter.tsx): the margin on hover and the menu ⋯.
//
// What is NOT here: the versioned backup, which is MIN-271 — this
// editor just renders its JSON on each keystroke.

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  EditorContent,
  useEditor,
  type Editor,
  type Extensions,
  type JSONContent,
} from "@tiptap/react";
import { NodeRange } from "@tiptap/extension-node-range";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import {
  MentionNode,
  MentionSuggest,
  type MentionSuggestOptions,
} from "@/components/markdown-mention";
import { pageExtensions } from "@/components/pages/page-extensions";
import { taskItemNodeView } from "@/components/scratchpad/task-item-view";
import { subpageNodeView } from "@/components/pages/blocks/subpage-view";
import { imageNodeView } from "@/components/pages/blocks/image-view";
import { fileNodeView } from "@/components/pages/blocks/file-view";
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
import {
  MentionLinksProvider,
  type MentionLinks,
} from "@/components/mention-links";
import {
  PageSlashCommand,
  pageSlashItems,
} from "@/components/pages/page-slash-command";
import {
  PagesLookupProvider,
  type PagesLookup,
} from "@/components/pages/pages-lookup";
import { TitleBridge } from "@/components/pages/title-bridge";

export { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks";

/* Body typography. Same bias as the notebook: the edition IS
 the preview, there is no raw markdown mode. */
const PROSE = cn(
  "text-base leading-relaxed break-words outline-none",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2",
  // TEXT links. `:not(.editor-node-link)` excludes rendered anchors
  // by a node view (the subpage block, the pill of a mention):
  // `.ProseMirror a` has stronger specificity than a utility class
  // placed on the anchor, so without this exception a block can NOT be
  // depict — he inherited the color of the ties and wore a second
  // underline over his.
  "[&_a:not(.editor-node-link)]:text-primary",
  "[&_a:not(.editor-node-link)]:underline",
  "[&_a:not(.editor-node-link)]:underline-offset-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
  "[&_li]:my-0.5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[1em]",
  "[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
  "[&_h2]:mt-5 [&_h2]:mb-1.5 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-border"
  // The leaflet is NOT here: its node view does not render `<details>` but
  // three `div[data-type]`, which these selectors never touched. Its
  // layout lives in app/globals.css, along with the rest of what needs to be aimed at
  // attributes rather than tags.
);

/** Fixed at the module level: tiptap rereads the options each time it is rendered and
 reapplies everything that has changed IDENTITY, from its own effect. With
 React node views in the middle (tasks, subpages), it amounts to
 `flushSync` in the middle of the commit phase — which React refuses. Same rule as the
 notebook: nothing must move from one rendering to another. */
const EDITOR_PROPS = {
  attributes: { class: PROSE },
  scrollMargin: { top: 0, right: 0, bottom: 160, left: 0 },
  scrollThreshold: { top: 0, right: 0, bottom: 160, left: 0 },
  // Clicking on the anchor of a node view does not belong to the Link extension:
  // the why, and the two navigations that he avoided, are in
  // components/editor-node-link.ts.
  handleClick: (_view: unknown, _pos: number, event: MouseEvent) =>
    handleNodeLinkClick(event),
  // Writing expires the pointer: as long as you have not moved the mouse again, the
  // task that it hovers no longer takes ⇧A/⇧P (see hover-keys.ts). Same rule
  // than the notebook, and for the same reason — a page is editable from start to finish
  // bout, so “typing wins as long as you write” is the only thing that
  // separate the shortcut from the letter. The signal is the STRIKE, not the
  // change of document: the arrows are there, a programmed insertion is not.
  handleKeyDown: () => {
    noteTyping();
    return false;
  },
};

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
function filesToUpload(transfer: DataTransfer | null): File[] | null {
  const files = Array.from(transfer?.files ?? []).filter((file) => file.size > 0);
  if (files.length === 0) return null;
  if (files.some((file) => file.type.startsWith("image/"))) return files;
  const text = transfer?.getData("text/plain") ?? "";
  return text.trim() ? null : files;
}

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
  editable = true,
  className,
}: {
  /** The body of the page in JSON ProseMirror — storage (markdown is a
 projection, cf. MIN-269). Read at MONTAGE only: tiptap does not read
 `content` afterwards, and a remote write is adopted by `editorRef`. */
  initialContent: JSONContent | null;
  onChange: (content: JSONContent) => void;
  /** How to resolve a subpage, and how to create one (MIN-272). */
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
 * Page uploads (MIN-280): which places an image block or
 * file and follows it to its final address.
 *
 * Optional, like `pages`: without it the editor makes the blocks already there but
 * doesn't accept new ones — that's exactly what's needed to preview a
 * version of the history, which is read-only.
 */
  uploads?: PageUploads & { addFiles: (files: Iterable<File>, options?: { at?: number }) => void };
  /** Quotable “@” — same options as in an issue description. */
  mentions?: MentionSuggestOptions;
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
 *
 * Optional like `pages` and `uploads`: without hook, no bubble. It is this
 * that is needed to preview a version of the history, which is read
 * only and where there is nothing to discuss.
 */
  onComment?: (anchor: PageCommentAnchor) => void;
  /**
 * READ-ONLY (MIN-277): the preview of a version of the history.
 *
 * The non-editable mounted editor rather than a second rendering surface, and
 * this is the same rule as for mentions — the editor IS the surface. A
 * made next door would end up diverging on exactly the blocks that we
 * look at least (a leaflet, a subpage, a pill).
 *
 * What goes out with it: the gutter (handle and `+`), which has nothing to propose on a document that is not modified, and the reserve at the bottom, of which
 * the only role is to return the cursor at the end.
 */
  editable?: boolean;
  className?: string;
}) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");

  const slashItems = useMemo(() => pageSlashItems(t), [t]);

  // Memorized: tiptap reapplies everything that changes identity between two
  // rendered, and a remade function each time would remount the plugin.
  const placeholderFor = useMemo(() => pagePlaceholder(t), [t]);

  // The fold button of the leaflet is rendered by a node view without React: it
  // cannot read the catalog itself, we ask it here (see details.ts).
  setDetailsLabels({ expand: t("toggleExpand"), collapse: t("toggleCollapse") });
  setCodeBlockLabels({
    copy: tCommon("copy"),
    copied: tCommon("copied"),
    language: tCommon("codeLanguage"),
  });

  // The title bracket goes through a ref, and the function given to the extension
  // NEVER change identity: same rule as the rest of the file — tiptap
  // reapply what moved, and a function remade each time it is rendered
  // would raise the keymap on each keystroke.
  const onLeaveTopRef = useRef(onLeaveTop);
  onLeaveTopRef.current = onLeaveTop;
  const leaveTop = useMemo(
    () => () => {
      onLeaveTopRef.current?.();
    },
    []
  );

  const extensions = useMemo(
    () =>
      [
        // The DIAGRAM of the page, the same one that the markdown projection shows
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
        // outil de page de Numo (cf. blocks/subpage.ts).
        ...pageExtensions({
          mention: MentionNode,
          nodeViews: {
            taskItem: taskItemNodeView(),
            subpage: subpageNodeView(),
            // And for the same reason again (MIN-280): both views read the
            // context of uploads and renders from React.
            image: imageNodeView(),
            pageFile: fileNodeView(),
          },
          extensions: { codeBlock: codeBlockEditorExtension() },
        }),
        ...(mentions ? [MentionSuggest.configure(mentions)] : []),
        // “->” becomes “→” under the fingers, as in the notebook and in
        // <MarkdownEditor> (components/editor-arrows.ts). An INPUT rule,
        // so nothing in the diagram: the markdown projection sees nothing, and
        // the document bears the real arrow.
        Arrows,
        NodeRange,
        // The placeholder is US and not @tiptap/extensions: why
        // is written in block-placeholder.ts, and it fits in two words — the
        // nested blocks, and the cursor read one keystroke late.
        BlockPlaceholder.configure({ text: placeholderFor }),
        PageSlashCommand.configure({ items: slashItems }),
        // The blink of a block. It's a DECORATION and not a class
        // on the element: ProseMirror undoes any DOM mutation that it has not
        // pas faite (cf. block-flash.ts).
        BlockFlash,
        // The EDGE of commented blocks (MIN-282). A decoration too,
        // and for one more reason than blinking: a mark would be
        // content, therefore markdown projection (see block-comments.ts).
        BlockComments,
        // The transition to the TITLE, last and in low priority: it does not
        // takes ⌫ and ↑ only if no one else wanted them (title-bridge.ts).
        TitleBridge.configure({ onLeaveTop: leaveTop }),
      ] as unknown as Extensions,
    [placeholderFor, slashItems, mentions, leaveTop]
  );

  const initialRef = useRef(initialContent);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Same rule as everywhere in this file: the `editorProps` do not change
  // NEVER identity, otherwise tiptap reapplies everything each time it is rendered. THE
  // uploaders change with each keystroke (their queue is a React state) —
  // they therefore go through a ref, read at the time of the gesture.
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  const editorProps = useMemo(
    () => ({
      ...EDITOR_PROPS,
      handlePaste: (_view: unknown, event: ClipboardEvent) => {
        const files = filesToUpload(event.clipboardData);
        if (!files || !uploadsRef.current) return false;
        event.preventDefault();
        uploadsRef.current.addFiles(files);
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
        const files = filesToUpload(event.dataTransfer);
        if (!files || !uploadsRef.current) return false;
        event.preventDefault();
        // At the DROP location, not at the end of the document: that's all that
        // the gesture means.
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        uploadsRef.current.addFiles(files, { at: at?.pos });
        return true;
      },
    }),
    []
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions,
    content: initialRef.current,
    editorProps,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
  });

  // The other half of the rule above: moving the pointer refreshes it.
  // The listener lives as long as the editor is mounted.
  useEffect(() => trackPointerFreshness(), []);

  // In ref: the caller most often gives a `setState`, but nothing
  // requires it — a function remanufactured each time it is rendered would replay the effect
  // below, and therefore would announce `null` on each keystroke.
  const onEditorRef = useRef(onEditor);
  onEditorRef.current = onEditor;

  useEffect(() => {
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
    if (!editor || editor.isDestroyed) return;
    editor.storage.subpage.create = pages?.create ?? null;
    editor.storage.subpage.opened = pages?.opened ?? null;
    editor.storage.subpage.duplicate = pages?.duplicate ?? null;
    editor.storage.subpage.removed = onSubpagesRemoved ?? null;
  }, [editor, pages, onSubpagesRemoved]);

  // The “/” menu of the two MIN-280 blocks: they have nothing to convert, so
  // nothing to do with the conversion — what they are asking for is a BOX OF
  // DIALOG, which the register cannot open itself (it is mounted headless
  // by markdown projection). Same assembly as the hooks of the subpage,
  // just above: the block reads its `storage`, the surface places it.
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
    editor.storage.pageFile.pick = pick;
  }, [editor, uploads]);

  const body = (
    // Neither `relative` nor withdrawal here, and that's the point: the GUTTER of chrome
    // (handle + `+`) is placed to the left of the block hovered over, therefore outside the
    // text column. It is the caller who holds the column — a container
    // positioned, with the gutter reserve on the left —, and the TITLE of the
    // page is in there too. Without that, the two do not share the same
    // left edge and the body looks nested under its title.
    // `data-gutter` is not decorative: it is what lights it up, in
    // app/globals.css, extending the hover surface to the left —
    // the one which means that aiming for the margin is enough to make the chrome appear.
    // It is ONLY valid when the gutter exists: on a public page or
    // printing, the body has no left margin, and the negative margin
    // y would cause the text to overflow out of its column.
    <div
      className={cn("page-editor", className)}
      data-gutter={editor && editable ? "" : undefined}
    >
      {editor && editable && <BlockGutter editor={editor} onComment={onComment} />}
      {/* The “Comment” bubble is placed in SCREEN coordinates: it does not need any positioned parent, and therefore does not request one from this
 container, which deliberately does not have one (see below). */}
      {editor && editable && onComment && (
        <PageCommentBubble editor={editor} onComment={onComment} />
      )}
      <EditorContent editor={editor} />
      {/* The RESERVE at the bottom: around ten empty lines under the last
 block, clickable, which return the cursor to the end of the document.
 This is NOT around ten empty paragraphs — these would start in
 base, would emerge in the markdown that the agent reads, and would accumulate
 on each visit. The void is layout; only the
 click writes, and it only writes a paragraph, and only if one is missing (`focusDocumentEnd`). */}
      {editor && editable && (
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
