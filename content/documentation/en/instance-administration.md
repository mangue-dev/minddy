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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/issue-relation-inference.ts",
      "lib/server/model-capability-validation.ts",
      "app/api/cron/issue-index/route.ts",
      "lib/server/issue-semantic-search.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; both screenshots recaptured on 2026-10-20 with captures/shots/documentation-admin and the preview-only capture admin (MIN-740); no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "alt": "Administrator overview with aggregate account, activity, onboarding and plan metrics.",
      "caption": "Overview shows aggregate instance indicators; this capture comes from a demonstration instance. Finances appears because a managed OpenRouter key is configured there.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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


![Administrator overview with aggregate account, activity, onboarding and plan metrics.](/documentation/en/instance-administration-overview.png)

![Instance AI model and reasoning settings.](/documentation/en/instance-administration-models.png)

## Use only capabilities present on the instance {#panels}

The console organizes Overview, Users, Models and conditional Finances panels. Finances is hidden when no linked managed OpenRouter capability exists; billing-related plan gifting depends on configured billing or an existing override. A self-hosted instance without commercial providers does not acquire Cloud billing by opening the console. **Users** finds an account only by its exact email address; open it to see its email confirmation status, review or reset its AI usage budget, gift a plan under the condition above, or mark it as an internal account, which leaves it out of every statistic. The panel does not show account activity or personal content; open an account only for a support or billing task. Review model/default configuration and user/quota controls on the actual deployed release before changing them. Administrative changes affect the instance rather than one project; use demonstration accounts for validation.

## Choose the AI decision model {#decision-model}

Under **Models**, **Automations**, **Decision model** sets the one decision model that answers every AI decision of the instance: Smart Fill, Smart Assign and the feedback review. There is no per-project, per-user or per-feature choice. The picker lists only OpenRouter models that publish the decision capability; chat, embedding and transcription models never appear. Saving test-calls the candidate with a representative decision. A model that is not a decision model, refuses the request, returns an invalid answer or takes longer than 5 seconds is refused, and the current model stays in use. When the catalog cannot be loaded, every change is refused. Self-hosted instances without managed AI have no platform catalog and keep the default, Jev.

New decisions use the saved model within about a minute on every server process. When the model fails or answers below the confidence threshold, the decision falls back to the feature’s own LLM model, as before. The threshold was calibrated on Jev and other decision models spread their confidence differently, so review agreement per model in the `ai_decision_evaluations_weekly` database view after a change. Usage rows record the model that answered.

## Configure Smart Fill relations {#smart-fill-relations}

After an issue is saved, Smart Fill can index it and link it to related issues. Two fields under **Models**, **Automations** govern this work:

- **Issue embeddings** chooses the model that turns issue titles and descriptions into vectors. The default is `openai/text-embedding-3-small`. Changing it starts a new index version: old and new vectors are never compared. The hourly `/api/cron/issue-index` job then indexes existing issues, 100 per run, and bills each project's owner; it never creates relations. The same model turns each query of search by meaning into a vector, using the searching member's AI provider settings, and queries are compared only with vectors of the current index version. Until an issue is indexed again, related-issue search and search by meaning reach it by its words only. The same job converts vectors stored in clear into encrypted ones once their project encrypts.
- **Relation decision model** is the LLM fallback that answers relation decisions when the [decision model](#decision-model) fails or is unsure, like each feature's own LLM model. The default is `deepseek/deepseek-v4-flash`.

Embedding and transcription fields refuse a model of the wrong family on save, for example a chat model in an embeddings field, and the current model stays in use. This check needs the platform catalog: when it cannot be loaded, as on a self-hosted instance without managed AI, the choice cannot be verified and is accepted. For members who run automations on their own key, the per-provider defaults include `issue_embedding_model`: `text-embedding-3-small` for OpenAI and `gemini-embedding-001` for Google.

## Keep operator duties outside the UI {#responsibilities}

You remain responsible for least-privilege administrator membership, MFA recovery, host secrets, backups, retention, incident handling and provider costs. The console does not replace a database-plus-Storage restore or SMTP test. If access is refused, check confirmed address, allowlist, verified MFA and live session before changing anything. Revoked or banned sessions do not retain privilege merely because a JWT has not expired. Do not include other users’ private data, security factors or financial details in documentation screenshots.
