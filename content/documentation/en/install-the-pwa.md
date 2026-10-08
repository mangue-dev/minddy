---
{
  "id": "install-the-pwa",
  "locale": "en",
  "title": "Install the web app on a phone or tablet",
  "summary": "Add your instance to the Home Screen and keep its online and push conditions clear.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A11"
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
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "public/sw.js",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json"
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
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/install-the-pwa-workflow.png",
      "alt": "Minddy’s illustrated Safari installation guide: Share, Add to Home Screen and confirm.",
      "caption": "The public guide illustrates the three Safari steps and keeping Open as Web App enabled. These are instructional illustrations rendered by Minddy, not screenshots of a completed iOS installation.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        940
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-the-pwa-workflow"
  ]
}
---

## Install from the browser {#install-the-pwa}
Open the intended Minddy instance in Safari on iPhone or iPad, or Chrome or a compatible Android browser. If a link opened inside another app, open it in the full browser first. Self-hosted users install their own server address.

On iOS, open Share, choose Add to Home Screen, keep Open as Web App enabled and tap Add. Depending on Safari layout, open More before Share; if the action is missing, inspect Edit Actions.

On Android, use an offered installation prompt or the browser menu's Install app or Add to Home screen, then confirm Install. Labels vary by browser. Open the new icon and sign in with the account belonging to that instance. This is a browser-installed PWA; there is no Minddy native app in the iOS App Store or Google Play.

## Updates, offline access and push {#operation}
Installation does not create an offline project copy. Minddy's service worker handles push only and does not cache application requests. Use a network connection and reload to obtain current web content. Notifications additionally require browser support, permission and configured server push; on iOS the installed app is required when prompted. If an installation option is unavailable, use the supported full browser and check whether the instance is already installed.

![Minddy’s illustrated Safari installation guide: Share, Add to Home Screen and confirm.](/documentation/en/install-the-pwa-workflow.png)
