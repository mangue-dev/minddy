---
{
  "id": "ai-keys-and-models",
  "locale": "en",
  "title": "Configure personal AI keys and model defaults",
  "summary": "Choose provider routing and surfaces while accounting for provider bills and sandbox usage.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/ai-keys-and-models-workflow.png",
      "alt": "AI provider card with minddy Cloud selected.",
      "caption": "The selected Cloud provider uses the account plan. Personal providers are configured in this selector.",
      "revision": 3,
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
      "revision": 3,
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
    "ai-keys-and-models-defaults-workflow"
  ]
}
---

## Add and route a provider {#ai-keys-and-models}
Open account AI settings, add a compatible provider and enter its key and any required base URL. Save and inspect the confirmation state. For AI calls with managed fallback available, an unconfirmed or unreachable key leaves usage on Minddy. This depends on configured managed AI; code workers have the provider-bound model rules below. Never paste the key into a conversation or screenshot.

Assign text, transcription and embedding model families to compatible keys or keep them on Minddy. For each key, choose its enabled surfaces: Numo conversation, code work, automations, voice and feedback. A surface or model family without a usable assignment stays on Minddy usage. Your provider bills calls made with its key. Server-sandbox compute still has a real cost and is recorded in usage. This recording is separate from applying an account limit: a worker using validated BYOK bypasses the plan quota and compute cap, while Minddy-funded work remains subject to its included allowance.

![AI provider card with minddy Cloud selected.](/documentation/en/ai-keys-and-models-workflow.png)


## Models and execution location {#models}

Code-model choices are tied to their provider. After changing, disabling or losing a personal key, the previous choice may no longer match the active provider. A new worker then refuses to start until you choose a compatible code model in account AI settings; it does not silently select a cheaper model or a platform default. An already frozen BYOK run does not switch payer when its key becomes unavailable.
Set the default code model and reasoning for new workers here. Existing workers keep their frozen reasoning level. Choose sandbox region and size for new sandboxes separately. These defaults do not replace the model selected in a conversation.

Local Ollama or OpenAI-compatible endpoints can serve conversations through the desktop bridge when configured. They cannot serve delegated code work or routines running in the server sandbox. Use a server-reachable provider for those surfaces. Remove a provider with its confirmation control when no longer needed and check the resulting routing before the next run.

![Code model and reasoning defaults.](/documentation/en/ai-keys-and-models-defaults-workflow.png)
