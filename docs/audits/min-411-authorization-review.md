# MIN-411 authorization-boundary review

## Executive summary

No urgent or high-severity authorization bypass was found in the reviewed
source paths. The review assumed public knowledge of every route, migration,
role, and protocol. It verified that the server-side authorization checks and
database controls cover the high-impact escalation paths listed below.

One medium operational gap was accepted and tracked in `MIN-413`: the security
policy refers to a live RLS/grants probe that is not present in the repository.
Static checks remain effective, but cannot prove that deployed Supabase policy,
grant, or Storage state matches the migration source.

## Threat model

See [the security threat model](../security-model.md). The material boundaries
are: an authenticated or direct Supabase user crossing tenants; a route handler
using service-role credentials; callbacks, OAuth/MCP clients, and integrations
crossing from unauthenticated input; and a compromised agent VM crossing into
the control plane or cloud credentials.

## Verified controls

| Surface | Evidence reviewed | Result |
| --- | --- | --- |
| Supabase RLS, grants, and definers | `supabase/migrations/*.sql`; `lib/schema-guardrails.test.ts`; `lib/server/tenancy-refs.test.ts` | Policies require explicit roles, migrations are guarded against missing RLS and unsafe `SECURITY DEFINER` grants, and service-role write cores reject cross-tenant references before writing. |
| Service role and admin | `lib/supabase-service.ts`; `lib/server/api-auth.ts`; `lib/server/admin.ts`; `app/api/admin/**` | The service client is server-only; routes authenticate before privileged queries; admin elevation requires immutable app metadata or a confirmed allowlisted email. |
| Webhooks, cron, OAuth, MCP, integrations | `app/api/{webhooks,stripe,cron,oauth,mcp,v1}/**`; `lib/server/oauth/**`; `lib/server/integration-auth.ts` | Signature/secret checks fail closed, deliveries are replay-aware, OAuth uses registered redirects plus PKCE and single-use codes, and integration keys are scoped. |
| Uploads, downloads, and outbound URLs | `lib/server/attachments.ts`; `app/api/attachments/file/route.ts`; `lib/server/{safe-fetch,pinned-request}.ts`; `lib/server/ssrf-surfaces.test.ts` | Object ownership and project scope are checked; sensitive URL consumers reject private and metadata destinations, including DNS-resolved private addresses. |
| Agent sandbox and local harness | `app/api/agent-vm/[...path]/route.ts`; `lib/server/agent/{control-plane,network-policy,local-exec-token}.ts`; VM-bundle tests | Cloud calls bind Vercel OIDC tenant and deterministic sandbox identity to a run; local calls use scoped, expiring signed tokens with reduced authority; platform secrets are structurally excluded from the VM bundle. |

## Findings

### MIN-411-M1 — live deployment authorization probe absent

**Severity:** Medium.
**Location:** `SECURITY.md` documents `scripts/security-probe.mjs`, but no such
file exists under `scripts/`.
**Impact:** A deployment drift in RLS, grants, Storage policy, or privileged
RPC exposure could evade the source-level guardrails.
**Disposition:** Accepted temporarily and tracked as `MIN-413` with a plan to
restore a redacted, explicitly authorized live probe. The static migration and
negative-path test suites remain required until then.

## Verification

The following targeted Vitest suites passed locally:

- Database/admin: 211 tests across schema guardrails, tenant references,
  admin checks, SSRF, OAuth, webhook tenant isolation, and agent admission.
- Request-facing paths: 251 tests across cron, callback/webhook, Stripe replay,
  OAuth, origin/CSRF, attachments, link previews, safe fetch, SSRF, and
  integration contracts.
- Agent boundaries: 213 tests across the control plane, network policy, local
  tokens and admission, VM secret exclusion, LLM proxy, redaction, and run
  access.
