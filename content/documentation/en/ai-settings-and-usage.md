---
{
  "id": "ai-settings-and-usage",
  "locale": "en",
  "title": "AI settings and usage",
  "summary": "Configure personal AI keys and model defaults, and understand Cloud plan limits and usage accounting.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04",
    "A08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "components/settings/account-sandbox-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "scheduled-routines"
  ],
  "aliases": [
    "ai-keys-and-models",
    "plans-and-ai-usage",
    "plans-and-billing"
  ],
  "tags": [
    "Configure personal AI keys and model defaults",
    "Understand Cloud plans and AI consumption"
  ],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/ai-keys-and-models-workflow.png",
      "alt": "AI provider card with minddy Cloud selected.",
      "caption": "The selected Cloud provider uses the account plan. Personal providers are configured in this selector.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/ai-keys-and-models-defaults-workflow.png",
      "alt": "Code model and reasoning defaults.",
      "caption": "Code model and reasoning defaults. New code workers use these defaults; running workers retain their frozen settings.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/plans-and-ai-usage-workflow.png",
      "alt": "AI usage page for the demonstration account.",
      "caption": "AI usage page for the demonstration account. The current budget, usage categories and history are read from the account; no purchase or paid run was triggered.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Account AI settings choose the providers, personal keys and defaults used by supported features. Check model routing before starting work, then use the Cloud usage sections to distinguish provider billing, included AI allowance, sandbox compute and routine limits.

## Configure personal AI keys and model defaults {#ai-keys-and-models}

Open account AI settings, add a compatible provider and enter its key and any required base URL. Save and inspect the confirmation state. For AI calls with managed fallback available, an unconfirmed or unreachable key leaves usage on minddy. This depends on configured managed AI; code workers have the provider-bound model rules below. Never paste the key into a conversation or screenshot.

Assign text, transcription and embedding model families to compatible keys or keep them on minddy. For each key, choose its enabled surfaces: Numo conversation, code work, automations, voice and feedback. A surface or model family without a usable assignment stays on minddy usage. Your provider bills calls made with its key. Server-sandbox compute still has a real cost and is recorded in usage. This recording is separate from applying an account limit: a worker using validated BYOK bypasses the plan quota and compute cap, while minddy-funded work remains subject to its included allowance.

![AI provider card with minddy Cloud selected.](/documentation/en/ai-keys-and-models-workflow.png)

### Models and execution location {#models}

Code-model choices are tied to their provider. After changing, disabling or losing a personal key, the previous choice may no longer match the active provider. A new worker then refuses to start until you choose a compatible code model in account AI settings; it does not silently select a cheaper model or a platform default. An already frozen BYOK run does not switch payer when its key becomes unavailable.
Set the default code model and reasoning for new workers here. Existing workers keep their frozen reasoning level. Choose sandbox region and size for new sandboxes separately. These defaults do not replace the model selected in a conversation.

Local Ollama or OpenAI-compatible endpoints can serve conversations through the desktop bridge when configured. They cannot serve delegated code work or routines running in the server sandbox. Use a server-reachable provider for those surfaces. Remove a provider with its confirmation control when no longer needed and check the resulting routing before the next run.

![Code model and reasoning defaults.](/documentation/en/ai-keys-and-models-defaults-workflow.png)

## Understand Cloud plans and AI consumption {#plans-and-ai-usage}

Cloud offers Free, Go and Pro. All include MCP, Numo conversations, contextual actions, code work and routines. Capacity, included AI, models and storage differ. Open Billing for your current allowance and usage, and compare the public pricing page before choosing a plan; the figures shown there are the current reference.

Use the offered checkout or subscription-management action for your account. Review the amount, billing period and provider confirmation before accepting. A successful plan change should appear in account billing; verify that rather than treating a closed checkout window as proof.

### What consumes budget {#consumption}

Included AI usage covers reasoning, minddy tool calls, automation, worker model calls and server-sandbox compute. The monthly included-AI limit applies to work funded by minddy. A routine’s per-run cap is a separate limit that can pause its execution; completed work stays in the conversation. These limits do not authorize automatic overage charges. Inspect the limit card and reset date when available.

Compatible personal keys bill model calls to their provider instead of included AI usage. A worker using a validated BYOK key bypasses the account’s plan quota and compute cap. Sandbox compute still has a real cost and is recorded in usage; recording that cost does not mean the monthly plan cap is applied to that BYOK run. Unassigned families or surfaces that use minddy-funded calls remain subject to their minddy allowance. Self-hosting has infrastructure and optional-provider costs determined by your installation; it does not become a Cloud subscription merely by running the same core.

### Candidate capacity reference {#plan-capacities}

These defaults describe the identified 0.11.1 candidate. Verify the live pricing page and account before purchasing; configured checkout prices and account overrides can differ. Guests exclude the project owner. Storage is charged to the owner of the project receiving files.

| Plan | Projects | Issues per project | Guests per project | Storage | Included monthly AI (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Unlimited | Unlimited | Unlimited | 20 GiB | 5 |
| Pro | Unlimited | Unlimited | Unlimited | 100 GiB | 15 |

![AI usage page for the demonstration account.](/documentation/en/plans-and-ai-usage-workflow.png)
