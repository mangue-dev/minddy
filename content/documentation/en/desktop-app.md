---
{
  "id": "desktop-app",
  "locale": "en",
  "title": "Install and manage the desktop app",
  "summary": "Choose the correct platform package and instance, then use the matching update path.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A12"
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
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "install-the-pwa",
    "web-and-mobile",
    "devices-and-notifications",
    "import-issues"
  ],
  "aliases": [
    "desktop-and-speed"
  ],
  "tags": [],
  "figures": [
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/desktop-app-workflow.png",
      "alt": "Desktop settings in the real macOS Electron development app, version 0.11.1, connected to the local server with an isolated profile.",
      "caption": "Desktop settings in the real macOS Electron development app, version 0.11.1, connected to the local server with an isolated profile. This capture does not validate signed releases or other operating systems.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        860
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "desktop-app-workflow"
  ]
}
---

## Install and choose a server {#desktop-app}
Use the public download page. Choose Apple silicon or Intel on macOS; install through Microsoft Store on Windows; choose an AppImage or signed deb/rpm matching x64 or ARM64 on Linux. Follow the platform guide and verification instructions for the package. Windows does not provide an exe installer.

At the server picker, choose Minddy Cloud, a self-hosted server origin or the available local runtime. Check the destination before signing in: accounts belong to their instance. OAuth uses the system browser and returns to desktop. A local runtime is not a promise that Numo's code worker runs in a desktop checkout.

## Tabs, closing and updates {#operation}
Use the desktop tab controls and command palette to move between work. Follow the displayed platform shortcuts; macOS uses Command where Windows/Linux commonly use Control. Closing the window hides it and keeps the app running. Use Quit to end the application; macOS offers Cmd+Q. Background notification behavior depends on the package and platform capabilities.

macOS and portable AppImage builds offer updates in the app. Windows updates through Microsoft Store. For deb/rpm, install the next verified package. Account desktop settings show the connected server and available update or support controls. Check the displayed desktop version after updating and confirm that the intended instance still opens.

![Desktop settings in the real macOS Electron development app, version 0.11.1, connected to the local server with an isolated profile.](/documentation/en/desktop-app-workflow.png)
