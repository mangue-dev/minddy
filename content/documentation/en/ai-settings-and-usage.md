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
    "A08",
    "A10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 11,
  "sourceRevision": 11,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate with allowlisted private native preview (MIN-676); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement",
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
      "lib/billing-plans.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "components/ai-elements/dictate-button.tsx",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "content/documentation/reviews/min-676-private-native-preview-2026-10-10.md",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance)",
    "date": "2026-10-10"
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
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/plans-and-ai-usage-workflow.png",
      "alt": "AI usage page for the demonstration account.",
      "caption": "AI usage page for the demonstration account. The current budget, usage categories and history are read from the account; no purchase or paid run was triggered.",
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1154,
        1016
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Account AI settings choose the providers, personal keys and defaults used by supported features. Check model routing before starting work, then use the Cloud usage sections to distinguish provider billing, included AI allowance, sandbox compute and routine limits.

Account AI settings separate **Minddy AI** from **Code agent**. Minddy AI configures API providers for Numo conversations, automations, voice and feedback. Coding subscriptions apply only to repository workers; they do not fund general Minddy AI.

## Configure personal AI keys and model defaults {#ai-keys-and-models}

Open account AI settings, add a compatible provider and enter its key and any required base URL. Save and inspect the confirmation state. For AI calls with managed fallback available, an unconfirmed or unreachable key leaves usage on minddy. This depends on configured managed AI; code workers have the provider-bound model rules below. Never paste the key into a conversation or screenshot.

