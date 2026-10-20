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
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-737 account settings reorganization; UI/UX refinements batch: account settings open on Preferences",
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
      "app/api/account/route.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-691-session-expiry.md",
      "supabase/migrations/20270109200046_list_auth_sessions.sql",
      "supabase/migrations/20270109200047_revoke_auth_session.sql",
      "content/documentation/reviews/sign-out-other-devices.md",
      "lib/theme-presets.ts",
      "app/theme-presets.css",
      "content/documentation/reviews/min-696-theme-presets.md",
      "components/settings/account-settings-page.tsx",
      "components/settings/account-desktop-section.tsx",
      "components/settings/account-issues-section.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "components/mobile-account.tsx",
      "lib/keyboard/shortcuts.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root (theme palette, high-contrast and transparency controls: source and test review; the preferences capture predates these rows and is retained); agent:/root (MIN-737 account settings reorganization: source review of the tab order, the in-place profile editing, the Preferences, Issues and AI & Numo contents and the Privacy & data tab; profile-and-preferences-workflow recaptured on 2026-10-19 in all six locales from the local candidate showing the profile header edited in place (avatar menu, name field or mobile sheet; the Edit profile dialog was removed the same day), and inspected; no other browser walkthrough); agent:/root (MIN-737 second pass: Hidden projects moved from Preferences to its own account tab; source review of components/settings/account-settings-page.tsx; no new captures); agent:/root (UI/UX refinements batch, account settings opening tab: source review of ACCOUNT_SETTINGS_DEFAULT_TAB in lib/settings-sections.ts, the account menu entries in components/app-sidebar.tsx, the mobile menu in components/mobile-account.tsx and the Command/Ctrl+comma binding in lib/keyboard/shortcuts.ts; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (en source and fr, de, es, it, pt-BR translation self-review of the changed paragraph); agent:/root (en MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-737 second-pass Hidden projects sentence with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (en account settings opening tab changed passage with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/account-security-workflow.png",
      "alt": "Two-factor authentication card with the Turn on button.",
      "caption": "Start enrollment here, then verify the authenticator and store recovery codes privately.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        227
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/profile-and-preferences-workflow.png",
      "alt": "Profile header with the avatar and its edit badge, the name and the read-only email.",
      "caption": "Select the avatar to generate or upload one, or the name to rename yourself; the email address stays read-only.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        256
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/profile-and-preferences-preferences-workflow.png",
      "alt": "Language selector, light, dark and system theme controls, the light and dark mode palette selectors and the transparency switch.",
      "caption": "Account appearance preferences are separate from the public website language.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-18",
      "viewport": [
        816,
        421
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/privacy-and-account-deletion-workflow.png",
      "alt": "Deletion preview listing owned projects, issues and members who lose access.",
      "caption": "Read the preview and export wanted data before opening the deletion confirmation.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        231
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow",
    "privacy-and-account-deletion-workflow"
  ]
}
---

Your account belongs to the instance where you signed up. Manage sign-in, two-factor authentication, recovery and personal preferences here; review the export and project consequences before deleting it.

## Create an account and sign in {#account-access}

Open the login or signup screen on the instance you intend to use. Cloud and another self-hosted instance have separate accounts. Available sign-in methods and signup access depend on the instance's authentication configuration.

For email signup:

1. Enter your address and continue to the identity step.
2. Enter a nonempty full name and optionally choose an avatar.
3. Continue to the password step. Enter at least eight characters with a lowercase letter (a–z), an uppercase letter (A–Z) and a digit, then repeat the password in the confirmation field.
4. Submit this last step to create the account. Leaving the earlier steps does not create an account.
5. If email confirmation is required, open the message sent by this instance. Follow its link and activate the confirmation button on the page. Opening the link alone does not confirm the account or consume the email token.

Return to the intended application and sign in. A newly authenticated account can create its own project or accept a project invitation. Knowing a project URL does not grant membership.


