---
{
  "id": "account-recovery",
  "locale": "en",
  "title": "Recover account access",
  "summary": "Reset a password safely and identify when MFA or instance support is still needed.",
  "topic": "Get started",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "app/(auth)/reset-password/page.tsx",
      "components/settings/account-security-section.tsx",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "account-access",
    "account-security",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/en/auth-recovery.png",
      "alt": "Password recovery form with a demonstration address and the send-link button.",
      "caption": "Enter your account email here. The demonstration address was not submitted; this image does not establish delivery or successful recovery.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        278
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-recovery-steps"
  ]
}
---

## Request a fresh password reset {#account-recovery}

On the login screen of the correct instance, use password recovery and enter the email associated with your account. Open the reset message, follow its link and confirm the reset action. Enter your new password on the reset screen and submit it. Check that you can sign in on the same instance afterward.

A reset link can expire or no longer have an active session. The reset screen identifies that condition and lets you request another link. Start from a fresh message instead of retrying an old bookmark. Do not send the link, cookies or password to support.


![Password recovery form with a demonstration address and the send-link button.](/documentation/en/auth-recovery.png)

## MFA and unresolved access {#mfa-recovery}

If two-factor authentication is enabled, a password reset alone does not remove that requirement. Use your authenticator or a recovery code you stored when enabling MFA. Using a recovery code disables MFA on the account. Keep the code secret, and enable MFA again in the security settings after regaining access.

If neither factor nor a recovery code is available, contact the instance operator through its support channel. Include the instance address and the failure you see, without authentication tokens or private project content. For missing recovery email, ask the operator to verify Auth redirect URLs and SMTP delivery. Do not create a second account and assume it will inherit the original account's projects or connections.
