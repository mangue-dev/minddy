---
{
  "id": "authentication-and-email",
  "locale": "en",
  "title": "Authentication and email",
  "summary": "Auth email belongs to Supabase/GoTrue.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting-auth.md",
      "supabase/email-templates/confirm-signup.html",
      "supabase/email-templates/reset-password.html",
      "lib/self-hosting-email-templates.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "instance-administration",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Configure account email, MFA and recovery"
  ],
  "figures": [
    {
      "id": "authentication-and-email-flow",
      "kind": "diagram",
      "src": "/documentation/en/authentication-and-email-flow.svg",
      "alt": "Diagram: Configured Auth origin and redirects. Operator SMTP and versioned templates. Confirmation gesture and password login. TOTP, recovery and revoked-password tests.",
      "caption": "Read the stages in order. Configured Auth origin and redirects. Operator SMTP and versioned templates. Confirmation gesture and password login. TOTP, recovery and revoked-password tests.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Configured Auth origin and redirects"
          },
          {
            "title": "Operator SMTP and versioned templates"
          },
          {
            "title": "Confirmation gesture and password login"
          },
          {
            "title": "TOTP, recovery and revoked-password tests"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "authentication-and-email-flow"
  ]
}
---

## Set the correct Auth origin {#authentication-and-email}

Auth email belongs to Supabase/GoTrue. Application notifications through Resend do not configure confirmation or password recovery. In the full profile, retain the minddy overlay in every Compose command. Set `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` and `ADDITIONAL_REDIRECT_URLS` to your selected origins. Configure `SMTP_ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_SENDER_NAME` with your own provider. The overlay also sets the session limits: `GOTRUE_SESSIONS_TIMEBOX` is `8760h` (one year) and `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` is `720h` (30 days). Keep confirmation enabled and restart Auth in the installed Compose context.


Before using `compose` below, set the installed full-profile function from [the reference Compose context](/docs/backups-and-restoration#context).

```bash
compose up -d --wait auth
```


![Diagram: Configured Auth origin and redirects. Operator SMTP and versioned templates. Confirmation gesture and password login. TOTP, recovery and revoked-password tests.](/documentation/en/authentication-and-email-flow.svg)

## Configure managed Supabase {#managed}

In your own project Authentication settings, set Site URL and the exact `<app-origin>/auth/callback` redirect. Configure custom SMTP and both versioned confirmation/recovery templates. The confirmation template uses `token_hash` and `type=signup`. Set at least eight characters with lowercase, uppercase and digits and enable TOTP enrollment and verification. Enable compromised-password checks where supported, recording provider limitations. The full overlay uses fail-closed checks requiring outbound `api.pwnedpasswords.com` access. Set the session time-box to 8760 hours (one year) and the inactivity timeout to 720 hours (30 days). The database refuses sessions beyond these same limits, so a disabled or longer Auth limit keeps refreshing sessions that every API then rejects. Record session lifetime, refresh-token rotation, revocation and Auth rate limits; SQL bootstrap does not set these platform controls.

## Test account-level results {#verify}

Use a disposable address you control. Confirm that signup email reaches it, opens this instance and requires the confirmation gesture. Enroll TOTP in account security settings and save recovery codes outside the browser. Sign out and verify a fresh password-plus-TOTP login. Request reset, follow the recovery email and verify the previous password fails. For an `ADMIN_EMAILS` address, check administrator access only after MFA. Record versions, dates and sanitized outcomes. Container health cannot prove delivery or account security. Never include email tokens, passwords, sessions, TOTP secrets or recovery codes in evidence.
