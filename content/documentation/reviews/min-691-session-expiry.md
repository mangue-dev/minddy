# MIN-691 session expiry documentation review

Reviewed by agent:/root on 2026-10-16 against the MIN-691 working tree. This is
an agent factual and language self-review, not a human approval or evidence of
a production deployment.

The audience is any member signed in on the web or desktop app. The outcome is
to understand why minddy returns to the sign-in screen on its own and what to do
next.

Affected workflow ID: S03. The stable article ID `accounts` and its
`session-and-mail` section remain valid in all six locales. No figure changed;
existing captures keep their evidence.

## Factual evidence

- `public.is_auth_session_active`
  (`supabase/migrations/20270109200045_session_lifetime_one_year.sql`, applied
  to the hosted project on 2026-10-16) refuses sessions older than 8760 hours or
  unused for 720 hours.
- The hosted Auth configuration was read through the Management API on
  2026-10-16: `sessions_timebox` and `sessions_inactivity_timeout` were `0`
  (disabled). They were set to `8760` and `720` hours the same day, after the
  SQL migration, and read back. `deploy/self-hosted/compose.full.yml` and
  `supabase/config.toml` set the same limits.
- `lib/session-revocation.ts`, `lib/auth-context.tsx` and
  `lib/signed-out-redirect.ts`: a `sessionInvalid` refusal is confirmed by one
  refresh and one retried read, then the local session ends and the app opens
  `/login?redirect=…&session=expired`.
- `components/auth/login-form.tsx` shows `Auth.sessionExpired` for that
  parameter, in all six locales.

## Not verified

The redirect was confirmed by the owner on localhost with a session older than
30 days. No desktop run, and no observation of the hosted limits refusing a
refresh after the configuration change, is recorded here.
