---
{
  "id": "pages",
  "locale": "en",
  "title": "Pages",
  "summary": "Build a project wiki, edit and discuss pages, manage files and history, publish or export content, and find the supported database import workflow.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P01",
    "P02",
    "P03",
    "P04",
    "P05",
    "P06",
    "P07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 21,
  "sourceRevision": 21,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/pages.md",
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx",
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx",
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts",
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts",
      "components/pages/page-publish-dialog.tsx",
      "app/p/[token]/page.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/use-semantic-mentions.ts",
      "components/markdown-mention.tsx",
      "components/editor/comment-editor.tsx",
      "docs/page-collaboration.md",
      "lib/use-page-collaboration.ts",
      "lib/page-collaboration-stream.ts",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/page-database-view.tsx",
      "lib/server/page-database-views.ts",
      "components/pages/page-comment-bubble.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "components/editor/rich-editor.tsx",
      "components/pages/page-extensions.ts",
      "components/pages/blocks/image.ts",
      "lib/pages-markdown.ts",
      "components/pages/blocks/subpage.ts",
      "lib/server/pages.ts",
      "lib/pages-subpage.ts",
      "lib/pages-export.ts",
      "components/public-page-body.tsx",
      "components/pages/page-comment-dialog.tsx",
      "lib/keyboard/shortcuts.ts",
      "components/editor/find-bar.tsx",
      "components/editor/find-replace.ts",
      "lib/keyboard/find-shortcut.ts",
      "components/pages/blocks/math.ts",
      "components/editor/math-edit-menu.tsx",
      "components/code-block-lowlight.ts",
      "app/globals.css",
      "components/pages/page-peek-panel.tsx",
      "components/global-page-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/pages/block-gutter.tsx",
      "components/editor/suggestion-menu.tsx",
      "components/editor/suggestion-chip.ts",
      "components/editor/suggestion-menu.test.tsx",
      "components/editor/block-selection.ts",
      "components/editor/document-editor.tsx",
      "app/tokens.css",
      "components/pages/block-actions.ts",
      "lib/selection-menu-visibility.test.ts",
      "lib/mention-menu.ts",
      "components/pages/block-menu.tsx",
      "lib/action-menu-search.ts"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:claude-code (block menu search field reaching every action, block types and colors included, with submenu entries shown behind their path such as Turn into › Heading 1 (MIN-845), checked against components/pages/block-menu.tsx, components/issue-context-menu.tsx and lib/action-menu-search.ts; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the changed controls)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "notifications-and-inbox",
    "storage-and-attachments",
    "trash-and-recovery",
    "views",
    "permissions-and-public-links",
    "databases"
  ],
  "aliases": [
    "create-and-organize-pages",
    "page-editor",
    "page-comments-and-collaboration",
    "page-files",
    "page-history",
    "publish-a-page",
    "import-export-and-print-pages"
  ],
  "tags": [
    "Build a project wiki",
    "Write a page with blocks and mentions",
    "Discuss a page and handle conflicts",
    "Attach and retrieve page files",
    "Inspect and restore a page version",
    "Publish a page and revoke its link",
    "Export or print a page"
  ],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-create-menu.png",
      "alt": "Page creation menu offering New page and New database.",
      "caption": "Use the project page controls to choose a document or a database.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        240,
        129
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-editor.png",
      "alt": "Demonstration page with headings, paragraphs, task checkboxes and an issue mention.",
      "caption": "Headings, task blocks and the AUR-2 mention keep the page structured. This is demonstration content.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        1154,
        1046
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-comments.png",
      "alt": "Page activity dialog with a demonstration edit event and an empty comment composer.",
      "caption": "Read page activity and write a comment in the composer. No comment has been submitted in this example.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        608,
        616
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-file-states.png",
      "alt": "Demo page with an unfinished upload and a saved 67-byte file offering Download.",
      "caption": "Check the actual file state: the second attachment is available, while the first unfinished upload is not.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        466
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-history-preview.png",
      "alt": "Versions tab with an expanded earlier state, its author, Restore and the 30-day retention notice.",
      "caption": "Preview a saved state and compare it with the current page before restoring.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        538
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-publish.png",
      "alt": "Page publication dialog with Private selected and password or bearer-link alternatives.",
      "caption": "Private keeps the page within the project. Review the intended audience before changing publication.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-export.png",
      "alt": "Document export menu with Markdown (.md) and Print / PDF.",
      "caption": "Choose Markdown to download the document, or Print / PDF to open the printable view.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-file-preview",
      "kind": "screenshot",
      "src": "/documentation/en/file-preview.png",
      "alt": "Full-window CSV reader with sample project tasks, a large Close button and a File actions menu offering Download, Rename and Remove.",
      "caption": "The shared file reader keeps Close below the preview. The File actions menu offers Download and, when permitted, Rename and Remove.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps",
    "page-file-preview"
  ]
}
---

