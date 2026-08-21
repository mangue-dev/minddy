# Editions and managed services

## Decision

minddy is an **AGPL-3.0-only** core that can be installed and used without a
minddy account, Stripe, minddy AI credits, or calls to infrastructure operated
by minddy. An installation is self-hosted by default. Services operated by
minddy are explicit opt-ins: an environment key alone does not activate them.

| Perimeter | Self-Hosted Core (AGPL) | Cloud minddy | Possible business service |
| --- | --- | --- | --- |
| Product | Application, API, migrations, exports, desktop, MCP and administration | Same heart, hosted and operated by minddy | No modules distributed to date |
| Data and accounts | Operator Instance and Supabase | Operated by minddy | Cannot become necessary to the heart |
| Payment | No Stripe required; no map or plan blocks the heart | Stripe, only when `MINDDY_MANAGED_BILLING=1` and its configuration is complete | Support, SLA, migration or exploitation, outside of this repository |
| AI | BYOK to a chosen provider, or local endpoint/self-hosted model; the key and the cost remain with the operator | Minddy quota only when `MINDDY_MANAGED_AI=1` and OpenRouter is configured | Can be operated as a separate service, never as a heart lock |
| Limits | No commercial limits on projects, tickets, members or agents | Plans and quotas measured in the ledger, according to the cloud contract | To be re-decided after checking the chain of rights |

## Configuration contract

- `MINDDY_MANAGED_BILLING=1` enables Stripe integration **if** secrets and
  the required price IDs are present. Otherwise the service is unavailable; no
  Stripe request is sent and purchase routes return `503`.
- `MINDDY_MANAGED_AI=1` authorizes the OpenRouter platform key. Without this opt-in,
  minddy never chooses `OPENROUTER_API_KEY` as a fallback: an AI call requires
  a BYOK key or a local endpoint configured by the operator.
- These two flags are the only edition selection. The hostname, Vercel, the
  branch name and a customer ID cannot activate billing or
  managed quota, including on `minddy.app` and on the `production` branch.
- The cloud interface only displays purchases, Stripe portal, budget and limits
  when the corresponding abilities are active. The API exposes these
  capabilities so that customers never infer a right from a key or
  default plan.
- `MINDDY_EDITION=cloud` selects Cloud-managed billing and AI only; it does not
  activate code execution. Minddy Cloud deployments that offer routines must
  set `AGENT_EXECUTION_BACKEND=vercel` explicitly. Without it, a scheduled
  routine is skipped with `executionBackendUnavailable`.
- `AGENT_EXECUTION_BACKEND=vercel` authorizes the creation or awakening of a
  Vercel Sandbox. Vercel identifiers present for domains
  therefore never trigger compute. On a Vercel-hosted deployment, Sandbox uses
  OIDC. Outside Vercel, set `VERCEL_TOKEN`, `VERCEL_TEAM_ID`,
  `VERCEL_PROJECT_ID`, and `MINDDY_PUBLIC_APP_URL` so the application can use
  the operator's Vercel Sandbox project. `AGENT_EXECUTION_BACKEND=self-hosted`
  uses the built-in server runner and is the default in the reference Compose
  profiles. `AGENT_EXECUTION_BACKEND=local` is limited to desktop-initiated runs
  and cannot execute scheduled routines.
- `EMAIL_PROVIDER=resend` is required before any call to the Resend API. The
  senders are mandatory and instance-specific; no minddy domain is chosen by
  default.
- PostHog is an optional public core provider, not a reserved capacity
  for the Cloud. Each surface requires its own pair:
  `MINDDY_PUBLIC_POSTHOG_KEY` + `MINDDY_PUBLIC_POSTHOG_HOST` for the browser,
  `POSTHOG_API_KEY` + `POSTHOG_HOST` for the server. A missing server pair
  can reuse the full public pair; two half pairs are never
  assembled. The operator therefore chooses the PostHog destination, while
  Minddy Cloud provides its own operating configuration.
- Web Push requires an explicit `VAPID_SUBJECT`, and APNs require an explicit `APNS_BUNDLE_ID`.
- Vercel Analytics and Speed Insights are displayed on public pages only
  with `MINDDY_PUBLIC_VERCEL_ANALYTICS=1`.
