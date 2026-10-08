---
{
  "id": "page-editor",
  "locale": "en",
  "title": "Write a page with blocks and mentions",
  "summary": "Use structured content, callouts and links while checking that edits are saved.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-files",
    "page-comments-and-collaboration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-editor.png",
      "alt": "Demonstration page with headings, paragraphs, task checkboxes and an issue mention.",
      "caption": "Headings, task blocks and the AUR-2 mention keep the page structured. This is demonstration content.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-editor-steps"
  ]
}
---

## Write the document {#page-editor}

Open the page and edit its title or body as a project member. Use the slash-command menu and formatting controls to insert headings, paragraphs, lists, task items, code, collapsible sections and callouts. A callout can have an emoji icon and palette color; choose them to distinguish useful information rather than as the only way to communicate a warning.

Use mentions to link relevant issues, objectives, people or pages. Backlinks help readers find pages that reference the current one. A link supplies context rather than granting a reader access to another project's private object.


![Demonstration page with headings, paragraphs, task checkboxes and an issue mention.](/documentation/en/page-editor.png)

## Saving and portability {#editor-save}

Watch the save indicator before navigating away from a substantial edit. If another edit creates a conflict, use the displayed recovery controls and preserve your text; do not assume that both edits merged. Page history can help inspect earlier saved versions.

Markdown exports and agent page reads preserve callout icons and colors in their supported representation. Export formats have different fidelity and attachment handling, so check the resulting document before replacing an original source. Use code blocks for literal commands and retain their prerequisites and warnings in the surrounding text.
