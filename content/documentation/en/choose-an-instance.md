---
{
  "id": "choose-an-instance",
  "locale": "en",
  "title": "Cloud and self-hosted instances",
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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "installation",
    "transfer-between-instances",
    "architecture-and-data-flows"
  ],
  "aliases": [
    "open-source"
  ],
  "tags": [
    "Choose Cloud or your own instance"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Choose an operating model {#choose-an-instance}

minddy Cloud and self-hosted minddy run the same public core. Choose Cloud if you want minddy to operate the application, database, Storage and scheduler. Choose self-hosting if you need to select the hosting location, providers or upgrade schedule and can operate those services yourself.

A Cloud account belongs to Cloud. On a self-hosted instance, create an account on that instance; a minddy Cloud account is not a prerequisite. Check the address before signing in or inviting someone. Accounts and credentials do not become shared merely because two instances run minddy.


## Responsibilities and costs {#responsibilities}

| Responsibility | Cloud | Self-hosted |
| --- | --- | --- |
| Infrastructure, updates and incidents | minddy operates the service. | You maintain the hosts, TLS, monitoring and release upgrades. |
| Backups and recovery | minddy operates the Cloud service. | You preserve database data, Storage bytes, configuration and encryption keys, and rehearse restores. |
| Provider accounts | minddy owns the accounts for services it operates. | You choose and pay for infrastructure and optional providers. |
| Support | Cloud support terms apply. | Release tooling and best-effort community help cover reproducible core defects; infrastructure operation has no included SLA. |

For example, a team without database operations capacity can use Cloud. An operator with data residency requirements can choose self-hosting and review each enabled provider's data destinations. Running the application yourself does not make an external AI, email or Git provider local.

## Required and optional services {#services}

A supported self-hosted installation needs the application and Supabase with PostgreSQL, Auth, Storage and Realtime. PostgreSQL alone is insufficient. Use a tagged release and its compatibility matrix. Unpinned derivative Supabase stacks and self-managed GitHub Enterprise or GitLab adapters are outside the supported contract.

AI, email, Git, push notifications and analytics depend on configuration. Self-hosting does not require Stripe, PostHog, a minddy-managed AI key or a Cloud account. Missing optional configuration is reported rather than replaced silently with a provider. Personal AI keys and local AI endpoints are possible choices; their availability and costs depend on the configured capability.

Review provider permissions and data terms before enabling an integration. Git connections may use the managed forge relay when you explicitly start the integration; operator-owned provider applications and relay opt-out are also available. Core feature access is not a separate reduced self-hosted tier.

## Source and next step {#next-step}

The canonical source is [`mangue-dev/minddy`](https://github.com/mangue-dev/minddy), under GNU AGPL v3.0 only. Keep the license and naming policy in mind for modified or hosted deployments. For installation, open the [self-hosted installation guide](/docs/installation) and its guided installer. Before transferring existing work, check the [account-data transfer guide](/docs/transfer-between-instances): credentials and subscriptions are not transferred with account data.
