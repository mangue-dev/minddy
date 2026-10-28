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
  "revision": 16,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "lib/query-snapshot-budget.ts",
      "lib/query-persistence.ts",
      "lib/desktop/renderer-recovery.ts",
      "desktop/src/main.ts",
      "lib/query-retention.ts",
      "lib/pull-request-tab-labels.ts",
      "lib/desktop/window-stall-recovery.ts",
      "lib/desktop/local-recovery-load.ts",
      "scripts/desktop-renderer-hang.integration.mjs",
      "lib/use-desktop-notifications.ts",
      "lib/use-desktop-notifications.test.ts",
      "lib/query-provider.tsx",
      "lib/navigation-working-set.ts",
      "lib/query-storage-writes.test.ts",
      "lib/local-snapshot-security.test.ts",
      "components/settings/account-settings-page.tsx",
      "components/desktop/server-choice.tsx",
      "components/desktop/server-choice-entry.tsx",
      "lib/desktop/server-choice.ts",
      "desktop/src/menu.ts",
      "components/auth/auth-chrome.tsx"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; 3 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; 2 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, components/auth/auth-chrome.tsx, desktop/src/main.ts, desktop/src/menu.ts and lib/desktop/server-choice.ts; no desktop walkthrough, no screenshot recaptured)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-781 changed passages on self-hosting from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
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
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-28",
      "viewport": [
        1488,
        713
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/devices-and-notifications-workflow.png",
      "alt": "Push settings showing browser permission blocked and no registered device.",
      "caption": "This browser blocks notifications. Restore site permission before trying to register this device.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "desktop-renderer-recovery",
      "kind": "screenshot",
      "src": "/documentation/en/desktop-renderer-recovery.png",
      "alt": "Local recovery page after a forced renderer crash, with Reload window and Check server settings controls.",
      "caption": "Recovery page in the macOS development app with an isolated profile and demonstration server. The native shell uses English labels in every language.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-28",
      "viewport": [
        1280,
        860
      ],
      "theme": "light",
      "padding": 0,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow",
    "install-the-pwa-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow",
    "desktop-renderer-recovery"
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

Use the public download page. Choose Apple silicon or Intel on macOS; install through Microsoft Store on Windows; choose an AppImage or signed `deb`/`rpm` matching x64 or ARM64 on Linux. Follow the platform guide and verification instructions for the package. Windows does not provide an `exe` installer. The macOS app requires macOS 13 (Ventura) or later; on an older version, an installed app keeps its current version and receives no further updates.

On the first launch, the app opens the minddy Cloud sign-up screen, where you create your account. To use your own instance instead, click **Self-host minddy** at the bottom of the sign-in and sign-up screens. It opens **Self-host minddy**, with three choices: **Install on this computer** sets up a [local instance](/docs/install-locally#install-locally), **Install on a server** opens the public server installation guide in your browser, and **Use an existing installation** opens a screen that groups the installations you already have. There, **On this computer** opens a minddy folder already on this computer and the app starts it; below it, **Server address** with **Connect** joins a server you run. Remote servers require HTTPS; `localhost` can use HTTP.

To change server later, choose **Connect to a Server…** in the native minddy menu (press Alt on Windows and Linux to show the menu bar), **Change…** next to **Connected server** in **Account settings** → **Preferences** → **Desktop app**, or **Self-host minddy** at the bottom of the sign-in and sign-up screens. Each brings the app window to **Self-host minddy**; when a self-hosted server is connected, **Use minddy Cloud** in **Use an existing installation** returns to Cloud. The path at the top of the page leads back to each step, and the minddy logo returns to the app. This screen is built into the desktop app and opens without an Internet connection. Check the destination before signing in: accounts belong to their instance. OAuth uses the system browser and returns to desktop.

On macOS and Windows 11, the sidebar, tabs and window edges show your desktop, blurred, behind the opaque content. To keep the window opaque on this device, turn off **Desktop app transparency** in **Account settings** → **Preferences** → [Appearance](/docs/accounts#preferences).

### Tabs, closing and updates {#desktop-app-operation}

Use the desktop tab controls and command palette to move between work. Follow the displayed platform shortcuts; macOS uses Command where Windows/Linux commonly use Control. Closing the window hides it and keeps the app running. Use Quit to end the application; macOS offers Cmd+Q. Background notification behavior depends on the package and platform capabilities.

macOS and portable AppImage builds offer updates in the app. Windows updates through Microsoft Store. For `deb`/`rpm`, install the next verified package. In the desktop app, **Account settings** → **Preferences** → **Desktop app** shows the connected server and the app version, with an update check where the package supports it. On the web, the same card links to the download page. Check the displayed desktop version after updating and confirm that the intended instance still opens.

### Recover a stopped window {#desktop-renderer-recovery}

If a desktop window crashes, a local recovery page offers **Reload window**. Use it to reopen the last screen on the currently selected server. Unsaved changes may be lost. The app waits for your action instead of repeatedly reloading the failing page. If the recovery page also fails, the native message asks you to quit and reopen minddy. These native recovery controls currently use English labels.

If a page is still loading after 30 seconds, or a window remains unresponsive for five seconds after the desktop app detects it, a native dialog offers **Wait** and **Recover window**. **Wait** is the default and leaves your work and the current request in place. The dialog closes if loading finishes or the window responds again. Recovering may lose unsaved changes: choose **Recover window** to open the local recovery page, then **Reload window** to return to the last screen.

The optional saved query cache holds up to 2 MiB of query data. If the full cache is too large, minddy keeps complete query results that can be saved, favoring current views and tabs in the tab bar when needed. If that selection still exceeds the limit, the previous local snapshot is removed. Data omitted from the saved cache stays in memory for the session and is fetched again when needed after a restart. Separately saved drafts are unaffected. This cache is not a backup of your work.

To reduce memory use during long sessions, inactive PR details, commit diffs and page bodies are released after one minute and reloaded when needed. Active queries are retained. Tab labels keep only lightweight PR information, so keeping a tab open does not retain its patches.

![Local recovery page after a forced renderer crash, with Reload window and Check server settings controls.](/documentation/en/desktop-renderer-recovery.png)

## Enable notifications on a device {#devices-and-notifications}

Open notifications in account settings on the device you want to register. Enable notifications and accept the browser or OS permission request. A denied permission must be changed in browser or system settings; repeatedly switching the minddy control cannot override it. On iOS, install and open the web app first when the interface requires it.

Check that the device appears in the list and use its test control. Inspect the last-delivery information. You can disable or remove individual registrations without deleting the account. The categories in **Account settings** → **Notifications** control which events notify you; the in-app Inbox remains available when push is unavailable.

![Push settings showing browser permission blocked and no registered device.](/documentation/en/devices-and-notifications-workflow.png)

### Platform conditions {#platforms}

Web push requires a supported browser and configured instance push service. Native banners and background delivery differ. Signed packaged macOS supports APNs; packaged Windows needs its optional WNS helper for background transport. Linux uses the packaged app's background session rather than APNs or WNS.

If the selected server has no APNs or WNS configuration, the desktop app uses local native banners while it is running or hidden. This fallback does not deliver notifications after you quit the app.

Check OS notification permission, browser installation state and the displayed “not configured” or “unsupported” explanation. A successful test does not guarantee delivery while offline or under every OS background restriction. Keep the application or its configured background service available as required by the platform.

![An active browser push device registered to the account, with its actual last-send date.](/documentation/en/devices-and-notifications-registered.png)
