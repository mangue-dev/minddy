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
  "revision": 17,
  "sourceRevision": 17,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate; multi-provider settings and persistent personal Numo defaults; MIN-721 removal of code agents, sandboxes and code-work usage; MIN-693 project roles",
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
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
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
      "content/documentation/reviews/min-676-private-native-preview-2026-10-10.md",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md",
      "content/documentation/reviews/min-676-model-controls-2026-10-10.md",
      "content/documentation/reviews/min-676-review-fixes-2026-10-11.md",
      "content/documentation/reviews/min-676-provider-numo-defaults-2026-10-11.md",
      "content/documentation/reviews/min-676-native-login-wizard-2026-10-11.md",
      "lib/ai-surfaces.ts",
      "components/billing/usage-segment-ui.tsx",
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (experimental Claude and explicit cold continuation source and fixture review; no live provider execution); agent:/root (provider routing, persistent Numo defaults and local Docker UI review; no provider inference); agent:/root (guided connection source, behavior fixtures and local visual review; no live provider authentication); agent:/root/min721_docs (MIN-721 source review: Code agent settings, native connections, sandbox region and size, code-work usage and its segment removed; usage page screenshot removed because it showed the retired segment; no provider or billing rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale experimental and reconnect additions; agent review, not human acceptance); agent:/root (complete six-locale defaults and routing meaning review; no human acceptance); agent:/root (six-locale wizard procedure equivalence; no human acceptance); agent:/root/min721_docs (en removal edits and retained meaning; agent review, not human acceptance); agent:/root (en MIN-693 added passages, label and retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "kind": "diagram",
      "src": "/documentation/en/ai-providers-and-numo-defaults-flow.svg",
      "alt": "Connected providers, capability routing and a personal Numo model are separate settings.",
      "caption": "Several providers can stay connected. Routing chooses the provider for each capability; the Numo default is saved per account and provider.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Providers and Numo defaults",
        "items": [
          {
            "title": "Connected providers",
            "detail": "Keep several API providers connected; adding one preserves the others."
          },
          {
            "title": "Provider by capability",
            "detail": "Assign text, transcription and embeddings independently, then enable the required usages."
          },
          {
            "title": "Default Numo model",
            "detail": "Follow the app default or save a personal model. A conversation choice takes precedence."
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow"
  ]
}
---

Account AI settings choose the providers, personal keys and defaults used by supported features. Check model routing before starting work, then use the Cloud usage sections to distinguish provider billing, included AI allowance and routine limits.

The **Minddy AI** section of account AI settings configures the API providers used by Numo conversations, routines, automations, voice and feedback. Coding agents you run yourself, connected through minddy MCP, use their own subscription or API account and do not consume Minddy AI usage.

## Configure personal AI keys and model defaults {#ai-keys-and-models}

In account AI settings, **AI provider** selects the text-model provider from Minddy Cloud or your connected compatible providers. **Connected providers** keeps the full list visible. Choose **Add provider**, select a provider, enter its API key and any required base URL, then save. You can connect several providers; adding or selecting one does not delete the others. Never paste a key into a conversation or screenshot.

Assign text, transcription and embedding families independently. Each family uses one provider at a time. Per-provider usage switches determine whether Numo, automations, voice and feedback use that key or managed Minddy usage. For example, you can keep text on OpenRouter and transcription on OpenAI. Selecting a text provider does not enable a previously disabled Numo usage switch.

Under **Default Numo model**, choose **App default** or a specific model from the active Numo provider. This choice is saved for your account and separately for each provider, across reloads and new sessions. App default follows the application’s configured model for that provider. An explicit conversation model takes precedence; conversations following your default pick up subsequent account changes. Already admitted turns retain their frozen model. A saved model that becomes unavailable or exceeds your plan is refused: choose another model or App default. Account export/import includes these model preferences, without provider credentials.

An unconfirmed or unreachable key may leave supported general AI calls on managed Minddy usage when managed AI is configured. Your provider bills calls made with its key. Validated personal keys and Minddy-funded work follow the [budget rules below](#consumption).

![Connected providers, capability routing and a personal Numo model are separate settings.](/documentation/en/ai-providers-and-numo-defaults-flow.svg)

### Local models {#models}

Local Ollama or OpenAI-compatible endpoints can serve conversations through the desktop bridge when configured. Routines run on the server and cannot reach a model on your computer. Use a server-reachable provider for them. Remove a provider with its confirmation control when no longer needed and check the resulting routing before the next run.


## Understand Cloud plans and AI consumption {#plans-and-ai-usage}

Cloud offers Free, Go and Pro. All include MCP, Numo conversations, contextual actions and routines. Capacity, included AI, models and storage differ. Open Billing for your current allowance and usage, and compare the public pricing page before choosing a plan; the figures shown there are the current reference.

Use the offered checkout or subscription-management action for your account. Review the amount, billing period and provider confirmation before accepting. A successful plan change should appear in account billing; verify that rather than treating a closed checkout window as proof.

### What consumes budget {#consumption}

Included AI usage covers Numo reasoning and tool calls, routines, automations, voice dictation and feedback processing. The monthly included-AI limit applies to work funded by minddy. A routine’s per-run cap is a separate limit that can pause its execution; completed work stays in the conversation. These limits do not authorize automatic overage charges. Inspect the limit card and reset date when available.

Compatible personal keys bill model calls to their provider instead of included AI usage. Unassigned families or surfaces that use minddy-funded calls remain subject to their minddy allowance. Self-hosting has infrastructure and optional-provider costs determined by your installation; it does not become a Cloud subscription merely by running the same core.

### Candidate capacity reference {#plan-capacities}

These defaults describe the identified 0.11.1 candidate. Verify the live pricing page and account before purchasing; configured checkout prices and account overrides can differ. Guests exclude the project owner and include members, readers and pending invitations; there is no per-seat billing. Storage is charged to the owner of the project receiving files. When ownership is transferred, these limits, storage and background AI such as Smart Assign and feedback review use the new owner's plan.

| Plan | Projects | Issues per project | Guests per project | Storage | Included monthly AI (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Unlimited | Unlimited | Unlimited | 20 GiB | 5 |
| Pro | Unlimited | Unlimited | Unlimited | 100 GiB | 15 |

Billing shows the remaining AI budget and its next reset, **Budget over time**, and **What uses your budget?**, which splits consumption into **Routines**, **Numo**, **Voice dictation**, **Feedback** and **Automations** as a percentage of the included budget. **Usage history** lists the actions of the current period and their share of the budget.

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