### Sign out and handle missing mail {#session-and-mail}

Open the account menu, choose sign out and confirm. In the desktop app, closing a tab or window leaves your session active.

A session stays signed in while you use minddy, for up to one year, and ends after 30 days without use. When it ends, or is closed from another device, minddy returns to the sign-in screen with a message that your session has expired. Sign in again to continue where you were.

The **Sessions** group in account settings' **Security** tab lists the browsers and desktop apps signed in to your account, with the device you use marked and when each other one was last active. To end every other session, for example on a lost laptop or a shared computer, choose **Sign out all** in the **Sign out other devices** row and confirm. To end one session only, choose **Sign out** on its row and confirm. Every other browser and desktop app signed in to your account returns to the sign-in screen; the device you use stays signed in. Apps you authorized under **minddy MCP** → **Connected apps** keep their access until you revoke them there.

If mail does not arrive, check the address, spam folder and instance identity. A self-hosted operator must have configured working Auth email delivery; optional application notification email and Auth confirmation are separate concerns. An expired confirmation page provides a route back to login to request a new link. Do not forward confirmation or recovery links as diagnostic evidence: they authorize account access.


## Protect your account with two-factor authentication {#account-security}

Open account settings' Security section and turn on two-factor authentication. This second factor also applies when signing in through Google or GitHub; provider authentication does not replace it.

1. Scan the QR code with a TOTP authenticator, or enter the displayed setup key manually. Never include either in a screenshot.
2. Enter the current six-digit code and confirm. If it expired, try the next code; after too many attempts, wait before retrying.
3. Save the recovery codes somewhere protected and accessible without your phone. Each works once and the codes are shown only once. Confirm that you saved them before finishing.

Activation refreshes the current session and attempts to sign out other sessions. If activation asks for fresh authentication after accepting a code, sign in again and follow the displayed advice.

![Two-factor authentication card with the Turn on button.](/documentation/en/account-security-workflow.png)

### Recovery and changes {#recovery}

Without the phone, use a saved recovery code during sign-in. Using a recovery code turns off two-factor authentication and invalidates the remaining codes. Once signed in, enroll your authenticator again and save the new recovery codes. This flow does not promise account restoration by human support. Replacing recovery codes invalidates the previous set; replacement and deliberate disablement require the server’s fresh authentication checks. Read the confirmation: disabling means the additional factor is no longer requested, including when signing in through Google or GitHub.


## Recover account access {#account-recovery}

On the login screen of the correct instance, use password recovery and enter the email associated with your account. Open the reset message, follow its link and confirm the reset action. Enter your new password on the reset screen and submit it. Check that you can sign in on the same instance afterward.

A reset link can expire or no longer have an active session. The reset screen identifies that condition and lets you request another link. Start from a fresh message instead of retrying an old bookmark. Do not send the link, cookies or password to support.


### MFA and unresolved access {#mfa-recovery}

If two-factor authentication is enabled, a password reset alone does not remove that requirement. Use your authenticator or a recovery code you stored when enabling MFA. Using a recovery code disables MFA on the account. Keep the code secret, and enable MFA again in the security settings after regaining access.

If neither factor nor a recovery code is available, contact the instance operator through its support channel. Include the instance address and the failure you see, without authentication tokens or private project content. For missing recovery email, ask the operator to verify Auth redirect URLs and SMTP delivery. Do not create a second account and assume it will inherit the original account's projects or connections.

## Change your profile and interface preferences {#profile-and-preferences}

Choose **Account settings** from your account menu, the mobile menu or the command palette, or press Command+comma on macOS (Ctrl+comma on Windows/Linux): account settings open on the **Preferences** tab. To open the **Profile** tab directly, choose your name at the top of the account menu; you can also select **Profile** among the settings tabs. It shows your avatar, name and email, followed by your [personal statistics](/docs/personal-statistics). Select your avatar and choose **New Lorelei avatar** or **Upload image**; the change applies as soon as it succeeds. Select your name to rename yourself: on a computer the name becomes a field, where Enter or leaving the field saves and Escape cancels; on a phone it opens a sheet with **Username** and **Save**. The name cannot be empty. Your email is read-only. Wait for the upload result and verify the avatar in a comment or member list; the same account avatar is used across projects and conversations. If a file is rejected, use the displayed validation message rather than repeatedly uploading it.

