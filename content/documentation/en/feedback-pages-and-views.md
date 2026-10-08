---
{
  "id": "feedback-pages-and-views",
  "locale": "en",
  "title": "Add public pages and views to a feedback board",
  "summary": "Select already published content without exposing protected share names or links.",
  "topic": "Feedback and requests",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor"
  ],
  "workflows": [
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/project-feedback-settings.tsx",
      "components/feedback/feedback-settings-shared.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/public-nav.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/feedback-pages-and-views-workflow.png",
      "alt": "Published feedback guide selected in the board navigation and readable without sign-in.",
      "caption": "Publish a page, enable page tabs and select it for the board. This demonstration page was opened anonymously; the opaque URL keeps noindex.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        650
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-pages-and-views-workflow"
  ]
}
---

## Publish and select content {#feedback-pages-and-views}
As project owner, first publish the intended project page or share the intended view at public visibility. Check the content for private information. Open Feedback settings, enable the page or view family and select each item that should appear. Both the family switch and per-item selection are required.

The settings list can contain protected shares, but public navigation includes only public-level shares. Selecting a protected page does not bypass its protection or expose its name in a board tab. A published item from another project is not part of this project's tab list.

## Verify and remove access {#visibility}
Open the board signed out. Follow the tabs to selected views and pages and confirm their titles and contents. Navigation is shared among the board, public views and public pages when configured; a lone tab is not displayed as navigation.

To remove a tab, deselect the item or turn off its family. That removes navigation, not the underlying share. Revoke or change the actual share to remove direct-link access. Disabling the board also disables its coupled navigation, but does not independently revoke every page or view share. Verify both the board tab and original share URL after changing publication.

![Published feedback guide selected in the board navigation and readable without sign-in.](/documentation/en/feedback-pages-and-views-workflow.png)
