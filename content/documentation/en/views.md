---
{
  "id": "views",
  "locale": "en",
  "title": "Views and filters",
  "summary": "Save a filtered view of accessible work, share it read-only and revoke public access when needed.",
  "topic": "Plan and find work",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13",
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "content/knowledge/productivity.md",
      "components/board-toolbar.tsx",
      "components/sidebar-filter-field.tsx",
      "app/api/me/saved-views/route.ts",
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "navigation",
    "pages",
    "permissions-and-public-links"
  ],
  "aliases": [
    "views-and-filters",
    "share-a-view"
  ],
  "tags": [
    "Save a view of your work",
    "Share and revoke a read-only view"
  ],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-view-filters.png",
      "alt": "Manual view filters and the sorting menu.",
      "caption": "Filter by issue properties or choose a sort order. The AI field is optional for these manual controls.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        288,
        393
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-share-view.png",
      "alt": "View-sharing dialog with private access selected.",
      "caption": "Private, password-protected and public access are distinct choices. This capture keeps the view private.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "views-and-filters-steps",
    "share-a-view-steps"
  ]
}
---

A view saves how you filter and display issues without copying or changing them. Configure the view for your work first; sharing an eligible project view is a separate step that gives visitors read-only access to the published content.

## Save a view of your work {#views-and-filters}

Start from a project board or a personal cross-project issue surface. Use its filters, sort and display controls to choose the work you need. Check the scope before saving: a personal view and a project view do not represent the same access boundary.

Filter on supported properties such as status, assignee, priority, categories or objective. Sort the result to make the next action clear. In kanban, issues remain grouped by status; changing a view does not edit their status or assignment.

Save the view with a name describing its purpose, then select it again from navigation and verify its filters. Edit or remove it when its purpose changes. For publication permissions and revocation, see [sharing a view](#share-a-view).

![Manual view filters and the sorting menu.](/documentation/en/work-view-filters.png)

### Empty or unexpected results {#view-recovery}

Check every filter, the active project and your membership when expected issues are absent. Clear restrictive filters before assuming data was deleted. After editing an issue, it can legitimately leave a filtered view. Search its identifier or use an unfiltered project board to inspect the saved values.

A saved view is not a copy of its issues. Deleting the view removes that view configuration, while deleting selected issues changes the underlying project work.

## Share and revoke a read-only view {#share-a-view}

Open the view menu on an eligible project board and choose Share view. You need project access; a personal view within the project can be shared only by its own user. Global cross-project views cannot be shared. Review its filters and visible content before publication. Choose a public secret link or password protection where offered; passwords require at least eight characters. Copy the generated link only after the sharing change succeeds.

Open the link in a separate browser session without your account. Inspect the issue subset, fields and any linked content a visitor can see. A public link grants the view's read-only access rather than membership or edit permission in the project.

Shared cards expose their titles, descriptions and displayed properties, including assignee names, categories, objective names, due dates, recurrence and any remote forge links. The projection excludes implementation-plan bodies and member email addresses. Parent and relation chips can show identifiers of project issues outside the view filter. Review those descriptions, names and identifiers as well as the visible columns; hiding a card property is not a general content-redaction tool.

![View-sharing dialog with private access selected.](/documentation/en/work-share-view.png)

### Revoke and verify {#revoke-view}

Return to the view's share controls and make it private to revoke publication. Open the old link anonymously again to check that access is denied. Revocation cannot recall copies or screenshots a visitor already saved.

Secret view links use the private-link publication path and remain noindex. That indexing policy limits search-engine discovery but is not a password. Keep the link private if its contents are sensitive, and use password protection when appropriate. Do not confuse a user's shared view with the indexed official documentation.

If the anonymous result differs from your expectation, inspect the saved view and sharing configuration before forwarding its link. Verify the scope again after changing filters or linked content.