Uploaded source images must be no larger than 10 MiB. The server validates readable image bytes, applies orientation and center-crops to a 256 × 256 WebP avatar.

![Profile header with the avatar and its edit badge, the name and the read-only email.](/documentation/en/profile-and-preferences-workflow.png)

### Choose how the interface behaves {#preferences}

In Preferences, select the interface language and theme, then check another page. The account language governs the signed-in product; the public site's language selector controls public navigation separately. The theme is saved to the account across devices.

Theme chooses light, dark or system mode. **Light mode palette** and **Dark mode palette** each set the colors of one mode. **Accent colors** (minddy, Blue, Violet, Green, Orange, Rose) keep minddy's colors and only recolor buttons and the focus ring; **Full palettes** (Solarized, Catppuccin, Nord) recolor every surface; **High contrast** sits under Accessibility. The palette of the mode on screen applies immediately; the other is saved and appears whenever its mode becomes active, including when System follows an operating-system switch. High contrast raises text and border contrast, outlines fields, menus, dialogs and tabs, marks the current page and selected item, always shows keyboard focus and keeps menus opaque. Turn off **Transparency** to paint menus, popovers and the command palette opaque, without blur. Palettes and transparency are saved to the account; another device applies them the next time it loads a page.

Choose the message-send shortcut in Keyboard. This preference governs comments and Numo's composer. Use the send button when a platform intercepts the shortcut; do not assume every OS maps the modifier key identically. Projects you hid are listed in their own **Hidden projects** tab, where you can show them again. **Preferences** also holds the **Desktop app** card: on the web it links to the desktop download, and in the desktop app it shows the connected server, the preview channel when available and the app version. Issue preferences also belong to the account and do not change another member's settings: automatic assignment is in the **Issues** tab, and the status for issues Numo creates is in **AI & Numo** → **Issues Numo creates**.

![Language selector, light, dark and system theme controls, the light and dark mode palette selectors and the transparency switch.](/documentation/en/profile-and-preferences-preferences-workflow.png)

## Control analytics and delete an account carefully {#privacy-and-account-deletion}

When analytics is configured, the **Privacy & data** tab of account settings shows its consent switch and a cookie-policy link. Turning it off immediately changes measurement consent on this device and saves the choice to the account. Another device's existing local choice can still govern it. If no analytics service is configured, the section is absent.

Consent is distinct from data needed to operate the account. Review the instance's privacy policy and the external providers you enabled. On self-hosted minddy, the operator's configuration and policies determine service destinations; disabling analytics does not remove AI or Git integrations.

![Deletion preview listing owned projects, issues and members who lose access.](/documentation/en/privacy-and-account-deletion-workflow.png)

### Preview deletion before confirming {#deletion}

Export data you need to retain from the **Privacy & data** tab before deletion. Read the preview of owned projects, affected members, issues, comments and active subscription. Owned-project consequences affect other people; resolve those before confirming.

Open the deletion confirmation only when ready. Type your account email and, for password accounts, the password. Accounts without a password need a recent sign-in. Follow any fresh-authentication refusal rather than retrying blindly. A successful deletion signs out and returns to the public site. This is not recoverable trash. Keep exports private and handle any remaining subscription or provider concerns through the relevant billing and provider controls.


## Routine controls {#routines}

Automatic project work is configured in [Routines](/docs/scheduled-routines), where the owner chooses a schedule, product event or database arrival. Account automation presets and their project switches are retired. Read the [transition guide](/docs/automation-settings) before activating an archived proposal.
