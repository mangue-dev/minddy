---
{
  "id": "applications",
  "locale": "en",
  "title": "Web, mobile and desktop apps",
  "summary": "Use minddy in a browser, install the mobile or desktop app and configure device notifications.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A10",
    "A11",
    "A12",
    "A03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/documentation/reviews/mobile-account-capture-candidates.json",
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "content/documentation/reviews/push-registration-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "issues"
  ],
  "aliases": [
    "web-and-mobile",
    "install-the-pwa",
    "desktop-app",
    "desktop-and-speed",
    "devices-and-notifications"
  ],
  "tags": [
    "Work in a browser or on a small screen",
    "Install the web app on a phone or tablet",
    "Install and manage the desktop app",
    "Enable notifications on a device"
  ],
  "figures": [
    {
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/web-and-mobile-workflow.png",
      "alt": "Mobile issue panel with localized title, description, properties and comment composer.",
      "caption": "On a narrow screen, issue details occupy a responsive panel. Use the close button to return to the project; Numo remains reachable through its floating button.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        438,
        1032
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/install-the-pwa-workflow.png",
      "alt": "minddy’s illustrated Safari installation guide: Share, Add to Home Screen and confirm.",
      "caption": "The public guide illustrates the three Safari steps and keeping Open as Web App enabled. These are instructional illustrations rendered by minddy, not screenshots of a completed iOS installation.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1488,
        713
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/desktop-app-workflow.png",
      "alt": "Desktop settings in the real macOS Electron development app, version 0.11.1, connected to the local server with an isolated profile.",
      "caption": "Desktop settings in the real macOS Electron development app, version 0.11.1, connected to the local server with an isolated profile. This capture does not validate signed releases or other operating systems.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        287
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/devices-and-notifications-workflow.png",
      "alt": "Push settings showing browser permission blocked and no registered device.",
      "caption": "This browser blocks notifications. Restore site permission before trying to register this device.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        196
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/devices-and-notifications-registered.png",
      "alt": "An active browser push device registered to the account, with its actual last-send date.",
      "caption": "The account has an active registered browser device. The list shows its registration and last-send dates. Browser permission and operating-system settings still determine whether a banner appears.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow",
    "install-the-pwa-workflow",
    "desktop-app-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

Access the same instance from a browser, an installed web app or the desktop app. Choose the installation steps for your device, then check connectivity, updates and notification permissions for that platform.

## Work in a browser or on a small screen {#web-and-mobile}

Open your instance address and sign in to that instance. On a narrow viewport, reveal the sidebar to choose a project, then open an issue from its list or board. Read details in the responsive panel, change the intended field or add a comment, and wait for the save result before closing it. Close the detail panel to return to the list; its mobile presentation differs from a wide desktop layout.

Open Numo through its floating button or contextual issue action. Check the issue context in the composer. Close one panel before navigating when another overlays the content you need. Use explicit buttons and menus instead of assuming hover actions or desktop shortcuts are available on touch devices.

### Keyboard and connectivity {#access}

Keyboard users can focus controls and use the command palette for navigation and common actions. A visible send button remains an alternative to keyboard submission. Follow the shortcut shown by the app for your platform.

The installed web app and browser require network access for project data and writes. The service worker handles push and does not implement an offline data cache. After a connection failure, inspect whether the change persisted before repeating it. Installing the PWA does not create a separate account or bypass instance permissions.

![Mobile issue panel with localized title, description, properties and comment composer.](/documentation/en/web-and-mobile-workflow.png)

## Install the web app on a phone or tablet {#install-the-pwa}

Open the intended minddy instance in Safari on iPhone or iPad, or Chrome or a compatible Android browser. If a link opened inside another app, open it in the full browser first. Self-hosted users install their own server address.

On iOS, open Share, choose Add to Home Screen, keep Open as Web App enabled and tap Add. Depending on Safari layout, open More before Share; if the action is missing, inspect Edit Actions.

On Android, use an offered installation prompt or the browser menu's Install app or Add to Home screen, then confirm Install. Labels vary by browser. Open the new icon and sign in with the account belonging to that instance. This is a browser-installed PWA; there is no minddy native app in the iOS App Store or Google Play.

### Updates, offline access and push {#operation}

Installation does not create an offline project copy. minddy's service worker handles push only and does not cache application requests. Use a network connection and reload to obtain current web content. Notifications additionally require browser support, permission and configured server push; on iOS the installed app is required when prompted. If an installation option is unavailable, use the supported full browser and check whether the instance is already installed.

![minddy’s illustrated Safari installation guide: Share, Add to Home Screen and confirm.](/documentation/en/install-the-pwa-workflow.png)

## Install and manage the desktop app {#desktop-app}

Use the public download page. Choose Apple silicon or Intel on macOS; install through Microsoft Store on Windows; choose an AppImage or signed `deb`/`rpm` matching x64 or ARM64 on Linux. Follow the platform guide and verification instructions for the package. Windows does not provide an `exe` installer.

At the server picker, choose minddy Cloud, a self-hosted server origin or the available local runtime. Check the destination before signing in: accounts belong to their instance. OAuth uses the system browser and returns to desktop. A local runtime is not a promise that Numo's code worker runs in a desktop checkout.

### Tabs, closing and updates {#desktop-app-operation}

Use the desktop tab controls and command palette to move between work. Follow the displayed platform shortcuts; macOS uses Command where Windows/Linux commonly use Control. Closing the window hides it and keeps the app running. Use Quit to end the application; macOS offers Cmd+Q. Background notification behavior depends on the package and platform capabilities.

macOS and portable AppImage builds offer updates in the app. Windows updates through Microsoft Store. For `deb`/`rpm`, install the next verified package. Account desktop settings show the connected server and available update or support controls. Check the displayed desktop version after updating and confirm that the intended instance still opens.

![Desktop settings in the real macOS Electron development app, version 0.11.1, connected to the local server with an isolated profile.](/documentation/en/desktop-app-workflow.png)

## Enable notifications on a device {#devices-and-notifications}

Open notifications in account settings on the device you want to register. Enable notifications and accept the browser or OS permission request. A denied permission must be changed in browser or system settings; repeatedly switching the minddy control cannot override it. On iOS, install and open the web app first when the interface requires it.

Check that the device appears in the list and use its test control. Inspect the last-delivery information. You can disable or remove individual registrations without deleting the account. Inbox preferences control which events notify you; the in-app Inbox remains available when push is unavailable.

![Push settings showing browser permission blocked and no registered device.](/documentation/en/devices-and-notifications-workflow.png)

### Platform conditions {#platforms}

Web push requires a supported browser and configured instance push service. Native banners and background delivery differ. Signed packaged macOS supports APNs; packaged Windows needs its optional WNS helper for background transport. Linux uses the packaged app's background session rather than APNs or WNS.

Check OS notification permission, browser installation state and the displayed “not configured” or “unsupported” explanation. A successful test does not guarantee delivery while offline or under every OS background restriction. Keep the application or its configured background service available as required by the platform.

![An active browser push device registered to the account, with its actual last-send date.](/documentation/en/devices-and-notifications-registered.png)
