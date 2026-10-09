---
{
  "id": "instance-configuration",
  "locale": "en",
  "title": "Instance configuration",
  "summary": "Configure origins, secrets and optional providers, expose the intended network endpoints and keep scheduled jobs running.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05",
    "H09",
    "H08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts",
      "docs/editions.md",
      "content/knowledge/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "workspace-encryption",
    "authentication-and-email",
    "architecture-and-data-flows",
    "update-an-instance",
    "numo"
  ],
  "aliases": [
    "optional-providers",
    "proxy-network-and-jobs"
  ],
  "tags": [
    "Configure instance origins, secrets and capabilities",
    "Enable optional providers deliberately",
    "Expose public origins and run scheduled work"
  ],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/en/optional-providers-flow.svg",
      "alt": "Diagram: Operator selects an optional capability. Complete credentials and provider conditions. Explicit outbound provider data path. Verify behavior and monitor usage costs.",
      "caption": "These components have distinct responsibilities. Operator selects an optional capability. Complete credentials and provider conditions. Explicit outbound provider data path. Verify behavior and monitor usage costs.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Operator selects an optional capability"
          },
          {
            "title": "Complete credentials and provider conditions"
          },
          {
            "title": "Explicit outbound provider data path"
          },
          {
            "title": "Verify behavior and monitor usage costs"
          }
        ]
      }
    },
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/en/proxy-network-and-jobs-flow.svg",
      "alt": "Diagram: Public HTTPS reverse proxy. Application and public Supabase origins. Private runner, database and internal ports. Authenticated scheduler; stopped in maintenance.",
      "caption": "These components have distinct responsibilities. Public HTTPS reverse proxy. Application and public Supabase origins. Private runner, database and internal ports. Authenticated scheduler; stopped in maintenance.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Public HTTPS reverse proxy"
          },
          {
            "title": "Application and public Supabase origins"
          },
          {
            "title": "Private runner, database and internal ports"
          },
          {
            "title": "Authenticated scheduler; stopped in maintenance"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "optional-providers-flow",
    "proxy-network-and-jobs-flow"
  ]
}
---

Instance configuration sets public origins, secrets and the services available to users. Preserve existing credentials before changing the protected environment, configure each optional provider as a complete set, then verify network exposure and authenticated scheduled jobs.

## Configure instance origins, secrets and capabilities {#instance-configuration}

Set MINDDY_PUBLIC_APP_URL to one absolute origin with no path or trailing slash. Public deployments use HTTPS; trusted private IPv4 and localhost installations may use HTTP. Set MINDDY_PUBLIC_SUPABASE_URL and MINDDY_PUBLIC_SUPABASE_ANON_KEY to the same selected Supabase stack. These values reach the browser. SUPABASE_SERVICE_ROLE_KEY is server-only and required in production. Never put it in a public variable or client bundle. A database URL is a tooling connection and does not replace the API configuration.

### Preserve generated secrets {#secrets}

The installer writes missing GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET and AGENT_RUNNER_SECRET. The content root must contain exactly 64 hexadecimal characters. Keep it outside PostgreSQL with a protected recovery copy. Keep the entire environment mode 0600 and out of Git. Do not source the environment as shell code or print it. Retrying installation does not rotate secrets. Losing encryption secrets can make existing data unreadable; deliberate rotation requires the matching recovery procedure.

### Apply and check a change {#capabilities}

MINDDY_PUBLIC_SITE_NAME and MINDDY_PUBLIC_CONTACT_EMAIL identify your instance. ADMIN_EMAILS is a comma-separated administrator allowlist; privileged access also requires MFA. OAUTH_ISSUER normally stays empty unless you intentionally advertise OAuth at another stable origin. Leave managed AI and billing disabled for self-hosting. Enable optional services only with their complete required configuration. Restart or recreate the application after changing runtime public values; the OCI image needs no rebuild. Run the doctor to distinguish incomplete capabilities from core failures, then test generated account links and callbacks against the intended origin.

## Enable optional providers deliberately {#optional-providers}

