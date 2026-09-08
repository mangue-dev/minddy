# Configure account security on your own instance

Use your own Supabase project or the pinned full-profile stack. A Minddy Cloud
project, management token, keychain entry or account is not an installation
input. The [Cloud configuration record](auth-supabase-config.md) is historical
maintainer evidence, not a self-hosting setup procedure.

## Full reference profile

The installer writes a protected environment and combines it with the versioned
`compose.full.yml`. That overlay sets an eight-character password minimum,
lowercase/uppercase/digit requirements, and fail-closed compromised-password
checks. Keep the overlay in every Compose command. These checks require Auth's
documented outbound access to `api.pwnedpasswords.com`.

In the protected environment, configure `SITE_URL`, `API_EXTERNAL_URL`,
`SUPABASE_PUBLIC_URL` and `ADDITIONAL_REDIRECT_URLS` for your selected origins.
The installer supplies the initial values. Set `SMTP_ADMIN_EMAIL`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_SENDER_NAME` from your own email
provider. Keep confirmation enabled. Do not use the upstream test SMTP values
for real accounts. With the [installed Compose context](self-hosting-operations.md#reference-compose-context):

```bash
compose up -d --wait auth
```

The overlay obtains the versioned confirmation and recovery templates from your
Minddy instance. Test both deliveries after changing SMTP or public URLs. For a
disposable full-profile rehearsal, use the
[local confirmation inbox](self-hosting-clean-room.md#local-confirmation-mailbox-disposable-full-profile-test-only).
It sends no external mail and is not a production email configuration.

## Managed Supabase

In **your project's** Authentication settings, configure the Site URL and the
exact `<app-origin>/auth/callback` redirect. Configure your SMTP provider and
copy both templates from `supabase/email-templates/`. Use at least the same
password requirements as the application: eight characters with lowercase,
uppercase and digits. Enable compromised-password protection where supported;
record any provider limitation instead of claiming equivalent protection.

Enable TOTP enrollment and verification. Review and record the provider's
session lifetime, refresh-token rotation, revocation behavior and authentication
rate limits for your deployment. These are platform settings, not SQL migrations.
Do not copy credentials or a project reference from the Cloud maintenance record.

## Verify before onboarding users

1. Use a disposable account with an address you control. Confirm that its email
   link opens your instance and requires the confirmation gesture.
2. Open the account menu → **Account settings** → **Security** → **Turn on**.
   Enroll TOTP, verify a current code, and store recovery codes outside the browser.
3. Sign out, sign in with the password, and complete the TOTP challenge. For an
   address in `ADMIN_EMAILS`, verify administrator access after MFA; do not edit
   the database to grant yourself a role.
4. Request a password reset and verify that its email opens the local password
   screen. Check that old credentials no longer sign in after the change.
5. Record sanitized outcomes, versions and timestamps. Never include passwords,
   sessions, email links, enrollment secrets or recovery codes in the report.

Use the read-only doctor and the
[clean-room scenario](self-hosting-clean-room.md) for the remaining deployment
checks. A healthy container is not evidence that confirmation, MFA or recovery
works; those steps need the account-level checks above.