- Built-in Git providers target `github.com` and `gitlab.com`. Self-hosted
  forges are not supported until a configurable provider exists.
- The managed forge relay (docs/managed-forge-relay-plan.md) lets a self-hosted
  instance use the GitHub App and GitLab OAuth app operated by minddy instead
  of operator-owned apps. It activates only with `MINDDY_FORGE_RELAY_URL` +
  `MINDDY_FORGE_RELAY_INSTANCE_ID` + `MINDDY_FORGE_RELAY_SECRET` and a
  completed instance claim; the Cloud side of the relay additionally requires
  `MINDDY_EDITION=cloud` and `MINDDY_MANAGED_FORGE=1` (the relay API —
  instance registry, token minting, link mirror — lives in this codebase and
  answers 503 without that gate). An operator-owned app, when configured,
  takes precedence for new connections — an existing connection keeps the
  channel it was established through until it is reconnected via the other
  one. An absent relay configuration
  stays disabled; it does not fall back to Minddy infrastructure.

Old deductions based on Vercel deployment or origin
`*.minddy.app` no longer selects managed services. Cloud deployment
must provide the same explicit flags as any operator.

The executable catalog of these decisions lives in `lib/capabilities.ts`. It
classifies each capability (`required`, `replaceable`, `optional`), lists
missing variables, and produces the diagnosis used by the server guards.

## BYOK, local models and managed quota

**BYOK** is a user-provided key for a remote provider. The
provider then bills the key holder for the tokens. A **self-hosted model** is a
local or private endpoint configured by the operator; no call leaves the
infrastructure designated by that endpoint. The **mindy quota**
is distinct: it only applies to the tokens and compute actually provided
by the minddy cloud, and its cost is recorded in `ai_usage`.

So a self-hosted installation can voluntarily use OpenRouter
with its own BYOK key; this does not transform this instance into a client of the
quota minddy. Conversely, a cloud instance that offers the platform key
continues to measure its calls and compute before serving them.

## CI matrix of editions

The `Édition / …` job of `.github/workflows/ci.yml` executes each scenario in
a disposable GitHub Actions job, without `secrets.*`. The values under
`test/fixtures/editions/` are dummy tokens that provide access to no supplier.
The two deployable editions (`self-hosted-minimal` and
`minddy-cloud`) also go through `next build`, then a real HTTP start;
partial configurations are tested as unavailable capacities.

| Fixture | Expected |
| --- | --- |
| `self-hosted-minimal.env` | The core starts without Stripe or managed AI; no commercial guard reads the plan. |
| `self-hosted-byok.env` | The operator key is the payer; no quota, ledger or Minddy supplier account is consulted. |
| `minddy-cloud.env` | Billing and managed AI are ready; plan guards, Stripe webhook, platform payer and quota are active. |
| `partial-billing.env` | Billing is announced `incomplete`, missing variables are listed and the webhook responds `503`. |
| `partial-ai.env` | Managed AI is announced `incomplete` and the runtime refuses any platform fallback. |
| `implicit-identifiers.env` | Domain `minddy.app`, Vercel, branch `production`, client identifier and keys present remain self-hosted without opt-in. |
| `managed-forge.env` | The instance starts without any operator-owned forge app; GitHub and GitLab are announced as served by the managed forge relay, and no local app variable is read. |

The integration test covers together `lib/managed-services.ts`, the catalog of
capabilities, `lib/server/entitlements.ts`, the Stripe adapter and webhook,
`lib/server/ai-runtime.ts` and `lib/server/agent/quota.ts`. To replay a
fixture locally from the repository root:

```bash
set -a
source test/fixtures/editions/self-hosted-minimal.env
set +a
pnpm exec vitest run lib/server/editions.integration.test.ts
```

## Repository boundary

The boundary follows the [licensing policy](licensing.md): the core and
everything necessary for normal use remains in this AGPL repository. Billing,
support, fleet supervision, operations, and any future business commitments
live in a separate service or repository and use documented protocols.
There is currently no Enterprise package or proprietary extension
chargeable by the core. Any change to this boundary requires the chain-of-rights
review specified by `docs/licensing.md`.
