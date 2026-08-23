# Minddy Cloud and self-hosted

## The promise

Minddy Cloud is the hosted, operated option from Minddy. Self-hosted minddy is
the same public AGPL-3.0-only core running on infrastructure you choose. It
does not need a Minddy account, Stripe, PostHog, or any Minddy-managed provider.

There is no reduced self-hosted edition and no private module required for
normal use. The choice is about who operates the service, holds provider
accounts, performs backups and upgrades, and supplies support—not about which
product features a person is allowed to use.

## Which should I choose?

Choose **Minddy Cloud** when you want Minddy to run the application and its
operational dependencies for you. It is the right fit when a managed service,
Cloud billing, and product support matter more than controlling the hosting
stack.

Choose **self-hosted** when you need to control the hosting location, data
destinations, provider accounts, or upgrade schedule, and can take on the
operational work. A single developer can run it locally; a team can operate a
documented server installation.

Examples:

- A small product team that does not want to operate databases or backups uses
  Minddy Cloud.
- A company with residency requirements runs self-hosted minddy and selects its
  own Supabase, storage, email, analytics, AI, and Git providers.
- An individual developer runs the local self-hosted route with no public
  domain, Minddy account, or optional integration.

## Responsibility and data matrix

| Question | Minddy Cloud | Self-hosted |
| --- | --- | --- |
| Who is it for? | Teams that want a service operated by Minddy. | Operators who want infrastructure and provider control. |
| Is the product different? | No. It runs the public core. | No. It runs the same public core and release artifacts. |
| Who runs the app, database, Storage, and scheduler? | Minddy. | The operator, using the supported deployment paths. |
| Who owns the provider accounts? | Minddy for services it operates. | The operator chooses and owns every configured provider account. |
| Where does instance data go? | To the services configured and operated for Minddy Cloud. | It stays in operator-selected infrastructure unless the operator explicitly enables an integration. |
| Is a Minddy account required? | Yes, to use Cloud. | No. |
| Is Stripe required? | Only for Minddy Cloud subscriptions. | No. |
| Is PostHog required? | Minddy Cloud may configure it for its service. | No. It is off unless the operator configures an endpoint. |
| Are AI, email, Git, push, analytics, or managed services required? | Cloud can operate selected services. | No. Each is optional and disabled until configured. BYOK and local AI endpoints are supported choices. |
| Who creates backups and runs restores? | Minddy, as part of operating Cloud. | The operator: database, Storage, configuration, retention, and restore drills. |
| Who applies updates and handles incidents? | Minddy. | The operator follows the versioned upgrade and operations runbooks. |
| What support is included? | The Cloud support terms apply. | Release tooling and best-effort community help for reproducible core defects; no SLA or infrastructure operation. |
| What does it cost? | Cloud subscription and any applicable service usage. | The operator pays its infrastructure and optional providers. |

## Self-hosted data flows

With only required configuration, a self-hosted instance communicates with its
operator-selected application host and Supabase stack. It does not call Minddy
Cloud, Stripe, PostHog, OpenRouter, or any other managed provider by default.
Optional capabilities make their own outbound calls only after the operator
enables or connects them. GitHub and GitLab may use the managed forge relay as
their connection channel when an operator explicitly starts that integration;
operator-owned provider apps and the explicit relay opt-out remain available.

This includes AI, email, GitHub/GitLab, web push, analytics, and any external
object storage. A self-hosted operator should review each provider's data terms
before enabling it. The configuration and doctor commands report incomplete
optional capabilities instead of selecting a fallback provider.

## Supported self-hosted operation

The two supported paths, release compatibility, upgrade guarantees, and
operator responsibilities are in the
[self-hosted distribution contract](self-hosting-distribution.md). The quick
summary is:

- use the tagged source or official image from
  [`mangue-dev/minddy`](https://github.com/mangue-dev/minddy);
- run a Next.js application and a Supabase stack that provides Postgres, Auth,
  Storage, and Realtime;
- use the documented compatibility matrix and verification commands;
- maintain TLS, secrets, host patching, monitoring, backups, restore tests, and
  upgrades for a shared deployment.

The core intentionally does not support PostgreSQL alone, unpinned derivative
Supabase stacks, or self-managed GitHub Enterprise/GitLab adapters. Those are
compatibility limits, not feature gates.

## Managed capabilities are explicit opt-ins

`MINDDY_MANAGED_BILLING=1` enables Stripe integration only when its complete
configuration is present. `MINDDY_MANAGED_AI=1` authorizes the Cloud-managed
OpenRouter platform key only when it is configured. `MINDDY_EDITION=cloud`
selects Cloud-managed billing and AI; it never activates code execution by
itself. A hostname, Vercel deployment, branch name, customer ID, or environment
key cannot silently switch an installation to Cloud or enable a provider.

PostHog needs a complete browser or server pair, `EMAIL_PROVIDER=resend` needs
the operator's sender configuration, and Vercel Analytics needs an explicit
public flag. The executable catalog in `lib/capabilities.ts` classifies each
capability and reports missing configuration.

The CI edition matrix tests the minimal self-hosted, BYOK, Cloud, partial
configuration, and implicit-identifier scenarios without real provider
credentials. See `test/fixtures/editions/` and
`lib/server/editions.integration.test.ts`.

## Distribution boundary

Everything required to install, administer, use, export, and scale the core is
in this AGPL repository. Cloud hosting, support, billing, fleet supervision,
and any future commercial commitments are operated services rather than a
separate product edition. See [the licensing policy](licensing.md).
