---
{
  "id": "accounts",
  "locale": "en",
  "title": "Accounts",
  "summary": "Create and protect your account, recover access, change preferences and understand account deletion.",
  "topic": "Get started",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02",
    "A02",
    "S03",
    "A01",
    "A09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "app/(auth)/signup/page.tsx",
      "components/auth/signup-wizard.tsx",
      "lib/signup-wizard.ts",
      "lib/password-policy.ts",
      "app/(auth)/login/page.tsx",
      "app/auth/confirm/page.tsx",
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json",
      "app/(auth)/reset-password/page.tsx",
      "docs/self-hosting-auth.md",
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts",
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "choose-an-instance",
    "projects",
    "authentication-and-email",
    "applications",
    "automation-settings",
    "transfer-between-instances"
  ],
  "aliases": [
    "account-access",
    "account-security",
    "account-recovery",
    "profile-and-preferences",
    "settings-and-data",
    "privacy-and-account-deletion"
  ],
  "tags": [
    "Create an account and sign in",
    "Protect your account with two-factor authentication",
    "Recover account access",
    "Change your profile and interface preferences",
    "Control analytics and delete an account carefully"
  ],
  "figures": [
    {
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/en/auth-signup.png",
      "alt": "Email signup, with provider buttons and the first step of the three-step wizard.",
      "caption": "Start on the intended instance. The email path continues to identity and password; this capture shows no submitted registration.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        454
      ],
      "theme": "light"
    },
    {
      "id": "account-access-login",
      "kind": "screenshot",
      "src": "/documentation/en/auth-login.png",
      "alt": "Sign-in form with password recovery beneath the password field.",
      "caption": "Use recovery on the same instance as the account. The form is shown without any submitted credentials.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        540
      ],
      "theme": "light"
    },
    {
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/account-security-workflow.png",
      "alt": "Two-factor authentication card with the Turn on button.",
      "caption": "Start enrollment here, then verify the authenticator and store recovery codes privately.",
      "revision": 6,
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1200
      ],
      "theme": "light"
    },
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/en/auth-recovery.png",
      "alt": "Password recovery form with a demonstration address and the send-link button.",
      "caption": "Enter your account email here. The demonstration address was not submitted; this image does not establish delivery or successful recovery.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        278
      ],
      "theme": "light"
    },
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/profile-and-preferences-workflow.png",
      "alt": "Profile controls for avatar, username and read-only email.",
      "caption": "Save profile edits after validation; the email address remains read-only.",
      "revision": 6,
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/privacy-and-account-deletion-workflow.png",
      "alt": "Deletion preview listing owned projects, issues and members who lose access.",
      "caption": "Read the preview and export wanted data before opening the deletion confirmation.",
      "revision": 6,
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
    "account-access-steps",
    "account-security-workflow",
    "account-security-enrollment-workflow",
    "account-recovery-steps",
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow",
    "privacy-and-account-deletion-workflow"
  ]
}
---

Your account belongs to the instance where you signed up. Manage sign-in, two-factor authentication, recovery and personal preferences here; review the export and project consequences before deleting it.

## Create an account and sign in {#account-access}

Open the login or signup screen on the instance you intend to use. Cloud and another self-hosted instance have separate accounts. Available sign-in methods and signup access depend on the instance's authentication configuration.

For email signup, enter your address and continue to the identity step. Enter a nonempty full name; you can also choose an avatar. Continue to the password step, enter a password of at least eight characters with a lowercase letter (a–z), an uppercase letter (A–Z) and a digit, and repeat it in the confirmation field. Submit this last step to create the account. Leaving the earlier steps does not create an account. When email confirmation is required, open the message sent by that instance. Follow its link and activate the confirmation button on the confirmation page. Merely opening the link does not complete the confirmation: Minddy requires that deliberate action before consuming the email token.

Return to the intended application and sign in. A newly authenticated account can create its own project or accept a project invitation. Knowing a project URL does not grant membership.


![Email signup, with provider buttons and the first step of the three-step wizard.](/documentation/en/auth-signup.png)

### Sign out and handle missing mail {#session-and-mail}

Open the account menu, choose sign out and confirm. In the desktop app, closing a tab or window is not the same action as signing out. Use the account menu if your purpose is to end the session.

If mail does not arrive, check the address, spam folder and instance identity. A self-hosted operator must have configured working Auth email delivery; optional application notification email and Auth confirmation are separate concerns. An expired confirmation page provides a route back to login to request a new link. Do not forward confirmation or recovery links as diagnostic evidence: they authorize account access.

![Sign-in form with password recovery beneath the password field.](/documentation/en/auth-login.png)

## Protect your account with two-factor authentication {#account-security}

