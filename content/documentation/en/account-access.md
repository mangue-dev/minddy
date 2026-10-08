---
{
  "id": "account-access",
  "locale": "en",
  "title": "Create an account and sign in",
  "summary": "Use the correct instance, complete email confirmation and end your session deliberately.",
  "topic": "Get started",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02"
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
      "app/(auth)/signup/page.tsx",
      "components/auth/signup-wizard.tsx",
      "lib/signup-wizard.ts",
      "lib/password-policy.ts",
      "app/(auth)/login/page.tsx",
      "app/auth/confirm/page.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "choose-an-instance",
    "account-recovery",
    "project-members"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/en/auth-signup.png",
      "alt": "Email signup, with provider buttons and the first step of the three-step wizard.",
      "caption": "Start on the intended instance. The email path continues to identity and password; this capture shows no submitted registration.",
      "revision": 1,
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
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        540
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-access-steps"
  ]
}
---

## Register and confirm your account {#account-access}

Open the login or signup screen on the instance you intend to use. Cloud and another self-hosted instance have separate accounts. Available sign-in methods and signup access depend on the instance's authentication configuration.

For email signup, enter your address and continue to the identity step. Enter a nonempty full name; you can also choose an avatar. Continue to the password step, enter a password of at least eight characters with a lowercase letter (a–z), an uppercase letter (A–Z) and a digit, and repeat it in the confirmation field. Submit this last step to create the account. Leaving the earlier steps does not create an account. When email confirmation is required, open the message sent by that instance. Follow its link and activate the confirmation button on the confirmation page. Merely opening the link does not complete the confirmation: Minddy requires that deliberate action before consuming the email token.

Return to the intended application and sign in. A newly authenticated account can create its own project or accept a project invitation. Knowing a project URL does not grant membership.


![Email signup, with provider buttons and the first step of the three-step wizard.](/documentation/en/auth-signup.png)

## Sign out and handle missing mail {#session-and-mail}

Open the account menu, choose sign out and confirm. In the desktop app, closing a tab or window is not the same action as signing out. Use the account menu if your purpose is to end the session.

If mail does not arrive, check the address, spam folder and instance identity. A self-hosted operator must have configured working Auth email delivery; optional application notification email and Auth confirmation are separate concerns. An expired confirmation page provides a route back to login to request a new link. Do not forward confirmation or recovery links as diagnostic evidence: they authorize account access.

![Sign-in form with password recovery beneath the password field.](/documentation/en/auth-login.png)
