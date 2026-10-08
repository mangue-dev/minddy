---
{
  "id": "optional-providers",
  "locale": "en",
  "title": "Enable optional providers deliberately",
  "summary": "The core needs no Stripe, PostHog, Cloud account or Minddy-managed AI key.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H09"
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
      "docs/editions.md",
      ".env.example",
      "lib/capabilities.ts",
      "content/knowledge/self-hosting.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "authentication-and-email",
    "architecture-and-data-flows",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/en/optional-providers-flow.svg",
      "alt": "Diagram: Operator selects an optional capability. Complete credentials and provider conditions. Explicit outbound provider data path. Verify behavior and monitor usage costs.",
      "caption": "These components have distinct responsibilities. Operator selects an optional capability. Complete credentials and provider conditions. Explicit outbound provider data path. Verify behavior and monitor usage costs.",
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
    "optional-providers-flow"
  ]
}
---

## Choose outbound data destinations {#optional-providers}

The core needs no Stripe, PostHog, Cloud account or Minddy-managed AI key. External services add their own costs, permissions and data destinations. Review those terms before enabling them. Capability diagnostics report missing values rather than inventing a fallback provider. Self-hosting can use per-user AI keys or reachable local AI endpoints. Leave MINDDY_MANAGED_AI and MINDDY_MANAGED_BILLING off; configuring an OpenRouter key alone does not select Cloud.


![Diagram: Operator selects an optional capability. Complete credentials and provider conditions. Explicit outbound provider data path. Verify behavior and monitor usage costs.](/documentation/en/optional-providers-flow.svg)

## Configure complete provider sets {#configure}

Application email needs EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM and INVITATION_EMAIL_FROM. console is refused in production; Auth SMTP remains separate. Web Push needs its public/private VAPID pair and VAPID_SUBJECT, and existing subscriptions depend on that pair. Analytics needs a complete PostHog key/host pair; error tracking additionally needs MINDDY_PUBLIC_ERROR_TRACKING=1. The guided installer offers application-email and web-push and leaves external credentials for you to provide. Do not use Minddy sender identities or native release credentials on a third-party instance.

## Connect Git and code execution {#git-and-code}

GitHub.com and GitLab.com are supported; Enterprise Server and self-managed GitLab are not supported by these adapters. User-initiated connections may use the managed forge relay; opt out with --no-forge-relay or MINDDY_FORGE_RELAY=0 and configure operator-owned apps. Existing connections retain their channel until reconnected. The reference server has a trusted self-hosted Docker runner. Vercel Sandbox is an explicit alternative requiring its credentials and a valid MINDDY_DATA_ROOT_KEY even when content encryption is off. Desktop-local code execution is retired. Missing execution configuration blocks delegation rather than running code on a user computer.

The published application image includes Node.js and Git but deliberately removes npm, npx and Corepack. The reference Compose profile also selects that image for workers through AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. This is insufficient for a fresh code worker: the OpenCode bootstrap uses npm to install its pinned runtime and plugin, even for a repository with no project dependencies. Without npm, execution stops at bootstrap; no project edit or test success can be inferred from the conversation. Use an operator-built and verified dedicated worker image with Node.js 24, npm, Git and the project’s required tools, selected by overriding AGENT_RUNNER_SANDBOX_IMAGE in the runner service. Keep the runner’s isolation constraints. Verify bootstrap, repository cloning, actual tests and the resulting diff before enabling code delegation. Fixing the runner files alone does not supply this worker toolchain.
