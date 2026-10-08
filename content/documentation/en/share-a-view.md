---
{
  "id": "share-a-view",
  "locale": "en",
  "title": "Share and revoke a read-only view",
  "summary": "Publish the intended issue subset without giving a visitor project membership.",
  "topic": "Plan and find work",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "components/board-toolbar.tsx",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "views-and-filters",
    "publish-a-page",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-share-view.png",
      "alt": "View-sharing dialog with private access selected.",
      "caption": "Private, password-protected and public access are distinct choices. This capture keeps the view private.",
      "revision": 2,
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
    "share-a-view-steps"
  ]
}
---

## Publish the view {#share-a-view}

Open the view menu on an eligible project board and choose Share view. You need project access; a personal view within the project can be shared only by its own user. Global cross-project views cannot be shared. Review its filters and visible content before publication. Choose a public secret link or password protection where offered; passwords require at least eight characters. Copy the generated link only after the sharing change succeeds.

Open the link in a separate browser session without your account. Inspect the issue subset, fields and any linked content a visitor can see. A public link grants the view's read-only access rather than membership or edit permission in the project.

Shared cards expose their titles, descriptions and displayed properties, including assignee names, categories, objective names, due dates, recurrence and any remote forge links. The projection excludes implementation-plan bodies and member email addresses. Parent and relation chips can show identifiers of project issues outside the view filter. Review those descriptions, names and identifiers as well as the visible columns; hiding a card property is not a general content-redaction tool.

![View-sharing dialog with private access selected.](/documentation/en/work-share-view.png)

## Revoke and verify {#revoke-view}

Return to the view's share controls and make it private to revoke publication. Open the old link anonymously again to check that access is denied. Revocation cannot recall copies or screenshots a visitor already saved.

Secret view links use the private-link publication path and remain noindex. That indexing policy limits search-engine discovery but is not a password. Keep the link private if its contents are sensitive, and use password protection when appropriate. Do not confuse a user's shared view with the indexed official documentation.

If the anonymous result differs from your expectation, inspect the saved view and sharing configuration before forwarding its link. Verify the scope again after changing filters or linked content.
