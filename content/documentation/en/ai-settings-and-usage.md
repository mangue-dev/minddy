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
  "revision": 23,
  "sourceRevision": 23,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "components/ai-elements/dictate-button.tsx",
      "components/ai-elements/dictation-pill.tsx",
      "components/ai-elements/use-dictation-recorder.ts",
      "components/settings/account-preferences-section.tsx",
      "components/settings/dictation-vocabulary-section.tsx",
      "lib/dictation-vocabulary.ts",
      "lib/dictation-hallucinations.ts",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "lib/ai-surfaces.ts",
      "components/billing/usage-segment-ui.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/agent/model-combobox.tsx"
    ]
  },
  "review": {
    "revision": 23,
    "fact": "agent:claude-code (model pickers show the default's model by name instead of App default when that model is in the catalog, and choosing it keeps following the default; checked against components/agent/model-combobox.tsx and components/settings/account-ai-keys-section.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure changed, the diagram does not show picker labels)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
      "alt": "Connected providers, a provider for each usage, and Numo's provider and model are separate settings.",
      "caption": "Each usage runs on minddy Cloud or a connected provider. Numo's default is saved per provider; a conversation can choose its own provider and model.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-28",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Providers, usages and Numo",
        "items": [
          {
            "title": "Connected providers",
            "detail": "minddy Cloud and your API keys stay available side by side."
          },
          {
            "title": "A provider per usage",
            "detail": "Each precise usage, from Numo's titles to transcription, chooses its provider."
          },
          {
            "title": "Numo provider and model",
            "detail": "Pick a provider, then its model. A conversation can choose its own."
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

In account AI settings, **Connected providers** lists minddy Cloud, included in your plan, and the API providers you connected. Choose **Add provider**, select a provider, enter its API key and any required base URL, then save. You can connect several providers; adding one neither removes the others nor changes what your usages run on. Never paste a key into a conversation or screenshot.

Below, **Numo**, **Automations**, **Voice dictation** and **Feedback** list their precise usages, such as Numo's conversations, conversation titles and web search, or Smart Fill and speech to text. Each usage chooses its own provider, minddy Cloud or a connected one, and changes alone: you can keep everything on minddy Cloud except Numo's conversations. A usage only offers the providers that can serve it: transcription and search by meaning need a provider with those models, and web search needs minddy Cloud or an OpenRouter key. When a usage runs on one of your keys, its model appears under the provider: keep the provider's preselected model or choose another. Choices apply at once. On an instance without minddy Cloud, a newly connected provider serves every usage that has none yet.

For Numo's **Conversations**, choose the provider, then a model from that provider. The picker shows the app's default model under its own name, checked while you follow it; choosing it keeps your setting following the app default, so later changes to that default still apply. **App default** appears as an option only when that model is not in the catalog. This default is saved for your account and separately for each provider, across reloads and new sessions. In a conversation, the model list next to the microphone opens on the providers when several are available; choose one to see its models. The conversation keeps that provider and model, and conversations following your default pick up later account changes. Already admitted turns retain their frozen provider and model. A saved model that becomes unavailable or exceeds your plan is refused: choose another model or the app's default model. If a conversation's provider is removed, Numo asks you to choose another one instead of switching on its own. Account export/import includes these model preferences, without provider credentials.

An unconfirmed or unreachable key may leave supported general AI calls on managed Minddy usage when managed AI is configured. Your provider bills calls made with its key. Validated personal keys and Minddy-funded work follow the [budget rules below](#consumption).

![Connected providers, a provider for each usage, and Numo's provider and model are separate settings.](/documentation/en/ai-providers-and-numo-defaults-flow.svg)

### Local models {#models}

Minddy calls AI models from the server, so it cannot use a model running on your computer. **Add provider** does not offer local Ollama or OpenAI-compatible endpoints. A local endpoint saved in an earlier version still appears in **Connected providers**, but it cannot serve Numo conversations, routines or other features. Remove it and assign a server-reachable provider instead. Remove a provider with its confirmation control when no longer needed and check the resulting routing before the next run.


## Understand Cloud plans and AI consumption {#plans-and-ai-usage}

Cloud offers Free, Go and Pro. All include MCP, Numo conversations, contextual actions and routines. Capacity, included AI, models and storage differ. Open Billing for your current allowance and usage, and compare the public pricing page before choosing a plan; the figures shown there are the current reference.

Use the offered checkout or subscription-management action for your account. Review the amount, billing period and provider confirmation before accepting. A successful plan change should appear in account billing; verify that rather than treating a closed checkout window as proof.

### What consumes budget {#consumption}

Included AI usage covers Numo reasoning and tool calls, routines, automations, voice dictation and feedback processing. The monthly included-AI limit applies to work funded by minddy. A routine’s per-run cap is a separate limit that can pause its execution; completed work stays in the conversation. These limits do not authorize automatic overage charges. Inspect the limit card and reset date when available.

Compatible personal keys bill model calls to their provider instead of included AI usage. Unassigned families or surfaces that use minddy-funded calls remain subject to their minddy allowance. Self-hosting has infrastructure and optional-provider costs determined by your installation; it does not become a Cloud subscription merely by running the same core.

### Plan capacity reference {#plan-capacities}

These defaults describe Minddy 0.20.0. Verify the live pricing page and account before purchasing; configured checkout prices and account overrides can differ. Guests exclude the project owner and include members, readers and pending invitations; there is no per-seat billing. Storage is charged to the owner of the project receiving files. When ownership is transferred, these limits, storage and background AI such as Smart Assign and feedback review use the new owner's plan.

| Plan | Projects | Issues per project | Guests per project | Storage | Included monthly AI (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Unlimited | Unlimited | Unlimited | 20 GiB | 5 |
| Pro | Unlimited | Unlimited | Unlimited | 100 GiB | 15 |

Billing shows the remaining AI budget and its next reset, **Budget over time**, and **What uses your budget?**, which splits consumption into **Routines**, **Numo**, **Voice dictation**, **Feedback** and **Automations** as a percentage of the included budget. **Usage history** lists the actions of the current period and their share of the budget.

## Dictate text and edits {#voice-dictation}

Use the microphone beside a supported field to dictate an issue, objective, comment, Numo message, feedback or routine instruction. You need permission to write there, a working microphone and a browser that supports recording. Allow microphone access for this site in the browser and operating system. Use HTTPS for a remote instance. Cloud needs available AI usage; self-hosted instances also need working transcription and dictation providers. Personal voice keys and model assignments are configured [above](#ai-keys-and-models).

1. Open the intended form or issue and choose its microphone control. In an open issue, Command+Shift+D on macOS or Ctrl+Shift+D elsewhere toggles voice editing. A dictation bar opens at the bottom of the screen, as a sheet on a phone, with the timer and a wave that follows your voice. The rest of the interface waits until the take ends.
2. Speak in the interface language, which guides transcription. For an issue edit, name the intended change clearly, for example “Set the priority to high”. Choose **Transcribe** (✓), press Command+Enter on macOS or Ctrl+Enter elsewhere (Enter also works) or repeat the shortcut, then wait for transcription and any Numo processing to finish. To throw the take away, choose **Discard recording** (✕) or press Esc, then **Discard**: nothing is sent.
3. Inspect the result. Numo messages, comments and routine instructions receive editable text; review it before sending or saving. Creation forms receive draft fields that still need confirmation. In the new-issue form with Smart Fill on, dictation leaves the title (when Smart Fill writes it), priority, effort, categories and objective to Smart Fill unless you ask for one of them, for example “set the effort to M”. Voice editing of an existing issue applies field changes immediately: inspect the issue afterward and correct an unintended change through its normal controls. Dictation does not grant additional permissions.

### Usage and recording limits {#voice-limits}

Audio is sent to the configured transcription service, then may be cleaned up or interpreted by an AI model. The cleanup fixes punctuation, filler words and self-corrections; to insert the words as they were heard, turn off **Clean up dictations** under **Account settings** > **Preferences** > **Voice dictation**, and no cleanup model is called for your dictations. With cleanup on or off, minddy removes the phrases transcription models invent on silence, such as subtitle credits or a closing “Thanks for watching”. Public feedback keeps its own processing. Under **Vocabulary**, below that setting, add up to 50 names and terms dictation should spell your way; fill in **Heard as** to replace that word in every dictation, even with cleanup off. Usage follows the account's provider and budget rules; a recording and its subsequent interpretation can incur separate usage. Public feedback has its own availability and charging rules, described in the [feedback guide](/docs/feedback). The public landing-page demo uses a separate limit and is not an account dictation allowance.

The signed-in transcription endpoint accepts up to 10 MiB of audio and 30 requests per account per hour. The shared recorder stops after 20 minutes as a safeguard. Prefer shorter takes so you can inspect each result. Keep existing text until the result is verified; the recorder is not an audio backup.

### Recover a failed dictation {#voice-recovery}

If access is denied, enable the site's microphone permission and the browser or desktop app's operating-system permission, then try again. If no device is found, connect or select a microphone; if it is busy, close the application using it. An unsupported recorder requires a compatible browser, or you can type instead.

For silence or an empty result, check the input device and record a short audible take. For an oversized recording, split it into shorter takes. A rate-limit message gives a wait time; wait before retrying. For budget or provider failures, check AI usage, voice assignments and instance configuration. If cleanup fails but recognized text is returned, review and edit that text. Before repeating a failed issue edit, inspect the current fields to avoid applying the same change twice.