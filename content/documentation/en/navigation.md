---
{
  "id": "navigation",
  "locale": "en",
  "title": "Find personal work and switch projects",
  "summary": "Understand the navigation levels, floating panels and platform-specific entry points.",
  "topic": "Get started",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S04"
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
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "search-and-shortcuts",
    "views-and-filters",
    "web-and-mobile",
    "desktop-app"
  ],
  "aliases": [
    "productivity"
  ],
  "tags": [],
  "figures": [
    {
      "id": "navigation-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-navigation.png",
      "alt": "Project navigation beside the demonstration issue board.",
      "caption": "Use the project sidebar to switch between issues, objectives, pages and triage.",
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
    "navigation-steps"
  ]
}
---

## Move between personal and project work {#navigation}

The main navigation gives access to personal work and your projects. Select a project to see its own issues and secondary destinations, including triage, objectives, pages and project settings. The back row moves up one navigation level; it can change the sidebar's contents while the main page remains open. Select a destination to navigate there.

Personal cycles and cross-project views span projects you can access. Project objectives, wiki and feedback belong to one project. Check the active project before creating work or changing settings.

![Project navigation beside the demonstration issue board.](/documentation/en/work-navigation.png)

## Panels and mobile navigation {#panels}

An issue opens in a detail panel so the underlying board remains available. Numo opens from its floating button in a shared conversation panel. Inbox opens as a navigation popover with notifications and invitations. Older dedicated Inbox and Numo links lead to the current entry points; they do not establish separate current screens.

On mobile, open the navigation drawer to choose the same destinations. Panels use the available screen width, so close or return from the current panel to see the list again. Use visible buttons when a keyboard shortcut is unavailable.

## Desktop tabs {#tabs}

The desktop app adds native tabs and a server picker around the application. A tab is a navigation surface, not a different project membership or account. Verify the selected instance when switching servers. Use the desktop guide for installation, native shortcuts and update behavior; the product's page and issue permissions still apply.
