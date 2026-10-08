---
{
  "id": "account-security",
  "locale": "en",
  "title": "Protect your account with two-factor authentication",
  "summary": "Verify an authenticator and preserve recovery codes before finishing enrollment.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A02"
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
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json"
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
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/account-security-workflow.png",
      "alt": "Two-factor authentication card with the Turn on button.",
      "caption": "Start enrollment here, then verify the authenticator and store recovery codes privately.",
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
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/account-security-enrollment-workflow.png",
      "alt": "Authenticator enrollment before code verification.",
      "caption": "Authenticator enrollment before code verification. The real QR code and manual secret are masked; this temporary unverified factor was cancelled and removed.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1200
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "account-security-enrollment-workflow"
  ]
}
---

## Enroll and verify {#account-security}
Open account settings' Security section and turn on two-factor authentication. This second factor also applies when signing in through Google or GitHub; provider authentication does not replace it.

1. Scan the QR code with a TOTP authenticator, or enter the displayed setup key manually. Never include either in a screenshot.
2. Enter the current six-digit code and confirm. If it expired, try the next code; after too many attempts, wait before retrying.
3. Save the recovery codes somewhere protected and accessible without your phone. Each works once and the codes are shown only once. Confirm that you saved them before finishing.

Activation refreshes the current session and attempts to sign out other sessions. If activation asks for fresh authentication after accepting a code, sign in again and follow the displayed advice.

![Two-factor authentication card with the Turn on button.](/documentation/en/account-security-workflow.png)


## Recovery and changes {#recovery}
Without the phone, use a saved recovery code during sign-in. Using a recovery code turns off two-factor authentication and invalidates the remaining codes. Once signed in, enroll your authenticator again and save the new recovery codes. This flow does not promise account restoration by human support. Replacing recovery codes invalidates the previous set; replacement and deliberate disablement require the server’s fresh authentication checks. Read the confirmation: disabling means the additional factor is no longer requested, including when signing in through Google or GitHub.

![Authenticator enrollment before code verification.](/documentation/en/account-security-enrollment-workflow.png)
