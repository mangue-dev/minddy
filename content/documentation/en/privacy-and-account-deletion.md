---
{
  "id": "privacy-and-account-deletion",
  "locale": "en",
  "title": "Control analytics and delete an account carefully",
  "summary": "Review data destinations and deletion effects before making an irreversible request.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A09"
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
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts"
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
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/privacy-and-account-deletion-workflow.png",
      "alt": "Deletion preview listing owned projects, issues and members who lose access.",
      "caption": "Read the preview and export wanted data before opening the deletion confirmation.",
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
    "privacy-and-account-deletion-workflow"
  ]
}
---

## Analytics consent {#privacy-and-account-deletion}
When analytics is configured, account settings show its consent switch and a cookie-policy link. Turning it off immediately changes measurement consent on this device and saves the choice to the account. Another device's existing local choice can still govern it. If no analytics service is configured, the section is absent.

Consent is distinct from data needed to operate the account. Review the instance's privacy policy and the external providers you enabled. On self-hosted Minddy, the operator's configuration and policies determine service destinations; disabling analytics does not remove AI or Git integrations.

![Deletion preview listing owned projects, issues and members who lose access.](/documentation/en/privacy-and-account-deletion-workflow.png)


## Preview deletion before confirming {#deletion}
Export data you need to retain from account Data before deletion. Read the preview of owned projects, affected members, issues, comments and active subscription. Owned-project consequences affect other people; resolve those before confirming.

Open the deletion confirmation only when ready. Type your account email and, for password accounts, the password. Accounts without a password need a recent sign-in. Follow any fresh-authentication refusal rather than retrying blindly. A successful deletion signs out and returns to the public site. This is not recoverable trash. Keep exports private and handle any remaining subscription or provider concerns through the relevant billing and provider controls.
