---
{
  "id": "instance-administration",
  "locale": "en",
  "title": "Instance administration",
  "summary": "Instance administration is separate from project ownership.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate with the global decision model (MIN-694)",
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
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md",
      "lib/ai-model-config.ts",
      "app/api/admin/app-config/route.ts",
      "lib/server/decisions/model-validation.ts",
      "docs/plans/min-694-decision-model-selection.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-694 decision model selector, save validation and fallback source and test review; live decision probes recorded in docs/plans/min-694-decision-model-selection.md; existing figures unchanged)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-694 six-locale decision model section meaning review; agent review, not human acceptance)",
    "date": "2026-10-16"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Use the instance administrator console"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/en/instance-administration-overview.png",
      "alt": "Administrator overview with aggregate account, onboarding and content metrics.",
      "caption": "Overview shows aggregate instance indicators. Finances is absent on this demonstration profile because no managed OpenRouter key is configured.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/en/instance-administration-models.png",
      "alt": "Instance AI model and reasoning settings.",
      "caption": "Models configures defaults and dedicated uses. This capture shows the existing configuration; no model or provider setting was changed.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Establish privileged access {#instance-administration}

Instance administration is separate from project ownership. Set `ADMIN_EMAILS` to authorized confirmed account addresses in the server environment. Server-signed `app_metadata.role=admin` is another accepted role source. A valid administrator session also requires `aal2`, enrolled verified MFA and current live account/session checks. The server fails closed when those checks fail. Sign in, complete TOTP and open `/admin`. Do not edit database roles to bypass enrollment. The administrator console and its private APIs remain `noindex`.


![Administrator overview with aggregate account, onboarding and content metrics.](/documentation/en/instance-administration-overview.png)

![Instance AI model and reasoning settings.](/documentation/en/instance-administration-models.png)

## Use only capabilities present on the instance {#panels}

The console organizes Overview, Users, Models and conditional Finances panels. Finances is hidden when no linked managed OpenRouter capability exists; billing-related plan gifting depends on configured billing or an existing override. A self-hosted instance without commercial providers does not acquire Cloud billing by opening the console. Review model/default configuration and user/quota controls on the actual deployed release before changing them. Administrative changes affect the instance rather than one project; use demonstration accounts for validation.

## Choose the AI decision model {#decision-model}

Under **Models**, **Automations**, **Decision model** sets the one decision model that answers every AI decision of the instance: Smart Fill, Smart Assign and the feedback review. There is no per-project, per-user or per-feature choice. The picker lists only OpenRouter models that publish the decision capability; chat, embedding and transcription models never appear. Saving test-calls the candidate with a representative decision. A model that is not a decision model, refuses the request, returns an invalid answer or takes longer than 5 seconds is refused, and the current model stays in use. When the catalog cannot be loaded, every change is refused. Self-hosted instances without managed AI have no platform catalog and keep the default, Jev.

New decisions use the saved model within about a minute on every server process. When the model fails or answers below the confidence threshold, the decision falls back to the feature’s own LLM model, as before. **AI decisions** remains the incident switch that sends every decision to that LLM model. The threshold was calibrated on Jev and other decision models spread their confidence differently, so review agreement per model in the `ai_decision_evaluations_weekly` database view after a change. Usage rows record the model that answered.

## Keep operator duties outside the UI {#responsibilities}

You remain responsible for least-privilege administrator membership, MFA recovery, host secrets, backups, retention, incident handling and provider costs. The console does not replace a database-plus-Storage restore or SMTP test. If access is refused, check confirmed address, allowlist, verified MFA and live session before changing anything. Revoked or banned sessions do not retain privilege merely because a JWT has not expired. Do not include other users’ private data, security factors or financial details in documentation screenshots.
