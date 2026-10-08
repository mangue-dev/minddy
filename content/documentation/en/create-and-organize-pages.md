---
{
  "id": "create-and-organize-pages",
  "locale": "en",
  "title": "Build a project wiki",
  "summary": "Create pages and subpages, organize their hierarchy and surface shared favorites.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P01"
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
      "content/knowledge/pages.md",
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "page-comments-and-collaboration",
    "publish-a-page"
  ],
  "aliases": [
    "pages"
  ],
  "tags": [],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-create-menu.png",
      "alt": "Page creation menu offering New page and New database.",
      "caption": "Use the project page controls to choose a document or a database.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps"
  ]
}
---

## Create and organize pages {#create-and-organize-pages}

Open Pages in a project where you are a member. Use the + menu and choose a page for a document or a database for a structured list. Give the page a useful title and write the specification, decision or procedure it should preserve.

Create subpages for related documents and use the tree controls to move or reorder them. A page cannot become a descendant of itself. Duplicating a page creates new content rather than a live reference to the original. Review the duplicate's branch before editing or sharing it.

## Favorites and deletion {#page-tree}

Favorite a page to surface it at the top of the project's page tree. These favorites are shared within the project, unlike a private notebook note. Link a page to an issue when the current document is task context; the resource's title follows page renaming.

Deletion sends supported page work to trash. Check the selected branch before deleting and use recovery rather than recreating a lost page when its content should be retained. Entries with stored database values can be reordered within their database but cannot be moved outside it. If a move is rejected, inspect the hierarchy and entry type instead of forcing it through repeated attempts.


![Page creation menu offering New page and New database.](/documentation/en/page-create-menu.png)