Pages hold a project’s wiki, with documents, nested pages and database entries. Use the sections below to organize and edit content, collaborate, manage files and versions, publish a branch or export it. Imports start from an empty database, as explained in the [Databases guide](/docs/databases#import-a-database).

## Build a project wiki {#create-and-organize-pages}

Open Pages in a project as its owner or a Member; readers can open pages but cannot create them. Use the + menu and choose a page for a document or a database for a structured list. Give the page a useful title and write the specification, decision or procedure it should preserve.

Create subpages for related documents and use the tree controls to move or reorder them. A page cannot become a descendant of itself. Duplicating a page creates new content rather than a live reference to the original. Review the duplicate's branch before editing or sharing it. To create a subpage while writing, type `/` and choose **Sub-page**: minddy creates the child page under the current one, inserts its mention at the cursor followed by a space, then opens the new page in the side panel beside the page you are writing in; choose **Expand** to open it in full. You can keep typing after the mention on the same line, like after any mention. A page created from the sidebar opens in full. An older page can still show subpage blocks: the first time someone who can edit opens it, each block becomes a line holding only the child's mention, and comments and block links keep pointing at it. Opening the page as a reader converts nothing. When you duplicate a page with its subpages, mentions of the copied pages point to the copies, including mentions inside sentences.

### Favorites and deletion {#page-tree}

Favorite a page to surface it at the top of the project's page tree. These favorites are shared within the project, unlike a private notebook note. Link a page to an issue when the current document is task context; the resource's title follows page renaming. From the open page's `…` menu, **Copy** offers **Copy link** and **Copy page content**, which copies the title and body as Markdown (not offered on a database). Command+Shift+L on macOS or Ctrl+Shift+L on Windows/Linux copies the open page's link.

Deletion sends supported page work to trash. From a page menu, **Move to trash** first asks for confirmation, naming the page and how many sub-pages go with it; they stay restorable from the trash for 30 days. Deleting a mention never moves a page to the trash. Moving a child page to the trash from the tree removes the parent's line that holds only its mention; restoring the page adds that line back at the end of the parent, unless the parent still mentions it elsewhere. A mention inside a sentence is never removed. Check the selected branch before deleting and use recovery rather than recreating a lost page when its content should be retained. Entries with stored database values can be reordered within their database but cannot be moved outside it. If a move is rejected, inspect the hierarchy and entry type instead of forcing it through repeated attempts.


![Page creation menu offering New page and New database.](/documentation/en/page-create-menu.png)

## Promote a page to an issue {#promote-page-to-issue}

When a page describes work to do, the owner or a Member can turn it into an issue with Numo. Readers do not see this action. Promotion needs available AI usage or a compatible personal key.

1. Choose **Promote to issue** from the page’s menu in the page tree (`…` or a right-click on the row) or from the `…` menu of the open page (**Page options**). The same action is offered for a database entry opened in the side panel, and in the handle menu of a single entry, as described in the [Databases guide](/docs/databases#entry-actions).
2. If the open page has unsaved changes, minddy saves them first. If that save fails, minddy reports that the page could not be saved and Numo does not open. Promote the page again once it has saved.
3. Numo opens in the page’s project with the page as context and receives a request to read its title, its content and, for a database entry, its properties. When the page is unclear, or when a database leaves the issue’s scope ambiguous, Numo asks questions before creating anything. Answer them in the conversation.
4. Numo creates one issue and attaches the page to it. Open the issue and check its identifier, scope, properties and the attached page.

Unlike a promoted notebook task, the page is not removed: it stays in its place in the tree, with its content and subpages. If creation fails or the result is unclear after a network error, search for the issue before promoting the page again.

## Write a page with blocks and mentions {#page-editor}

Open the page and edit its title or body as the owner or a Member. Readers can open and read pages, but cannot edit, import, duplicate, favorite or publish them, or restore a version. Use the slash-command menu and formatting controls to insert headings, text, bullet, numbered and task lists, quotes, callouts, code blocks, equations, dividers, toggles (collapsible sections), sub-pages, images and files. A callout can have an emoji icon and palette color; choose them to distinguish useful information rather than as the only way to communicate a warning. An **Equation** is written in LaTeX and rendered with KaTeX. Choose it in the `/` menu for an equation on its own line, or type LaTeX between `$$` in a sentence, as in `$$x^2$$`, for one inside the text. Click an equation to edit its LaTeX with a live preview, in a popover on a computer or a sheet on a phone. LaTeX that cannot be rendered shows in red with a message, and saving an equation empty removes it.

The `/` menu lists blocks under **Basic blocks**, **Lists** and **Advanced blocks**, and the `@` menu groups what you can mention by type, such as **People**, **Issues** or **Pages**. While a menu is open, the `/` or `@` and what you type after it show as a highlighted chip in the text, with **Type to search** until you type a letter. The arrow keys move through every section, and Enter or Tab chooses. Press Escape, type two spaces in a row or choose **Close menu**, at the bottom of the menu, to close it: what you typed stays as plain text. A space right after the `/` or `@` alone also closes the menu. Once you have typed a search, a single space stays part of it, so `/bullet list` or `@Camille Roy` searches as typed. The menu also closes when the search matches nothing, unless a search by meaning is still running.

Use mentions to link relevant issues, objectives, people or pages. Type `@` followed by an identifier, a name or a title, which may contain single spaces; the menu closes in the same ways as the `/` menu, and when you choose an item. A word that describes the work rather than naming it also lists issues found [by meaning](/docs/navigation#search-by-meaning) under **Related by meaning**, after the text matches. Backlinks help readers find pages that reference the current one. A link supplies context rather than granting a reader access to another project's private object. A mention of a page that has no title yet reads **Untitled**.

Clicking a page mention, a backlink, a page attached to an issue or objective, or a link to a page in a comment or a Numo answer opens that page in a side panel above what you were reading. Read or edit it there, choose **Expand** to open the full page, or close the panel to return. Between **Expand** and close, the panel's **Page options** menu (`…`) offers the same actions as on the full page; moving the page to the trash from there closes the panel and leaves you on the page underneath. A database opens in the panel too, with the compact toolbar described in the [Databases guide](/docs/databases#database-display); an entry opened from its table takes its place, and **Back**, at the top left of the panel, returns to the table.


![Demonstration page with headings, paragraphs, task checkboxes and an issue mention.](/documentation/en/page-editor.png)

### Format text and write on a phone {#editor-formatting}

Pages, descriptions, comments and the task notebook share the same editor. Select text, or whole blocks as described below, to open the selection toolbar. Its first row shows the current block type: choose it to open **Turn into** and change the block. Then come **Color**, for the text or background, **Bold**, **Italic**, **Underline**, **Strikethrough**, **Code**, **Add link** (or **Remove link** on a link), **Inline equation**, which turns the selected text into an inline equation or back, **Clear formatting** and **Copy**, which copies the selection. On a computer, an **Ask Numo** row sends the passage to Numo, as described in the [Numo guide](/docs/numo#work-with-numo), and on a page a **Comment** row anchors a comment on the selection. **Turn into** marks only the type of the block the selection is in. In the color lists, here and in the block menu, each color appears by its name, written in that color or on that background. Clicking outside the editor ends the selection and hides the toolbar, and so does choosing **Comment**. Tooltips show the shortcuts: Command+B, Command+I, Command+U, Command+Shift+S and Command+E on macOS, or Ctrl with the same keys on Windows/Linux. In an editor, Command/Ctrl+B makes text bold; elsewhere it still shows or hides the sidebar. In a code block, the toolbar shows only the block type, **Color**, **Copy**, **Ask Numo** and **Comment**: a text color overrides the code's syntax highlighting, a background color keeps it, and the default color restores it. Text and background colors are not kept in Markdown. The toolbar follows the selected passage while the page scrolls and closes once the passage scrolls out of view.

Shift+Enter starts a new line inside the same block. Command/Ctrl+Enter does not insert a line break: in a comment or another composer it sends, whichever send shortcut you chose in your [preferences](/docs/accounts#preferences), and if you chose Enter as the send shortcut, Enter sends too.

To select whole blocks, drag from one block into another, or draw a selection rectangle from outside the text: press in the margin beside it or in the empty space below the page, then drag over the blocks. Every block the rectangle touches is selected; a click there without dragging still puts the cursor on that line, and Escape cancels the rectangle. Every block the drag reaches is highlighted with rounded corners, in the color of selected text. When a single block is selected, the selection toolbar opens above it: its actions (**Turn into**, **Color**, **Bold** and the other formats, **Copy**, **Ask Numo**, **Comment**) apply to the block, and after **Turn into** it stays selected so another action can follow. With several blocks selected, the toolbar stays hidden: open the menu of a selected block's handle, which acts on all of them. Shift-click another block, or press Shift+Up or Shift+Down at the edge of a block, to extend the selection by whole blocks. Escape selects the block you are writing in, and Escape again clears the selection. Command+A on macOS or Ctrl+A on Windows/Linux first selects the text of the block you are in, a code block included, and pressed again selects every block. With blocks selected, the Up and Down arrows select the block above or below, Shift+Up and Shift+Down add or remove blocks, Backspace or Delete deletes them, Command/Ctrl+C copies them, Command/Ctrl+X cuts them, and Enter on a single block puts the cursor at its end; typing does nothing. The block menu acts on every selected block. Type in the block menu's search field to reach any of its actions, block types and colors included: an entry from a submenu shows its path, such as **Turn into** › **Heading 1**. Images, files, code blocks, equations, dividers, mentions and inline code show the same highlight when they are selected, on their own or within a selection. While you write or edit a comment, Escape keeps closing or canceling it. On a touch screen, long-press still selects text, and a drag does not select blocks.

On a phone, the editor shows no block handles or selection toolbar, and typing `@` leaves a plain character. While an editor has focus, a floating toolbar sits above the keyboard and hides when the keyboard closes: **Insert a block** (+) lists this editor's blocks, in the same sections as the `/` menu, and inserts the chosen one at the cursor, like `/`; **Mention** (@) lists people, issues, objectives and pages to mention, grouped by type; then come **Bold**, **Italic**, **Strikethrough**, **Code**, **Color** (a sheet for the text or background color), **Add link**, **Outdent** and **Indent** in a list, **Comment** on a page, and **Hide keyboard**, which stays pinned at the right end. A bottom sheet you type in grows to the full screen height, and the line you are typing stays above the keyboard. Long-press selects text in an editor, and the toolbar and its sheets also work in the task notebook. The bottom navigation hides while any text field has focus, such as a page title or a comment. On a touch screen, **Add icon** is always visible on a page.

### Find and replace in a page {#find-and-replace}

While a page is on screen, Command+F on macOS or Ctrl+F on Windows/Linux opens a find bar at the top right of the document, wherever the cursor is; on a page open in the side panel, it searches that page. Text you had selected becomes the search. Every match is highlighted, the current one more strongly, and the bar shows its position, such as 2 of 7. Enter goes to the next match and Shift+Enter to the previous one; Command/Ctrl+F again selects the search text. **Match case**, **Whole word** and **Regular expression** refine the search; an invalid expression is flagged and highlights nothing. The search covers the page body, not its title.

If you can edit the page, **Show replace** adds a field for the replacement text, with **Replace**, which replaces the current match and moves to the next one, and **Replace all**. In a regular expression, `$1` to `$9` insert the matching groups and `$&` the whole match; a plain search inserts the text exactly as typed. A replacement is an ordinary edit: it saves and reaches the other editors like typing, and Command/Ctrl+Z undoes it, a **Replace all** in one step. Escape closes the bar and returns to the text. The task notebook has the same bar. Elsewhere in minddy, and when another dialog is open over the page, Command/Ctrl+F opens the browser's find.

### Saving and portability {#editor-save}

A page saves as you type: each change reaches the server within a moment, and the save indicator shows saving until the server has accepted it. Several people can edit the same page at the same time, including the same paragraph or the title. Each person's changes appear for the others as they type, and so do the edits Numo or an MCP-connected agent makes to the page.

If the connection drops, keep the page open. Unsaved changes stay on the page and are sent when the connection returns; changes from others arrive at the same time and merge with yours. minddy opens another page only once your changes are saved: while they cannot be sent, it keeps you on the page and says the save failed. Closing a browser tab with unsaved changes asks you to confirm first; quitting the desktop app does not ask, and unsaved changes are lost. If you lose access to the page or your edit rights while changes are unsaved, minddy undoes them and shows a message. When the server refuses a change, for example a title longer than 500 characters or a link whose protocol is not allowed, minddy undoes that change and shows a message. Page history can help inspect earlier saved versions.

Markdown exports and agent page reads preserve callout icons and colors in their supported representation. A resized image keeps its width too, written as the image title (`![alt](src "width=60%")`), so edits by Numo, MCP agents or the task notebook do not reset it. Agents read and write a page mention as `[@Title](mention:page/<id>)`; the older `[[page:<id>]]` form is still accepted and read as the same mention, inline too. Equations travel as LaTeX: `$E = mc^2$` inside a line, and a block between two `$$` lines. A dollar amount such as `$5` stays text. Export formats have different fidelity and attachment handling, so check the resulting document before replacing an original source. Use code blocks for literal commands and retain their prerequisites and warnings in the surrounding text.

## Discuss a page and handle conflicts {#page-comments-and-collaboration}

Open a project page and its comment controls. Select relevant content when creating an anchored comment, explain the question or proposed change, and use mentions to involve a project member. A reader can comment when the owner turned on **Can comment** for them. Reply in the thread to keep the decision with the context it concerns. Resolve a thread when its question has actually been addressed. A block's thread opens in a dialog on a computer and in a bottom sheet on a phone, rather than beside the block: it shows the quoted passage, the existing discussions with their replies and a field for a new comment. Open it from the block's comment badge, **Comment** in the selection toolbar or the block menu. On a computer, hovering a block without comments shows a **Comment on this block** button at its right, at the height of the block handle; a commented block shows its comment badge there instead. Hovering that button highlights its block like a selection. This button is not shown on a phone.

Presence `avatars` identify people viewing the page. While someone edits, their caret and selection appear in the body and in the title, in a color of their own and labeled with their name. A reader's caret is not shown. A caret shows where someone is working, not that their text is saved: the save indicator reflects your own changes only.


![Page activity dialog with a demonstration edit event and an empty comment composer.](/documentation/en/page-comments.png)

### Recover a save conflict {#page-conflict}

Simultaneous edits merge automatically, character by character, including inside the same paragraph. A conflict banner can still appear when minddy has to reload the page while you have unsaved changes: after a disconnection during which many changes were made, or after a change made without live editing, such as an import into a database. If your changes and the reloaded version altered the same top-level block, the document keeps the reloaded version of that block and the banner offers yours for review.

Compare the named block with the current document. Choose Restore mine only when replacing that block with your version is intended. If your conflicting action was a deletion, Delete it again applies that deletion explicitly. Dismiss keeps the adopted document and closes the warning; it does not restore your version. Preserve any wanted text before dismissing, and use history to inspect saved versions when a broader recovery is needed. These choices affect the identified block rather than blindly replacing the whole page.

A missing thread anchor can follow document edits; read the discussion before moving or deleting the referenced block. Comments and activity are internal to the project unless content is explicitly published through a supported sharing path. Use a published-page test to determine the visitor's actual view rather than assuming that project collaboration controls become public.

## Attach and retrieve page files {#page-files}

Open the page as a project member and use its attachment or upload controls. Select a nonempty file within the 10 MB per-file limit. Your account or instance storage quota can impose an additional limit. Keep the original until the upload succeeds.

Images can be inserted as image blocks, and other documents can be attached as file blocks. The server determines the stored media type from the bytes rather than trusting the filename or browser label. Upload acceptance does not guarantee that every format has an inline preview; use the file download when a preview is unavailable.

In the project editor, click an image or the name of a supported file block to open the same full-window reader used by issue attachments. Markdown (`.md`), plain text (`.txt`, `.text`), CSV, PDF and supported audio or video open in dedicated containers. Use Close or Escape to return to the page. The File actions (`…`) menu offers Download. In an editable page, a file block also offers Rename, which changes the name shown in the page, and images and files offer Remove: it asks for confirmation, then removes the block from the document, and you can undo it in the editor. The file block also keeps its direct Download control. Unsupported formats, external file links and file blocks on published pages retain their download behavior. Published images use the reader without a removal action.

![Full-window CSV reader with sample project tasks, a large Close button and a File actions menu offering Download, Rename and Remove.](/documentation/en/file-preview.png)

Check that the file appears in the page and open or download it. File bytes live in Storage, while the page and file metadata determine access. A successful page save alone does not prove the file bytes are available.

### Shared files and failures {#file-access}

A file referenced on a published page can be made available to that page's visitors. Files from pages outside the published branch are not made available merely because another page contains a reference. Review the page and children included in publication before sharing.

If upload fails, check the size, quota and error message. A self-hosted operator should also verify Storage configuration and policies. For a missing file after restoration, recover the matching raw Storage bytes and metadata; a database-only restore cannot recreate the file. Published file URLs are signed for up to 24 hours when the page is rendered. Revoking a share stops new authorized page visits but does not immediately invalidate file URLs already delivered; those can remain usable until their expiry. Downloaded copies cannot be recalled.


![Demo page with an unfinished upload and a saved 67-byte file offering Download.](/documentation/en/page-file-states.png)

## Inspect and restore a page version {#page-history}

Open the page's save/history indicator to view versions, or its comments/activity control to inspect actions. These tabs answer different questions: a saved version is a document state, while activity can include renaming, deletion or restoration without the same content snapshot.

Select a version to preview it before restoring. The history identifies authors and agent activity, so compare the content with the change you intend to undo. The interface announces a 30-day history window; do not treat history as a permanent external backup.

### Restore and verify {#restore-page-version}

As an authorized project member, restore the selected version only after reviewing the current content it will replace. The pre-restore state itself enters history, which supports recovering that state later while it is retained.

Reopen or refresh the page editor after restoration and check its actual body. A previously open editor holds an outdated version and must not blindly overwrite the restored state. Page versions are not complete instance backups: attachment bytes, deleted files or related objects can have separate lifecycles. Use the [page-file section](#page-files) and [instance restoration procedure](/docs/backups-and-restoration#restore-and-roll-back) when the missing information is outside the saved document body.


![Versions tab with an expanded earlier state, its author, Restore and the 30-day retention notice.](/documentation/en/page-history-preview.png)

## Publish a page and revoke its link {#publish-a-page}

Open a project page as the owner or a Member and use its publication controls. Review the content and attachments first. Choose private, password-protected or public access. Password protection requires at least eight characters and is applied after submitting the password; selecting the mode alone does not create a protected link.

Copy the generated /p/ link after publication succeeds. If the page has descendants, review the include-children option and count. Including children publishes the selected branch; excluding them keeps their content outside that publication. A database without published children does not expose all its entry bodies automatically.

Open the link in a separate browser session without your account. Test the password if enabled, page content, intended subpages and file downloads. A mention of a page in the published set shows its title and opens it under the same link; a mention of any other page shows **Sub-page not published** and does not open. This verifies the visitor's read-only access rather than your broader member permissions.


![Page publication dialog with Private selected and password or bearer-link alternatives.](/documentation/en/page-publish.png)

### Revoke and check {#revoke-page}

Return to publication controls, choose private and confirm with **Unpublish**: the old link stops working, and publishing again creates a new link. After successful revocation, open the old link anonymously and check that access is denied. Copies or screenshots already received cannot be recalled. File download URLs already delivered by a published page are signed for up to 24 hours. Revocation prevents new page visits but those previously issued file URLs can remain valid until they expire.

User page links remain `noindex` and are separate from the indexed official manual. Noindex is a discovery policy, not an access password. If a child or file is unexpectedly readable, revoke first, inspect the published branch and retest before forwarding a corrected link. Files belonging to unpublished pages do not gain access merely through an internal reference.

## Export or print a page {#import-export-and-print-pages}

Open the page’s document menu, then Export. Choose Markdown for a page (.md) or a branch (.zip), PDF to open the print view, or the database archive when the page is a database. Review the offered scope before confirming; a page, its branch and a database archive have different contents.

Open the resulting export and verify headings, callouts, links and attachments needed by its reader. In the export, mentions show the pages' current titles, and mentions of pages included in the export become relative links. The PDF action opens a readable print view rather than the entire application navigation. Use the browser’s print controls to print or save a PDF. There is no general import action in the document menu; supported imports are started from an empty database, as described in the [database import section](/docs/databases#import-a-database).


![Document export menu with Markdown (.md) and Print / PDF.](/documentation/en/page-export.png)

### Database archives and limits {#export-fidelity}

A database archive (.zip) includes its branch: Markdown and CSV, exact schema and option colors, values, bodies, timestamps, nested pages and file bytes. Import it into a new empty database to restore that structure. Saved database views are not part of the archive: recreate them after the import. Duplicating a database keeps its views.

An export is not a transfer of passwords, account provider credentials or subscriptions. For moving account work between instances, use the [account-data transfer guide](/docs/transfer-between-instances). If an imported format cannot preserve a block or external property, inspect the result before relying on it as a replacement. Do not delete the original merely because a download file was created.


## Routines for new entries {#entry-routines}

The project owner can choose this database as a routine trigger in [Routines](/docs/scheduled-routines#conditions). Conditions use the entry’s typed properties. An empty entry can stay waiting until its properties are filled. Creation, duplication, database import and an allowed move into the database count as arrivals; restoration does not. Removing a referenced property or changing its type requires correcting the routine filter.
