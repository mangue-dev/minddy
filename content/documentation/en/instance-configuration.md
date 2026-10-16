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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "deploy/self-hosted/scheduler.mjs",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "content/documentation/reviews/documentation-error-feedback-2026-10-10.md",
      "content/documentation/reviews/min-677-routines.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence); agent:/root/min-721 (code-runner removal checked against the edited Compose profiles, installer, doctor, scheduler and capability source; existing figures and procedural evidence retained; no operational rerun)",
    "language": "agent:/root (en translation, label and retained-meaning self-review); agent:/root/min-721 (en runner-removal edits and full retained meaning)",
    "date": "2026-10-16"
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
      "caption": "Enabling an optional service adds its own credentials, data destination and usage costs.",
      "revision": 7,
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
      "alt": "Diagram: Public HTTPS reverse proxy. Application and public Supabase origins. Private database and internal ports. Authenticated scheduler; stopped in maintenance.",
      "caption": "Public access uses HTTPS while internal services stay private and scheduled jobs pause during maintenance.",
      "revision": 7,
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
            "title": "Private database and internal ports"
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

Set `MINDDY_PUBLIC_APP_URL` to one absolute origin with no path or trailing slash. Public deployments use HTTPS; trusted private IPv4 and `localhost` installations may use HTTP. Set `MINDDY_PUBLIC_SUPABASE_URL` and `MINDDY_PUBLIC_SUPABASE_ANON_KEY` to the same selected Supabase stack. These values reach the browser. `SUPABASE_SERVICE_ROLE_KEY` is server-only and required in production. Never put it in a public variable or client bundle. A database URL is a tooling connection and does not replace the API configuration.

### Preserve generated secrets {#secrets}

The installer writes missing `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `MINDDY_DATA_ROOT_KEY` and `CRON_SECRET`. The content root must contain exactly 64 hexadecimal characters. Keep it outside PostgreSQL with a protected recovery copy. Keep the entire environment mode `0600` and out of Git. Do not source the environment as shell code or print it. Retrying installation does not rotate secrets. Losing encryption secrets can make existing data unreadable; deliberate rotation requires the matching recovery procedure.

### Apply and check a change {#capabilities}

`MINDDY_PUBLIC_SITE_NAME` and `MINDDY_PUBLIC_CONTACT_EMAIL` identify your instance. `ADMIN_EMAILS` is a comma-separated administrator allowlist; privileged access also requires MFA. `OAUTH_ISSUER` normally stays empty unless you intentionally advertise OAuth at another stable origin. Leave managed AI and billing disabled for self-hosting. Enable optional services only with their complete required configuration. Restart or recreate the application after changing runtime public values; the OCI image needs no rebuild. Run the doctor to distinguish incomplete capabilities from core failures, then test generated account links and callbacks against the intended origin.

### Configure feedback and documentation reports {#product-feedback}

Set `MINDDY_FEEDBACK_KEY` to a feedback integration key to enable Share feedback in the app. For documentation reports, create a separate feedback integration in the receiving project, select the Documentation objective as its default, and store its key as `MINDDY_DOCUMENTATION_FEEDBACK_KEY`. Both keys stay on the server. Submissions use `/api/v1/feedback` on the origin set by `MINDDY_PUBLIC_APP_URL`. Restart the application after changing these values.

Report an error on an article requires a signed-in account. After signing in, the reader returns to the same article with the Share feedback dialog open. The title and description start empty. After submission, the server appends the article ID, language, revision and public URL to the report; those details are not editable form fields. The documentation integration automatically links the report to its selected objective. Without `MINDDY_DOCUMENTATION_FEEDBACK_KEY`, the report button is disabled with an explanation.

## Enable optional providers deliberately {#optional-providers}

The core needs no Stripe, PostHog, Cloud account or minddy-managed AI key. External services add their own costs, permissions and data destinations. Review those terms before enabling them. Capability diagnostics report missing values rather than inventing a fallback provider. Self-hosting can use per-user AI keys or reachable local AI endpoints. Leave `MINDDY_MANAGED_AI` and `MINDDY_MANAGED_BILLING` off; configuring an OpenRouter key alone does not select Cloud.


![Diagram: Operator selects an optional capability. Complete credentials and provider conditions. Explicit outbound provider data path. Verify behavior and monitor usage costs.](/documentation/en/optional-providers-flow.svg)

### Configure complete provider sets {#configure}

Application email needs `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `FEEDBACK_EMAIL_FROM` and `INVITATION_EMAIL_FROM`. `console` is refused in production; Auth SMTP remains separate. Web Push needs its public/private VAPID pair and `VAPID_SUBJECT`, and existing subscriptions depend on that pair. Analytics needs a complete PostHog key/host pair; error tracking additionally needs `MINDDY_PUBLIC_ERROR_TRACKING=1`. The guided installer offers `application-email` and `web-push` and leaves external credentials for you to provide. Do not use minddy sender identities or native release credentials on a third-party instance.

### Connect Git and code execution {#git-and-code}

GitHub.com and GitLab.com are supported; Enterprise Server and self-managed GitLab are not supported by these adapters. User-initiated connections may use the managed forge relay; opt out with `--no-forge-relay` or `MINDDY_FORGE_RELAY=0` and configure operator-owned apps. Existing connections retain their channel until reconnected. Numo does not run code, so the reference server needs no code runner or sandbox, and no service receives the Docker socket. Settings left by an earlier release, such as `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` and the Vercel Sandbox credentials, are ignored; remove them from the protected environment.

## Expose public origins and run scheduled work {#proxy-network-and-jobs}

Public installations require a TLS reverse proxy and HTTP-to-HTTPS redirect. Application origin, Supabase public origin, Auth redirects, OAuth callbacks and forwarded headers must agree. Keep PostgreSQL, Studio and internal service ports off the Internet. Full-profile application requests use internal `http://kong:8000` while browsers and generated links retain the public Supabase origin. Private HTTP requires `localhost` or trusted private IPv4 and no router port forwarding.


![Diagram: Public HTTPS reverse proxy. Application and public Supabase origins. Private database and internal ports. Authenticated scheduler; stopped in maintenance.](/documentation/en/proxy-network-and-jobs-flow.svg)

### Provide authenticated scheduling {#schedules}

Reference Compose profiles start their scheduler and generate `CRON_SECRET`. Custom source deployments must run an equivalent HTTP scheduler. Every cron request sends `Authorization: Bearer <CRON_SECRET>`; empty or mismatched secrets return 401. Never log the header. The candidate schedules below are UTC. Use the schedule set belonging to the deployed release, because these paths can change with the application.


The released v0.11.0 scheduler does not include the `numo-turns` endpoint. The candidate scheduler has been corrected to include it once per minute. The table describes the corrected candidate schedule; do not assume this job exists in an unchanged v0.11.0 deployment.

| Endpoint | Schedule (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Stop jobs during maintenance {#maintenance}

Stop the scheduler, application, workers and public Supabase access before backup or migration. Stopping only the web app still allows direct API writes. Run maintenance checks while jobs and public ingress remain closed, then reopen after database, Auth, Storage and application checks pass. Diagnose idle jobs by checking scheduler state, canonical origin and secret privately. Routines require a running server scheduler; no desktop app needs to stay online.
