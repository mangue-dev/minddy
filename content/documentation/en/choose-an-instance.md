---
{
  "id": "choose-an-instance",
  "locale": "en",
  "title": "Choose Cloud or your own instance",
  "summary": "Compare who operates the service, where data goes, and which optional providers you configure.",
  "topic": "Get started",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "S07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "v0.11.0",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "Cloud",
      "self-hosted"
    ],
    "evidence": [
      "docs/editions.md",
      "content/knowledge/open-source.md",
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "install-a-server",
    "managed-or-source-installation",
    "transfer-between-instances",
    "architecture-and-data-flows"
  ],
  "aliases": [
    "open-source"
  ],
  "tags": [],
  "figures": [
    {
      "id": "responsibilities",
      "kind": "diagram",
      "src": "/documentation/en/responsibilities.svg",
      "alt": "Operating responsibility: Operated by Minddy, Operated by you.",
      "caption": "The same core services need an operator in either model. Optional providers remain separate services.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        360,
        520
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "responsibilities"
  ]
}
---

## Choose an operating model {#choose-an-instance}

Minddy Cloud and self-hosted Minddy run the same public core. Choose Cloud if you want Minddy to operate the application, database, Storage and scheduler. Choose self-hosting if you need to select the hosting location, providers or upgrade schedule and can operate those services yourself.

A Cloud account belongs to Cloud. On a self-hosted instance, create an account on that instance; a Minddy Cloud account is not a prerequisite. Check the address before signing in or inviting someone. Accounts and credentials do not become shared merely because two instances run Minddy.

![Operating responsibility: Operated by Minddy, Operated by you.](/documentation/en/responsibilities.svg)

## Responsibilities and costs {#responsibilities}

| Responsibility | Cloud | Self-hosted |
| --- | --- | --- |
| Infrastructure, updates and incidents | Minddy operates the service. | You maintain the hosts, TLS, monitoring and release upgrades. |
| Backups and recovery | Minddy operates the Cloud service. | You preserve database data, Storage bytes, configuration and encryption keys, and rehearse restores. |
| Provider accounts | Minddy owns the accounts for services it operates. | You choose and pay for infrastructure and optional providers. |
| Support | Cloud support terms apply. | Release tooling and best-effort community help cover reproducible core defects; infrastructure operation has no included SLA. |

For example, a team without database operations capacity can use Cloud. An operator with data residency requirements can choose self-hosting and review each enabled provider's data destinations. Running the application yourself does not make an external AI, email or Git provider local.

## Required and optional services {#services}

A supported self-hosted installation needs the application and Supabase with PostgreSQL, Auth, Storage and Realtime. PostgreSQL alone is insufficient. Use a tagged release and its compatibility matrix. Unpinned derivative Supabase stacks and self-managed GitHub Enterprise or GitLab adapters are outside the supported contract.

AI, email, Git, push notifications and analytics depend on configuration. Self-hosting does not require Stripe, PostHog, a Minddy-managed AI key or a Cloud account. Missing optional configuration is reported rather than replaced silently with a provider. Personal AI keys and local AI endpoints are possible choices; their availability and costs depend on the configured capability.

Review provider permissions and data terms before enabling an integration. Git connections may use the managed forge relay when you explicitly start the integration; operator-owned provider applications and relay opt-out are also available. Core feature access is not a separate reduced self-hosted tier.

## Source and next step {#next-step}

The canonical source is [mangue-dev/minddy](https://github.com/mangue-dev/minddy), under GNU AGPL v3.0 only. Keep the license and naming policy in mind for modified or hosted deployments. For installation, open the public self-hosting guide and its guided installer. Before transferring existing work, check the instance transfer guide: credentials and subscriptions are not transferred with account data.