The core needs no Stripe, PostHog, Cloud account or minddy-managed AI key. External services add their own costs, permissions and data destinations. Review those terms before enabling them. Capability diagnostics report missing values rather than inventing a fallback provider. Self-hosting can use per-user AI keys or reachable local AI endpoints. Leave MINDDY_MANAGED_AI and MINDDY_MANAGED_BILLING off; configuring an OpenRouter key alone does not select Cloud.


![Diagram: Operator selects an optional capability. Complete credentials and provider conditions. Explicit outbound provider data path. Verify behavior and monitor usage costs.](/documentation/en/optional-providers-flow.svg)

### Configure complete provider sets {#configure}

Application email needs EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM and INVITATION_EMAIL_FROM. console is refused in production; Auth SMTP remains separate. Web Push needs its public/private VAPID pair and VAPID_SUBJECT, and existing subscriptions depend on that pair. Analytics needs a complete PostHog key/host pair; error tracking additionally needs MINDDY_PUBLIC_ERROR_TRACKING=1. The guided installer offers application-email and web-push and leaves external credentials for you to provide. Do not use minddy sender identities or native release credentials on a third-party instance.

### Connect Git and code execution {#git-and-code}

GitHub.com and GitLab.com are supported; Enterprise Server and self-managed GitLab are not supported by these adapters. User-initiated connections may use the managed forge relay; opt out with --no-forge-relay or MINDDY_FORGE_RELAY=0 and configure operator-owned apps. Existing connections retain their channel until reconnected. The reference server has a trusted self-hosted Docker runner. Vercel Sandbox is an explicit alternative requiring its credentials and a valid MINDDY_DATA_ROOT_KEY even when content encryption is off. Desktop-local code execution is retired. Missing execution configuration blocks delegation rather than running code on a user computer.

The published application image includes Node.js and Git but deliberately removes npm, npx and Corepack. The reference Compose profile also selects that image for workers through AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. This is insufficient for a fresh code worker: the OpenCode bootstrap uses npm to install its pinned runtime and plugin, even for a repository with no project dependencies. Without npm, execution stops at bootstrap; no project edit or test success can be inferred from the conversation. Use an operator-built and verified dedicated worker image with Node.js 24, npm, Git and the project’s required tools, selected by overriding AGENT_RUNNER_SANDBOX_IMAGE in the runner service. Keep the runner’s isolation constraints. Verify bootstrap, repository cloning, actual tests and the resulting diff before enabling code delegation. Fixing the runner files alone does not supply this worker toolchain.

## Expose public origins and run scheduled work {#proxy-network-and-jobs}

Public installations require a TLS reverse proxy and HTTP-to-HTTPS redirect. Application origin, Supabase public origin, Auth redirects, OAuth callbacks and forwarded headers must agree. Keep PostgreSQL, Studio, internal service ports and the agent runner off the Internet. Full-profile application requests use internal http://kong:8000 while browsers and generated links retain the public Supabase origin. Private HTTP requires localhost or trusted private IPv4 and no router port forwarding.


![Diagram: Public HTTPS reverse proxy. Application and public Supabase origins. Private runner, database and internal ports. Authenticated scheduler; stopped in maintenance.](/documentation/en/proxy-network-and-jobs-flow.svg)

### Provide authenticated scheduling {#schedules}

Reference Compose profiles start their scheduler and generate CRON_SECRET. Custom source deployments must run an equivalent HTTP scheduler. Every cron request sends `Authorization: Bearer <CRON_SECRET>`; empty or mismatched secrets return 401. Never log the header. The candidate schedules below are UTC. Use the schedule set belonging to the deployed release, because these paths can change with the application.


The released v0.11.0 scheduler does not include the numo-turns endpoint. The candidate scheduler has been corrected to include it once per minute. The table describes the corrected candidate schedule; do not assume this job exists in an unchanged v0.11.0 deployment.

| Endpoint | Schedule (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/automations` | `*/2 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Stop jobs during maintenance {#maintenance}

Stop the scheduler, application, workers and public Supabase access before backup or migration. Stopping only the web app still allows direct API writes. Run maintenance checks while jobs and public ingress remain closed, then reopen after database, Auth, Storage and application checks pass. Diagnose idle jobs by checking scheduler state, canonical origin and secret privately. Routines require a running server scheduler; no desktop app needs to stay online.
