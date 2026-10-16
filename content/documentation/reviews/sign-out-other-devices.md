# Sign out other devices documentation review

Reviewed by agent:/root on 2026-10-16 against the `work/sign-out-other-devices`
working tree. This is an agent factual and language self-review, not a human
approval or evidence of a production deployment.

The audience is any member who wants to end the sessions of a lost, shared or
forgotten device. The outcome is to find the control, know that the current
device stays signed in, and know which access it does not end.

Affected workflow ID: S03. The stable article ID `accounts` and its
`session-and-mail` section remain valid in all six locales. No figure changed:
`account-security-workflow` is cropped to the two-factor authentication group,
which the new **Sessions** group below it does not alter. Existing captures keep
their evidence.

## Factual evidence

- `components/settings/account-security-section.tsx`: the Security tab renders a
  **Sessions** group with a **Sign out other devices** row. Its button opens a
  confirmation dialog; confirming calls `signOutOtherSessions`, shows a success
  toast, and shows a localized error in the row on failure.
- `lib/auth-context.tsx`: `signOutOtherSessions` calls
  `auth.signOut({ scope: "others" })`, which ends every other session of the
  account and keeps the current one. Explicit sign-out stays `scope: "local"`.
- `supabase/migrations/20270109200045_session_lifetime_one_year.sql`:
  `public.is_auth_session_active` refuses a deleted session, so another device
  is refused at its next API request and returns to sign-in through the
  session-expired flow already documented in the same section.
- `lib/server/mcp/auth.ts`: MCP clients use minddy's own OAuth access tokens,
  not Auth sessions, so the control does not revoke them; **Connected apps**
  in the **minddy MCP** tab does.
- `components/settings/account-security-section.test.tsx` runs the real
  `AuthProvider`: confirming calls `signOut({ scope: "others" })` once and keeps
  the current session, cancelling calls nothing, and a failure shows the error
  while the current session stays signed in.
- Localized labels come from `AccountSecurity.sessionsTitle` and
  `AccountSecurity.signOutOthersLabel` in each catalog; the tab and connected
  apps names come from `Account.securityTab`, `Account.mcpTab` and
  `Account.connectedAppsTitle`.

## Not verified

No browser or desktop run against a second real session is recorded here, and
no new capture was taken.