Open account settings' Security section and turn on two-factor authentication. This second factor also applies when signing in through Google or GitHub; provider authentication does not replace it.

1. Scan the QR code with a TOTP authenticator, or enter the displayed setup key manually. Never include either in a screenshot.
2. Enter the current six-digit code and confirm. If it expired, try the next code; after too many attempts, wait before retrying.
3. Save the recovery codes somewhere protected and accessible without your phone. Each works once and the codes are shown only once. Confirm that you saved them before finishing.

Activation refreshes the current session and attempts to sign out other sessions. If activation asks for fresh authentication after accepting a code, sign in again and follow the displayed advice.

![Two-factor authentication card with the Turn on button.](/documentation/en/account-security-workflow.png)

### Recovery and changes {#recovery}

Without the phone, use a saved recovery code during sign-in. Using a recovery code turns off two-factor authentication and invalidates the remaining codes. Once signed in, enroll your authenticator again and save the new recovery codes. This flow does not promise account restoration by human support. Replacing recovery codes invalidates the previous set; replacement and deliberate disablement require the server’s fresh authentication checks. Read the confirmation: disabling means the additional factor is no longer requested, including when signing in through Google or GitHub.

![Authenticator enrollment before code verification.](/documentation/en/account-security-enrollment-workflow.png)

## Recover account access {#account-recovery}

On the login screen of the correct instance, use password recovery and enter the email associated with your account. Open the reset message, follow its link and confirm the reset action. Enter your new password on the reset screen and submit it. Check that you can sign in on the same instance afterward.

A reset link can expire or no longer have an active session. The reset screen identifies that condition and lets you request another link. Start from a fresh message instead of retrying an old bookmark. Do not send the link, cookies or password to support.


![Password recovery form with a demonstration address and the send-link button.](/documentation/en/auth-recovery.png)

### MFA and unresolved access {#mfa-recovery}

If two-factor authentication is enabled, a password reset alone does not remove that requirement. Use your authenticator or a recovery code you stored when enabling MFA. Using a recovery code disables MFA on the account. Keep the code secret, and enable MFA again in the security settings after regaining access.

If neither factor nor a recovery code is available, contact the instance operator through its support channel. Include the instance address and the failure you see, without authentication tokens or private project content. For missing recovery email, ask the operator to verify Auth redirect URLs and SMTP delivery. Do not create a second account and assume it will inherit the original account's projects or connections.

## Change your profile and interface preferences {#profile-and-preferences}

Open account settings from your account menu. In Profile, enter a non-empty display name and save it. Your email is read-only. Generate a new avatar or upload an image using the avatar controls. Wait for the upload result and verify the avatar in a comment or member list; the same account avatar is used across projects and conversations. If a file is rejected, use the displayed validation message rather than repeatedly uploading it.

Uploaded source images must be no larger than 10 MiB. The server validates readable image bytes, applies orientation and center-crops to a 256 × 256 WebP avatar.

![Profile controls for avatar, username and read-only email.](/documentation/en/profile-and-preferences-workflow.png)

### Choose how the interface behaves {#preferences}

In Preferences, select the interface language and theme, then check another page. The account language governs the signed-in product; the public site's language selector controls public navigation separately. The theme is saved to the account across devices.

Choose the message-send shortcut in Keyboard. This preference governs comments and Numo's composer. Use the send button when a platform intercepts the shortcut; do not assume every OS maps the modifier key identically. Issue preferences such as automatic assignment and the status for Numo-created issues also belong to the account and do not change another member's settings.

![Language selector and light, dark and system theme controls.](/documentation/en/profile-and-preferences-preferences-workflow.png)

## Control analytics and delete an account carefully {#privacy-and-account-deletion}

When analytics is configured, account settings show its consent switch and a cookie-policy link. Turning it off immediately changes measurement consent on this device and saves the choice to the account. Another device's existing local choice can still govern it. If no analytics service is configured, the section is absent.

Consent is distinct from data needed to operate the account. Review the instance's privacy policy and the external providers you enabled. On self-hosted Minddy, the operator's configuration and policies determine service destinations; disabling analytics does not remove AI or Git integrations.

![Deletion preview listing owned projects, issues and members who lose access.](/documentation/en/privacy-and-account-deletion-workflow.png)

### Preview deletion before confirming {#deletion}

Export data you need to retain from account Data before deletion. Read the preview of owned projects, affected members, issues, comments and active subscription. Owned-project consequences affect other people; resolve those before confirming.

Open the deletion confirmation only when ready. Type your account email and, for password accounts, the password. Accounts without a password need a recent sign-in. Follow any fresh-authentication refusal rather than retrying blindly. A successful deletion signs out and returns to the public site. This is not recoverable trash. Keep exports private and handle any remaining subscription or provider concerns through the relevant billing and provider controls.
