# Security policy

Security is part of minddy's release contract. This document describes the
public security model, supported versions, disclosure path, and controls that
self-hosters must configure.

## Supported versions

Security fixes target the latest stable release and `main`. Older releases may
receive a backport when the maintainers judge it safe and practical. Upgrade to
the latest stable release before requesting support for an older version.

## Authentication and sessions

Minddy uses Supabase Auth. The server validates the authenticated user before
authorizing project or account operations. Important properties include:

- redirect targets are normalized and restricted to the configured origin;
- authentication errors do not disclose whether an account exists;
- password reset, email change, account deletion, and other sensitive actions
  require a recent authentication state where applicable;
- MFA factors are enrolled and challenged through server-validated flows;
- active sessions can be listed and revoked;
- session cookies use production-safe attributes through `@supabase/ssr`;
- rate limits apply to password verification and other abuse-prone paths.

The UI password rules are defined in `lib/password-policy.ts`. The Supabase
project remains the enforcement authority and must not use weaker settings.

## Authorization and tenant isolation

Most server writes use a service-role client after explicit authorization in
TypeScript. Row Level Security (RLS) is the independent second line of defense
for direct PostgREST access.

The current schema is defined by
[`supabase/migrations/20270106090000_baseline.sql`](supabase/migrations/20270106090000_baseline.sql)
and later migrations. Security invariants include:

- every application table enables RLS;
- policies target the minimum required roles and enforce project membership or
  ownership;
- cross-project identifiers are reauthorized before service-role access;
- project ownership columns cannot be moved between tenants through a client
  update;
- author identifiers are bound to the authenticated caller;
- privileged `SECURITY DEFINER` functions use a safe `search_path` and revoke
  execution from unintended roles;
- sensitive columns are protected with column privileges in addition to RLS;
- destructive operations use server-side authorization and storage cleanup.

Release validation includes schema guardrails and negative multi-tenant probes.
See [docs/security-model.md](docs/security-model.md) for the threat model and
[docs/security-release-checklist.md](docs/security-release-checklist.md) for
the promotion gate.

## Secrets and encryption

Reversible application secrets are encrypted before storage with AES-256-GCM
and purpose-specific keys. Examples include Git provider tokens, BYOK AI keys,
webhook secrets, and feedback-board SSO secrets. One-way API credentials and
OAuth grants are stored as hashes when the original value is not needed.

Secrets must never appear in client bundles, URLs, captures, logs, release
artifacts, test fixtures, or security reports. Only explicitly public values may
use a `NEXT_PUBLIC_`-style exposure. Operators must provide independent
encryption keys through protected runtime configuration.

The publication barrier scans the current tree and all publishable Git history.
CI also runs a maintained secret scanner with fully redacted output.

## Transport and browser protections

`next.config.mjs` applies the production browser-header policy:

