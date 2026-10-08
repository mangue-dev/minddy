---
{
  "id": "views-and-filters",
  "locale": "en",
  "title": "Save a view of your work",
  "summary": "Filter and sort issues without changing their stored properties.",
  "topic": "Plan and find work",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13"
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
      "content/knowledge/productivity.md",
      "components/board-toolbar.tsx",
      "components/sidebar-filter-field.tsx",
      "app/api/me/saved-views/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "navigation",
    "search-and-shortcuts"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-view-filters.png",
      "alt": "Manual view filters and the sorting menu.",
      "caption": "Filter by issue properties or choose a sort order. The AI field is optional for these manual controls.",
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
    "views-and-filters-steps"
  ]
}
---

## Build and save the view {#views-and-filters}

Start from a project board or a personal cross-project issue surface. Use its filters, sort and display controls to choose the work you need. Check the scope before saving: a personal view and a project view do not represent the same access boundary.

Filter on supported properties such as status, assignee, priority, categories or objective. Sort the result to make the next action clear. In kanban, issues remain grouped by status; changing a view does not edit their status or assignment.

Save the view with a name describing its purpose, then select it again from navigation and verify its filters. Edit or remove the saved view when its purpose changes. Sharing a view is a separate publication operation and has its own permission and revocation rules.

![Manual view filters and the sorting menu.](/documentation/en/work-view-filters.png)

## Empty or unexpected results {#view-recovery}

Check every filter, the active project and your membership when expected issues are absent. Clear restrictive filters before assuming data was deleted. After editing an issue, it can legitimately leave a filtered view. Search its identifier or use an unfiltered project board to inspect the saved values.

A saved view is not a copy of its issues. Deleting the view removes that view configuration, while deleting selected issues changes the underlying project work.
