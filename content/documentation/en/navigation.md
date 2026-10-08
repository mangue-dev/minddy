---
{
  "id": "navigation",
  "locale": "en",
  "title": "Navigation and search",
  "summary": "Navigate personal and project work, use tabs and panels, and find accessible items with search and keyboard shortcuts.",
  "topic": "Get started",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S04",
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
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
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md",
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "views",
    "applications"
  ],
  "aliases": [
    "productivity",
    "search-and-shortcuts"
  ],
  "tags": [
    "Find personal work and switch projects",
    "Find work and use keyboard actions"
  ],
  "figures": [
    {
      "id": "navigation-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-navigation.png",
      "alt": "Project navigation beside the demonstration issue board.",
      "caption": "Use the project sidebar to switch between issues, objectives, pages and triage.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-search.png",
      "alt": "Search results for a demonstration issue identifier.",
      "caption": "The palette finds the issue by identifier alongside project pages; opening a result preserves its access rules.",
      "revision": 4,
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
    "navigation-steps",
    "search-and-shortcuts-steps"
  ]
}
---

Use navigation to choose your personal work or a project, and the command palette to find a specific issue or action. Panels, mobile navigation and desktop tabs provide different ways to reach that work; check the selected project and instance before making changes.

## Find personal work and switch projects {#navigation}

The main navigation gives access to personal work and your projects. Select a project to see its own issues and secondary destinations, including triage, objectives, pages and project settings. The back row moves up one navigation level; it can change the sidebar's contents while the main page remains open. Select a destination to navigate there.

Personal cycles and cross-project views span projects you can access. Project objectives, wiki and feedback belong to one project. Check the active project before creating work or changing settings.

![Project navigation beside the demonstration issue board.](/documentation/en/work-navigation.png)

### Panels and mobile navigation {#panels}

An issue opens in a detail panel so the underlying board remains available. Numo opens from its floating button in a shared conversation panel. Inbox opens as a navigation popover with notifications and invitations. Older dedicated Inbox and Numo links lead to the current entry points; they do not establish separate current screens.

On mobile, open the navigation drawer to choose the same destinations. Panels use the available screen width, so close or return from the current panel to see the list again. Use visible buttons when a keyboard shortcut is unavailable.

### Desktop tabs {#tabs}

The desktop app adds native tabs and a server picker around the application. A tab is a navigation surface, not a different project membership or account. Verify the selected instance when switching servers. Use the [desktop app section](/docs/applications#desktop-app) for installation, native shortcuts and update behavior; the product's page and issue permissions still apply.

## Find work and use keyboard actions {#search-and-shortcuts}

Open the command palette from the navigation search control. Search for a distinctive title or issue identifier and choose a result. Results are limited to work your account can access; a known identifier does not grant access to another project.

Press Command+K on macOS or Ctrl+K on Windows/Linux to open the command palette; Command/Ctrl+P is an alternative application binding. Outside editable text, ? opens shortcut help and C opens issue creation. On a hovered issue card or its supported detail controls, S opens status, P priority, E effort, A assignee, L categories, D due date and O objective. These single-key actions do not intercept typing in an input, textarea or content editor. Navigation sequences such as G then H (Home) and G then I (Inbox) use two successive keys; G then W reaches Pages only in a project context.

Use the keyboard shortcuts help to inspect the commands available on your platform. minddy distinguishes application shortcuts, issue-property actions and native desktop tab or window shortcuts. Check where focus is before using a command: typing inside an editor and acting on the surrounding issue are different contexts.

![Search results for a demonstration issue identifier.](/documentation/en/work-search.png)

### Use an equivalent visible control {#shortcut-alternatives}

Issue fields have visible property pickers as well as keyboard actions. Use those pickers on mobile or when a shortcut is intercepted by the browser or operating system. Close an overlay or return focus to the intended surface before trying another action.

Search can find an issue absent from the current filtered view. If a result is missing, confirm the project, account and instance, then use a more distinctive query. Do not create a duplicate merely because the current board hides the task. The public documentation has its own localized text search, independent of Numo and provider configuration.
