# minddy

## What this codebase does

Minddy is a multi-tenant issue tracker for small product teams. The primary
application is a Next.js App Router web app using Supabase Auth, Postgres,
Storage, and Realtime. It also exposes OAuth-protected MCP tools, optional Git
provider and billing integrations, public feedback boards and page-sharing
links, and optional Electron desktop shells that can start a local self-hosted
runtime or interact with a user-selected server.

## Auth shape

- Route handlers use `getAuthedUser` in `lib/server/api-auth.ts`; it verifies
  Supabase JWT claims, enforces MFA where applicable, and rejects explicitly
  foreign origins for cookie-authenticated mutations.
- Server-side service-role operations must authorize the actor with helpers
  such as `getProjectAccess`, `requireProjectMember`, or `isAdminUser`; RLS is
  the second tenant-isolation boundary for direct Supabase access.
- `isSameOriginRequest` is used on browser-only authentication and consent
  flows, while `hasForeignOrigin` deliberately permits non-browser callers
  that omit origin headers.
- OAuth/MCP access tokens are verified by `verifyMcpToken`; OAuth grants,
  refresh rotation, and PKCE validation live under `lib/server/oauth/`.
- Public feedback and shared-page routes use opaque tokens and their own board
  or page authorization helpers; do not treat their token possession as a
  general account session.

## Threat model

The highest-impact targets are cross-tenant project data, Supabase-backed
attachments, OAuth/API credentials, encrypted Git-provider tokens, and user
supplied AI credentials. Attackers can reach public routes, OAuth endpoints,
webhooks, feedback boards, MCP clients, and desktop-renderer content. Review
all transitions from a user-selected URL, external webhook, OAuth callback, or
renderer IPC message to a privileged server, filesystem, or network action.

## Project-specific patterns to flag

- The server agent under `lib/server/agent/` executes repository work through
  Vercel Sandbox and an OpenCode VM. Its command guard, network policy,
  workspace scoping, prompt attachments, and credential broker are security
  boundaries rather than convenience helpers.
- `safe-fetch.ts` is the only supported route for user-selected outbound HTTP;
  it validates public addresses, pins DNS resolution, validates redirects, and
  caps response size. Direct `fetch` of user-controlled URLs is suspicious.
- GitHub/GitLab webhooks and relay routes must authenticate provider
  signatures, de-duplicate deliveries, and bind installation or repository
  identity to the correct tenant before mutating state.
- Database migrations define RLS, column grants, storage policies, and
  `SECURITY DEFINER` functions. New SQL objects must not silently inherit
  executable or readable privileges for `anon` or `authenticated`.
- The Electron renderer is untrusted remote content. The preload bridge must
  expose only typed narrow IPC operations; main-process handlers must validate
  every URL, channel, repository selection, and local-runtime action.

## Known false-positives

- Public feedback and shared-page routes under `app/f/` and `app/p/` are
  intentional token-based entry points and do not necessarily call account
  authentication.
- Next.js route handlers that use a service-role client may be correct when a
  preceding explicit project, board, or administrative authorization helper
  constrains the operation; inspect the complete path.
- `scripts/` and capture fixtures contain release probes, test data, and
  intentional security assertions. Treat them as tooling unless the same
  behavior is reachable in production.
- Webhook, OAuth callback, and cron routes may be intentionally unauthenticated
  by Supabase because they use a provider signature, state/PKCE, or a separate
  cron secret instead.
- Electron uses `data:` content for a local startup status view; navigation and
  popup decisions are guarded in the main process.
