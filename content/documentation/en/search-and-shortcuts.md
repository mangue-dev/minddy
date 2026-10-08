---
{
  "id": "search-and-shortcuts",
  "locale": "en",
  "title": "Find work and use keyboard actions",
  "summary": "Search accessible work, inspect shortcut help and keep focus on the intended object.",
  "topic": "Plan and find work",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W15"
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
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "navigation",
    "views-and-filters",
    "desktop-app"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-search.png",
      "alt": "Search results for a demonstration issue identifier.",
      "caption": "The palette finds the issue by identifier alongside project pages; opening a result preserves its access rules.",
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
    "search-and-shortcuts-steps"
  ]
}
---

## Search for an object {#search-and-shortcuts}

Open the command palette from the navigation search control. Search for a distinctive title or issue identifier and choose a result. Results are limited to work your account can access; a known identifier does not grant access to another project.

Press Command+K on macOS or Ctrl+K on Windows/Linux to open the command palette; Command/Ctrl+P is an alternative application binding. Outside editable text, ? opens shortcut help and C opens issue creation. On a hovered issue card or its supported detail controls, S opens status, P priority, E effort, A assignee, L categories, D due date and O objective. These single-key actions do not intercept typing in an input, textarea or content editor. Navigation sequences such as G then H (Home) and G then I (Inbox) use two successive keys; G then W reaches Pages only in a project context.

Use the keyboard shortcuts help to inspect the commands available on your platform. Minddy distinguishes application shortcuts, issue-property actions and native desktop tab or window shortcuts. Check where focus is before using a command: typing inside an editor and acting on the surrounding issue are different contexts.

![Search results for a demonstration issue identifier.](/documentation/en/work-search.png)

## Use an equivalent visible control {#shortcut-alternatives}

Issue fields have visible property pickers as well as keyboard actions. Use those pickers on mobile or when a shortcut is intercepted by the browser or operating system. Close an overlay or return focus to the intended surface before trying another action.

Search can find an issue absent from the current filtered view. If a result is missing, confirm the project, account and instance, then use a more distinctive query. Do not create a duplicate merely because the current board hides the task. The public documentation has its own localized text search, independent of Numo and provider configuration.
