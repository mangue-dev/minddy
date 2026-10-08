---
{
  "id": "web-and-mobile",
  "locale": "en",
  "title": "Work in a browser or on a small screen",
  "summary": "Navigate projects, issue details and Numo while keeping network requirements in view.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A10"
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "content/documentation/reviews/mobile-account-capture-candidates.json"
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
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/web-and-mobile-workflow.png",
      "alt": "Mobile issue panel with localized title, description, properties and comment composer.",
      "caption": "On a narrow screen, issue details occupy a responsive panel. Use the close button to return to the project; Numo remains reachable through its floating button.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        390,
        844
      ],
      "theme": "dark"
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow"
  ]
}
---

## Open and complete an issue {#web-and-mobile}
Open your instance address and sign in to that instance. On a narrow viewport, reveal the sidebar to choose a project, then open an issue from its list or board. Read details in the responsive panel, change the intended field or add a comment, and wait for the save result before closing it. Close the detail panel to return to the list; its mobile presentation differs from a wide desktop layout.

Open Numo through its floating button or contextual issue action. Check the issue context in the composer. Close one panel before navigating when another overlays the content you need. Use explicit buttons and menus instead of assuming hover actions or desktop shortcuts are available on touch devices.

## Keyboard and connectivity {#access}
Keyboard users can focus controls and use the command palette for navigation and common actions. A visible send button remains an alternative to keyboard submission. Follow the shortcut shown by the app for your platform.

The installed web app and browser require network access for project data and writes. The service worker handles push and does not implement an offline data cache. After a connection failure, inspect whether the change persisted before repeating it. Installing the PWA does not create a separate account or bypass instance permissions.

![Mobile issue panel with localized title, description, properties and comment composer.](/documentation/en/web-and-mobile-workflow.png)
