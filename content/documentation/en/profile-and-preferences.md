---
{
  "id": "profile-and-preferences",
  "locale": "en",
  "title": "Change your profile and interface preferences",
  "summary": "Set your name, avatar, language, theme and message-send shortcut for your account.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A01"
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-security",
    "devices-and-notifications",
    "automation-settings",
    "transfer-between-instances",
    "privacy-and-account-deletion"
  ],
  "aliases": [
    "settings-and-data"
  ],
  "tags": [],
  "figures": [
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/profile-and-preferences-workflow.png",
      "alt": "Profile controls for avatar, username and read-only email.",
      "caption": "Save profile edits after validation; the email address remains read-only.",
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
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/profile-and-preferences-preferences-workflow.png",
      "alt": "Language selector and light, dark and system theme controls.",
      "caption": "Account appearance preferences are separate from the public website language.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow"
  ]
}
---

## Update your identity {#profile-and-preferences}
Open account settings from your account menu. In Profile, enter a non-empty display name and save it. Your email is read-only. Generate a new avatar or upload an image using the avatar controls. Wait for the upload result and verify the avatar in a comment or member list; the same account avatar is used across projects and conversations. If a file is rejected, use the displayed validation message rather than repeatedly uploading it.

Uploaded source images must be no larger than 10 MiB. The server validates readable image bytes, applies orientation and center-crops to a 256 × 256 WebP avatar.

![Profile controls for avatar, username and read-only email.](/documentation/en/profile-and-preferences-workflow.png)


## Choose how the interface behaves {#preferences}
In Preferences, select the interface language and theme, then check another page. The account language governs the signed-in product; the public site's language selector controls public navigation separately. The theme is saved to the account across devices.

Choose the message-send shortcut in Keyboard. This preference governs comments and Numo's composer. Use the send button when a platform intercepts the shortcut; do not assume every OS maps the modifier key identically. Issue preferences such as automatic assignment and the status for Numo-created issues also belong to the account and do not change another member's settings.

![Language selector and light, dark and system theme controls.](/documentation/en/profile-and-preferences-preferences-workflow.png)
