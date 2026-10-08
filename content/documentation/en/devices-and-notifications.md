---
{
  "id": "devices-and-notifications",
  "locale": "en",
  "title": "Enable notifications on a device",
  "summary": "Register the device, test delivery and separate browser from native notification support.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A03"
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
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "public/sw.js",
      "content/documentation/reviews/push-registration-capture-candidates.json"
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
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/devices-and-notifications-workflow.png",
      "alt": "Push settings showing browser permission blocked and no registered device.",
      "caption": "This browser blocks notifications. Restore site permission before trying to register this device.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/devices-and-notifications-registered.png",
      "alt": "An active browser push device registered to the account, with its actual last-send date.",
      "caption": "The account has an active registered browser device. The list shows its registration and last-send dates. Browser permission and operating-system settings still determine whether a banner appears.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        950
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

## Enable and test {#devices-and-notifications}
Open notifications in account settings on the device you want to register. Enable notifications and accept the browser or OS permission request. A denied permission must be changed in browser or system settings; repeatedly switching the Minddy control cannot override it. On iOS, install and open the web app first when the interface requires it.

Check that the device appears in the list and use its test control. Inspect the last-delivery information. You can disable or remove individual registrations without deleting the account. Inbox preferences control which events notify you; the in-app Inbox remains available when push is unavailable.

![Push settings showing browser permission blocked and no registered device.](/documentation/en/devices-and-notifications-workflow.png)


## Platform conditions {#platforms}
Web push requires a supported browser and configured instance push service. Native banners and background delivery differ. Signed packaged macOS supports APNs; packaged Windows needs its optional WNS helper for background transport. Linux uses the packaged app's background session rather than APNs or WNS.

Check OS notification permission, browser installation state and the displayed “not configured” or “unsupported” explanation. A successful test does not guarantee delivery while offline or under every OS background restriction. Keep the application or its configured background service available as required by the platform.

![An active browser push device registered to the account, with its actual last-send date.](/documentation/en/devices-and-notifications-registered.png)
