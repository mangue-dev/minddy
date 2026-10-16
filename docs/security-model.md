# Security threat model

## Scope and attacker model

Minddy treats source code, routes, database migrations, role names, public
keys, opaque identifiers, and internal protocols as known to an attacker. The
attacker may hold an ordinary authenticated account, control a public-board
visitor, operate an OAuth or MCP client, send webhook and cron requests, author
forge comments or pull request content that Numo reads, or use a direct
Supabase REST or Storage client. They cannot obtain server environment variables, a legitimate third-party
signature, or a platform operator credential unless a separate compromise has
occurred.

The protected assets are tenant data, authorization decisions, account and
admin privileges, integration and OAuth credentials, uploaded files, billing
state, and the authority to make Numo act on a user's behalf. Numo no longer
executes repository code (MIN-721): the agent VM, server sandboxes and the
agent control plane were removed, and their retained run records are dormant
data protected like other tenant rows.

## Trust boundaries and controls

| Boundary | Required control |
| --- | --- |
| Browser or direct Supabase client to tenant data | RLS, column grants, and immutable tenant keys protect every public table and Storage prefix. |
| Route handler to service-role client | The service role is server-only and bypasses RLS; each use must establish the caller and project access before its query. |
| Authenticated user to privileged actions | Server-side membership, ownership, reauthentication, and admin checks decide authority; UI visibility and TypeScript types are never authorization. |
| Untrusted callback to webhook or cron work | Authenticate the sender with a scoped secret or signature, reject invalid or missing credentials, and make delivery processing replay-safe. |
| OAuth or MCP client to an account | Enforce registered redirect URIs, PKCE, consent, short-lived single-use codes, hashed tokens, and per-token scopes. |
| Public link or integration key to a project | Treat tokens and keys as bearer credentials, scope them to one project and capability, keep them out of browser bundles and logs, and rotate or revoke on compromise. |
| User upload or URL-derived input to server resources | Authorize the object and project before access; validate path, size, media type, redirect target, and destination so untrusted input cannot become path traversal, SSRF, or a credential leak. |
| Forge, pull request, or remote MCP content to Numo | Treat comments, diffs, descriptions, and remote tool results as untrusted data that cannot authorize actions. An `@numo` mention from the forge counts only when its author is linked to a member of a project that links the repository, and Numo's pull request review is read-only. |

## Roles and deployment responsibilities

Application credentials, including the Supabase service role, encryption keys,
webhook secrets, provider tokens, cron secret, and Cloud Ops credentials, are
server-only. `NEXT_PUBLIC_*` values and anything delivered to the
browser are public by design. A service-role query requires an explicit
application authorization check even when database RLS provides a second line
of defense.

Cloud operators are responsible for protecting deployment secrets, Supabase
Auth and Storage configuration, production headers, and scheduled-job
invocation. Self-host operators assume those same
responsibilities, plus network isolation, TLS termination, backups, database
role management, and ensuring that no development or operator endpoint is
publicly reachable. Neither deployment mode may rely on route obscurity,
client-side checks, or migration secrecy.

## Review invariants

Before release, test negative paths as an unrelated user and with no
credential: cross-tenant reads and writes, admin-only endpoints, privileged
RPCs, Storage object paths, webhook replay or forgery, OAuth redirect and code
reuse, cron calls, integration-key scope, and forged `@numo` mentions from forge
webhooks. Any accepted medium risk must name its affected boundary, compensating control,
owner, and follow-up issue.
