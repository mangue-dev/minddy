---
{
  "id": "proxy-network-and-jobs",
  "locale": "en",
  "title": "Expose public origins and run scheduled work",
  "summary": "Public installations require a TLS reverse proxy and HTTP-to-HTTPS redirect.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "update-an-instance",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/en/proxy-network-and-jobs-flow.svg",
      "alt": "Diagram: Public HTTPS reverse proxy. Application and public Supabase origins. Private runner, database and internal ports. Authenticated scheduler; stopped in maintenance.",
      "caption": "These components have distinct responsibilities. Public HTTPS reverse proxy. Application and public Supabase origins. Private runner, database and internal ports. Authenticated scheduler; stopped in maintenance.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "proxy-network-and-jobs-flow"
  ]
}
---

## Expose only the intended services {#proxy-network-and-jobs}

Public installations require a TLS reverse proxy and HTTP-to-HTTPS redirect. Application origin, Supabase public origin, Auth redirects, OAuth callbacks and forwarded headers must agree. Keep PostgreSQL, Studio, internal service ports and the agent runner off the Internet. Full-profile application requests use internal http://kong:8000 while browsers and generated links retain the public Supabase origin. Private HTTP requires localhost or trusted private IPv4 and no router port forwarding.


![Diagram: Public HTTPS reverse proxy. Application and public Supabase origins. Private runner, database and internal ports. Authenticated scheduler; stopped in maintenance.](/documentation/en/proxy-network-and-jobs-flow.svg)

## Provide authenticated scheduling {#schedules}

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


## Stop jobs during maintenance {#maintenance}

Stop the scheduler, application, workers and public Supabase access before backup or migration. Stopping only the web app still allows direct API writes. Run maintenance checks while jobs and public ingress remain closed, then reopen after database, Auth, Storage and application checks pass. Diagnose idle jobs by checking scheduler state, canonical origin and secret privately. Routines require a running server scheduler; no desktop app needs to stay online.