| Header | Required behavior |
| --- | --- |
| `Strict-Transport-Security` | At least one year with `includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | Deny framing |
| `Referrer-Policy` | Restrict cross-origin referrer detail |
| `Permissions-Policy` | Disable unused sensors and limit microphone access |
| `Content-Security-Policy` | Restrict framing, base URLs, and form targets |

The OAuth authorization page has a documented `form-action` exception because
the protocol redirects a form response to the registered client URI. The
exception does not relax frame or base-URI protection.

Self-hosted operators must terminate HTTPS correctly, redirect HTTP to HTTPS,
and keep internal database and runner ports off the public network.

## Storage and uploads

Storage buckets are reconciled by
[`scripts/reconcile-storage-buckets.mjs`](scripts/reconcile-storage-buckets.mjs)
and protected by the baseline and later migrations.

- Private attachments use signed, short-lived access paths.
- Public project icons are constrained by content type and size.
- Server-side checks enforce ownership, project access, and object-key shape.
- Active content is not served as executable content.
- Deletion removes both metadata and the corresponding storage object.

Operators must back up database state and object bytes together.

## Input validation and request integrity

API routes validate runtime schemas, identifiers, sizes, and allowed values.
Cookie-authenticated state changes verify the request origin or an equivalent
anti-CSRF signal. Public webhook and OAuth endpoints use protocol-specific
signatures, state, redirect-URI validation, and replay controls.

Outgoing fetches restrict protocols, redirects, hostnames, and private network
targets. Error responses must not reveal credentials, internal paths, SQL, or
stack traces.

## Rate limiting

Abuse-prone authentication, feedback, AI, import, webhook, and integration
operations use scoped rate limits. Self-hosted operators must configure the
shared rate-limit store required by their topology; in-memory limits are not a
multi-instance substitute.

## Public surfaces

Public feedback, shared pages, OAuth discovery, health, and version endpoints
return only their documented projections. Public visibility does not imply
access to team-only comments, internal identities, private attachments, billing
data, or service credentials.

## Coding-agent isolation

Server-side agents run in isolated sandboxes with a restricted environment and
network policy. The sandbox receives only the scoped material required for a
run. It does not receive the host Docker socket, private Supabase network, or
unrelated service credentials.

Repository code is untrusted input. Agent execution, dependency installation,
tests, and build scripts must run away from operator credentials. See
[CONTRIBUTING.md](CONTRIBUTING.md#run-untrusted-changes-safely).

## Security verification

The repository provides:

- schema and authorization tests in the normal test suite;
- `scripts/security-probe.mjs` for fixture-driven live boundary checks;
- `npm run check:public-repo` for current and reachable-history publication
  checks;
- `npm run check:public-repo:remote` for a fresh canonical mirror, including
  server-advertised pull-request refs;
- dependency, container, workflow-pin, and release-policy gates;
- the mandatory release checklist in
  [docs/security-release-checklist.md](docs/security-release-checklist.md).

Run live probes only against an authorized disposable or staging environment.
Never put real credentials or personal data in probe output.

The live authorization probe requires a dedicated synthetic fixture with two
users and separate projects. It deliberately uses public/session credentials;
never provide a service-role key. Configure these variables in the restricted
probe environment:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SECURITY_PROBE_CROSS_TENANT_TOKEN
SECURITY_PROBE_DUAL_MEMBER_TOKEN
SECURITY_PROBE_SOURCE_PROJECT_ID
SECURITY_PROBE_FOREIGN_PROJECT_ID
SECURITY_PROBE_FOREIGN_ISSUE_ID
SECURITY_PROBE_REASSIGNABLE_ISSUE_ID
SECURITY_PROBE_HARD_DELETE_PAGE_ID
SECURITY_PROBE_SECRET_CONNECTION_ID
SECURITY_PROBE_FOREIGN_STORAGE_PATH
```

After provisioning only synthetic records, run:

```bash
node scripts/security-probe.mjs --confirm
```

## Incident response

If a vulnerability may be active:

1. Preserve minimal, access-restricted evidence.
2. Revoke or rotate affected credentials immediately.
3. Contain the exposed route, integration, or deployment.
4. Determine affected versions, tenants, and data without copying unnecessary
   personal information.
5. Prepare and verify a fix, migration, and rollback path.
6. Coordinate disclosure and notify affected users when required.
7. Record follow-up controls without publishing exploit details prematurely.

## Report a vulnerability

Do not open a public issue or Discussion.

Use GitHub's private vulnerability reporting on the repository's **Security**
tab. If that option is unavailable, email
[hello@minddy.app](mailto:hello@minddy.app). Encrypt highly sensitive evidence
or ask for a secure transfer channel before sending it.

Include the affected version, impact, reproduction conditions, and the minimum
evidence needed to validate the report. Do not include real user data unless it
is essential and you are authorized to share it.

We will acknowledge the report, agree on a correction and disclosure schedule,
and credit the reporter if requested and safe.
