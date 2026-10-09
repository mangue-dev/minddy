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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "components/pages/page-comment-popover.tsx",
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
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        264,
        152
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        922
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        625
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps"
  ]
}
---

Pages hold a project’s wiki, with documents, nested pages and database entries. Use the sections below to organize and edit content, collaborate, manage files and versions, publish a branch or export it. Imports start from an empty database, as explained in the [Databases guide](/docs/databases#import-a-database).

## Build a project wiki {#create-and-organize-pages}

Open Pages in a project where you are a member. Use the + menu and choose a page for a document or a database for a structured list. Give the page a useful title and write the specification, decision or procedure it should preserve.

Create subpages for related documents and use the tree controls to move or reorder them. A page cannot become a descendant of itself. Duplicating a page creates new content rather than a live reference to the original. Review the duplicate's branch before editing or sharing it.

### Favorites and deletion {#page-tree}

Favorite a page to surface it at the top of the project's page tree. These favorites are shared within the project, unlike a private notebook note. Link a page to an issue when the current document is task context; the resource's title follows page renaming.

Deletion sends supported page work to trash. Check the selected branch before deleting and use recovery rather than recreating a lost page when its content should be retained. Entries with stored database values can be reordered within their database but cannot be moved outside it. If a move is rejected, inspect the hierarchy and entry type instead of forcing it through repeated attempts.


![Page creation menu offering New page and New database.](/documentation/en/page-create-menu.png)

## Write a page with blocks and mentions {#page-editor}

Open the page and edit its title or body as a project member. Use the slash-command menu and formatting controls to insert headings, paragraphs, lists, task items, code, collapsible sections and callouts. A callout can have an emoji icon and palette color; choose them to distinguish useful information rather than as the only way to communicate a warning.

Use mentions to link relevant issues, objectives, people or pages. Backlinks help readers find pages that reference the current one. A link supplies context rather than granting a reader access to another project's private object.


![Demonstration page with headings, paragraphs, task checkboxes and an issue mention.](/documentation/en/page-editor.png)

### Saving and portability {#editor-save}

Watch the save indicator before navigating away from a substantial edit. If another edit creates a conflict, use the displayed recovery controls and preserve your text; do not assume that both edits merged. Page history can help inspect earlier saved versions.

Markdown exports and agent page reads preserve callout icons and colors in their supported representation. Export formats have different fidelity and attachment handling, so check the resulting document before replacing an original source. Use code blocks for literal commands and retain their prerequisites and warnings in the surrounding text.

## Discuss a page and handle conflicts {#page-comments-and-collaboration}

Open a project page and its comment controls. Select relevant content when creating an anchored comment, explain the question or proposed change, and use mentions to involve a project member. Reply in the thread to keep the decision with the context it concerns. Resolve a thread when its question has actually been addressed.

Presence avatars identify people viewing the page. They do not prove that another person's unsaved text has reached the server or that simultaneous edits are merged automatically. Read the current save state before navigating away.


![Page activity dialog with a demonstration edit event and an empty comment composer.](/documentation/en/page-comments.png)

### Recover a save conflict {#page-conflict}

minddy merges edits to different top-level document blocks when it can preserve both changes. It does not merge simultaneous text edits inside the same block character by character. If both people changed that block, the document retains the remote version and a banner offers your previous block for review.

Compare the named block with the current document. Choose Restore mine only when replacing that block with your version is intended. If your conflicting action was a deletion, Delete it again applies that deletion explicitly. Dismiss keeps the adopted document and closes the warning; it does not restore your version. Preserve any wanted text before dismissing, and use history to inspect saved versions when a broader recovery is needed. These choices affect the identified block rather than blindly replacing the whole page.

A missing thread anchor can follow document edits; read the discussion before moving or deleting the referenced block. Comments and activity are internal to the project unless content is explicitly published through a supported sharing path. Use a published-page test to determine the visitor's actual view rather than assuming that project collaboration controls become public.

## Attach and retrieve page files {#page-files}

Open the page as a project member and use its attachment or upload controls. Select a nonempty file within the 10 MB per-file limit. Your account or instance storage quota can impose an additional limit. Keep the original until the upload succeeds.

Images can be inserted as image blocks, and other documents can be attached as file blocks. The server determines the stored media type from the bytes rather than trusting the filename or browser label. Upload acceptance does not guarantee that every format has an inline preview; use the file download when a preview is unavailable.

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

Open a project page as a member and use its publication controls. Review the content and attachments first. Choose private, password-protected or public access. Password protection requires at least eight characters and is applied after submitting the password; selecting the mode alone does not create a protected link.

Copy the generated /p/ link after publication succeeds. If the page has descendants, review the include-children option and count. Including children publishes the selected branch; excluding them keeps their content outside that publication. A database without published children does not expose all its entry bodies automatically.

Open the link in a separate browser session without your account. Test the password if enabled, page content, intended subpages and file downloads. This verifies the visitor's read-only access rather than your broader member permissions.


![Page publication dialog with Private selected and password or bearer-link alternatives.](/documentation/en/page-publish.png)

### Revoke and check {#revoke-page}

Return to publication controls and choose private. After successful revocation, open the old link anonymously and check that access is denied. Copies or screenshots already received cannot be recalled. File download URLs already delivered by a published page are signed for up to 24 hours. Revocation prevents new page visits but those previously issued file URLs can remain valid until they expire.

User page links remain noindex and are separate from the indexed official manual. Noindex is a discovery policy, not an access password. If a child or file is unexpectedly readable, revoke first, inspect the published branch and retest before forwarding a corrected link. Files belonging to unpublished pages do not gain access merely through an internal reference.

## Export or print a page {#import-export-and-print-pages}

Open the page’s document menu, then Export. Choose Markdown for a page (.md) or a branch (.zip), PDF to open the print view, or the database archive when the page is a database. Review the offered scope before confirming; a page, its branch and a database archive have different contents.

Open the resulting export and verify headings, callouts, links and attachments needed by its reader. The PDF action opens a readable print view rather than the entire application navigation. Use the browser’s print controls to print or save a PDF. There is no general import action in the document menu; supported imports are started from an empty database, as described in the [database import section](/docs/databases#import-a-database).


![Document export menu with Markdown (.md) and Print / PDF.](/documentation/en/page-export.png)

### Database archives and limits {#export-fidelity}

A database archive (.zip) includes its branch: Markdown and CSV, exact schema and option colors, values, bodies, timestamps, nested pages and file bytes. Import it into a new empty database to restore that structure. Device-specific filtering, sorting and hidden-column preferences stay on the original device.

An export is not a transfer of passwords, account provider credentials or subscriptions. For moving account work between instances, use the [account-data transfer guide](/docs/transfer-between-instances). If an imported format cannot preserve a block or external property, inspect the result before relying on it as a replacement. Do not delete the original merely because a download file was created.