Assign text, transcription and embedding model families to compatible keys or keep them on minddy. For each key, choose its enabled surfaces: Numo conversation, automations, voice and feedback. Choose OpenCode funding separately in **Code agent**. A surface or model family without a usable assignment stays on minddy usage. Your provider bills calls made with its key. Sandbox compute is recorded separately; validated personal keys (BYOK) and minddy-funded work follow the [budget rules below](#consumption).

![AI provider card with minddy Cloud selected.](/documentation/en/ai-keys-and-models-workflow.png)

### Choose the code agent {#native-agent-preview}

In **Code agent**, choose **OpenCode (Minddy Cloud)** or OpenCode with the text-model provider configured above. Its **AI provider** control chooses the funding source for code work independently of other API surfaces. Configure the OpenCode model and reasoning here. Region and sandbox size are in the same section and apply to hosted code workers.

Choose **Codex** or **Claude Code** first to display only that agent’s connection controls. Selecting an agent does not connect it or start work. The current Codex device-login controls describe the historical technical prototype; do not use them in hosted Minddy until an authorized integration replaces this mechanism. For enabled Claude accounts, **Connect Claude Code** starts browser approval. Approve only on Claude’s official page and paste only its authorization code into Minddy, then choose **Complete connection** when requested. **Cancel connection** stops a pending attempt. **Disconnect** removes Minddy’s saved access; it does not cancel the subscription or prove remote OAuth revocation.

Hosted Codex subscription authentication is not available for general use. OpenAI explicitly excludes app-server authentication from hosted services and directs remotely hosted apps to its Sign in with ChatGPT program. Minddy must use an authorized integration before rollout. Existing restricted technical tests do not establish permission, real token renewal or a seamless launch. Paid Claude Code execution remains untested. Removing interface badges does not change these availability conditions. [OpenAI app-server](https://learn.chatgpt.com/docs/app-server#auth-endpoints), [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source).

The selector and connection rows show each coding agent’s name and logo. Native worker conversations show the saved engine and CLI-managed defaults, without OpenCode API model or reasoning controls or image attachments. OpenCode conversations retain their API model and reasoning controls.

Before delegation, Numo receives the current account selection and the selected adapter’s capabilities. Once a worker is launched, its saved engine and capabilities take precedence for that run, including after account settings change. Numo names that worker when explaining delegated work. If account selection cannot be read, it checks the settings rather than guessing.

The native adapter exposes guarded Minddy tools through MCP. Provider-native built-in tools, image input and subagents are unavailable in these adapters. Numo mediates worker questions using reliable conversation context, or asks you when a decision is missing. Numo can use its own supported tools within your authorization; it does not invent unsupported harness operations.

A missing connection, expired access or provider limit stops native work. Minddy does not switch to OpenCode, another API provider or another payer automatically. Choose **OpenCode** explicitly to use the API path. Hosted Codex must wait for the authorized integration; a new device login is not a permitted recovery route. For Claude, reconnect the selected account when access is available. Disconnecting or losing access keeps the saved choice visible until you change it. Existing workers retain their recorded engine.

Native subscriptions fund code model usage only; Numo API calls and sandbox compute remain separately accounted.

### Models and execution location {#models}

**OpenCode:** Code-model choices are tied to their provider. After changing, disabling or losing a personal key, the previous choice may no longer match the active provider. A new worker then refuses to start until you choose a compatible code model in account AI settings; it does not silently select a cheaper model or a platform default. An already frozen BYOK run does not switch payer when its key becomes unavailable.

With **OpenCode**, set the default code model and reasoning for new workers here. With **Codex** or **Claude Code**, the CLI chooses those defaults. Existing workers retain their frozen settings. Choose sandbox region and size separately. These choices do not replace the conversation model.

Local Ollama or OpenAI-compatible endpoints can serve conversations through the desktop bridge when configured. They cannot serve delegated code work or routines running in the server sandbox. Use a server-reachable provider for those surfaces. Remove a provider with its confirmation control when no longer needed and check the resulting routing before the next run.


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

## Dictate text and edits {#voice-dictation}

Use the microphone beside a supported field to dictate an issue, objective, comment, Numo message, feedback or routine instruction. You need permission to write there, a working microphone and a browser that supports recording. Allow microphone access for this site in the browser and operating system. Use HTTPS for a remote instance. Cloud needs available AI usage; self-hosted instances also need working transcription and dictation providers. Personal voice keys and model assignments are configured [above](#ai-keys-and-models).

1. Open the intended form or issue and choose its microphone control. In an open issue, Command+Shift+D on macOS or Ctrl+Shift+D elsewhere toggles voice editing. Check that the recording timer and waveform appear.
2. Speak in the interface language, which guides transcription. For an issue edit, name the intended change clearly, for example “Set the priority to high”. Stop with the square control and wait for transcription and any Numo processing to finish before closing the form.
3. Inspect the result. Numo messages, comments and routine instructions receive editable text; review it before sending or saving. Creation forms receive draft fields that still need confirmation. Voice editing of an existing issue applies field changes immediately: inspect the issue afterward and correct an unintended change through its normal controls. Dictation does not grant additional permissions.

### Usage and recording limits {#voice-limits}

Audio is sent to the configured transcription service, then may be cleaned up or interpreted by an AI model. Usage follows the account's provider and budget rules; a recording and its subsequent interpretation can incur separate usage. Public feedback has its own availability and charging rules, described in the [feedback guide](/docs/feedback). The public landing-page demo uses a separate limit and is not an account dictation allowance.

The signed-in transcription endpoint accepts up to 10 MiB of audio and 30 requests per account per hour. The shared recorder stops after 20 minutes as a safeguard. Prefer shorter takes so you can inspect each result. Keep existing text until the result is verified; the recorder is not an audio backup.

### Recover a failed dictation {#voice-recovery}

If access is denied, enable the site's microphone permission and the browser or desktop app's operating-system permission, then try again. If no device is found, connect or select a microphone; if it is busy, close the application using it. An unsupported recorder requires a compatible browser, or you can type instead.

For silence or an empty result, check the input device and record a short audible take. For an oversized recording, split it into shorter takes. A rate-limit message gives a wait time; wait before retrying. For budget or provider failures, check AI usage, voice assignments and instance configuration. If cleanup fails but recognized text is returned, review and edit that text. Before repeating a failed issue edit, inspect the current fields to avoid applying the same change twice.
