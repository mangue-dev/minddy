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
  "revision": 18,
  "sourceRevision": 18,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-10",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/server/issue-semantic-search.ts",
      "components/admin/admin-accounts-dashboard.tsx",
      "components/admin/admin-costs-dashboard.tsx",
      "components/admin/admin-models-dashboard.tsx",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "lib/server/model-config.ts",
      "lib/server/assistant/admin-tools.ts",
      "lib/instance-variables.ts",
      "lib/server/instance-variables.ts",
      "app/api/admin/instance-variables/route.ts",
      "components/admin/admin-instance-dashboard.tsx",
      "components/agent/model-combobox.tsx",
      "lib/server/assistant/conversation-config.ts"
    ]
  },
  "review": {
    "revision": 18,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-928: event screening added to the Assistant category of Models, checked against lib/ai-model-config.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-929: Background turns per day added to the Assistant card of Models, checked against lib/ai-model-config.ts and lib/ai-model-config-file.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-930: home summary added to the Assistant category of Models, checked against lib/ai-model-config.ts); agent:claude-code (MIN-954: sentence on Numo's model on minddy Cloud in #models, source audit against lib/server/assistant/conversation-config.ts; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954 model roles: #models, #models-file, #decision-model and #smart-fill-relations rewritten for one model per role, source audit against lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts and components/admin/admin-models-dashboard.tsx; no browser walkthrough; the instance-administration-models screenshot still shows the former category cards and needs a recapture); agent:claude-code (MIN-954: recommended models and routing shortcuts removed from #models and #models-file, checked against components/admin/admin-models-dashboard.tsx and lib/ai-model-config-file.ts)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-928 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-929 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-10"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration",
    "recommended-models"
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
      "alt": "Accounts tab with the number of accounts and the exact-email account lookup.",
      "caption": "Accounts shows the number of accounts and the support lookup; this capture comes from a demonstration instance.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/en/instance-administration-models.png",
      "alt": "Models tab with one default model per category and folded per-task models.",
      "caption": "Models shows one default per category; per-task models stay folded. No model or provider setting was changed for this capture.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-instance",
      "kind": "screenshot",
      "src": "/documentation/en/instance-administration-instance.png",
      "alt": "Instance tab with each variable's source, a masked OpenRouter key set here and the administrator addresses from the file.",
      "caption": "Instance shows where each value comes from; secrets keep only their last characters. This capture comes from a disposable local self-hosted instance.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Establish privileged access {#instance-administration}

Instance administration is separate from project ownership. Set `ADMIN_EMAILS` to authorized confirmed account addresses in the server environment. Server-signed `app_metadata.role=admin` is another accepted role source. A valid administrator session also requires `aal2`, enrolled verified MFA and current live account/session checks. The server fails closed when those checks fail. Sign in, complete TOTP and open `/admin`. Do not edit database roles to bypass enrollment. The administrator console and its private APIs remain `noindex`.


![Accounts tab with the number of accounts and the exact-email account lookup.](/documentation/en/instance-administration-overview.png)

![Models tab with one default model per category and folded per-task models.](/documentation/en/instance-administration-models.png)

## Use only capabilities present on the instance {#panels}

The console has three tabs: **Accounts**, **Costs**, **Models** and, where it is allowed, **Instance**. **Costs** is hidden when no linked managed OpenRouter capability exists. Links to the former Overview, Users and Finances tabs open **Accounts** or **Costs**. Plan gifting depends on configured billing or an existing override. A self-hosted instance without commercial providers does not acquire Cloud billing by opening the console. Administrative changes affect the instance rather than one project; use demonstration accounts for validation.

## Support an account {#accounts}

**Accounts** shows how many accounts the instance has. Below it, find an account only by its exact email address with **Find account**. Open it to see its email confirmation status, review or **Reset** its AI usage budget, or **Gift a plan** under the condition above. The tab shows no activity, sign-ups, onboarding, project counts or personal content; open an account only for a support or billing task.

## Track the instance’s costs {#costs}

**Costs** shows what the AI providers cost the instance, in dollars as they bill it, and refreshes itself while it stays open. Choose the period in the menu at the top right of the pane, and narrow everything with the **Filters** button beside it, by feature or model. Calls made with members’ personal keys are never recorded, so they do not appear here. Four figures follow, each with its trend and its change against the previous period: total spend, requests, tokens and cost per million tokens. Below come the most expensive features and models, then the spend per day by model and by feature family, the requests per day by model, and the recent runs, which open on their calls. Revenue, subscriptions and margins are not shown: Stripe billing is managed in Stripe. Per-account OpenRouter keys that no account uses any more are deleted every night.

## Choose the models {#models}

**Models** has one card per kind of model, and each kind runs one model for the whole instance. **Language model** sets the model that Numo and every text task run: conversation titles, web search, event screening, the home summary, Smart Fill and its titles, Smart Assign, relation decisions, CSV import mapping, brief breakdown, merge commit messages, dictation cleanup, the feedback review and the FAQ question box. The same card holds Numo's **Reasoning level** and **Background turns per day**, which caps the turns [Numo in the background](/docs/numo#background) runs for one member in 24 hours: 20 when empty, 0 to switch background Numo off for everyone; the models file neither carries nor resets it. **Embeddings** sets the one embedding model for issues and feedback, **Voice** the speech-to-text model, and **Decisions** the [decision model](#decision-model). No task has a model of its own. An instance that had set a category default in an earlier version keeps running it: the card shows it, and saving the card replaces it. **Personal keys** is folded at the bottom: for each provider, it holds the model a member's own key runs for each kind when the member never picked one.

On minddy Cloud, every member's Numo runs the **Language model** card's model and **Reasoning level**, and members cannot change them. Only a member's personal key gives them a choice of language model, which then serves Numo and every text task of that member.

## Export and import the model configuration {#models-file}

At the top right of the **Models** pane, **Export** downloads the model configuration as a versioned JSON file (format `minddy.instance-models`): the model of each kind, the reasoning level and personal-key provider defaults. It contains no API key and no account. **Import** reads such a file and lists every change before anything is written; **Apply** writes them all, or none when one value is refused, for example a model that is not a decision model. An import replaces the configuration: settings the file leaves out return to their default. A file from an earlier minddy version is updated to the current format: its assistant and embeddings category defaults fill the language and embedding models, and its per-task models, routing shortcuts and recommended models are listed and skipped. A file from a newer version is refused until the instance is updated.

## Administer the instance with Numo {#numo}

In a Numo conversation started from an administrator session, Numo can read the instance’s AI costs, with the same figures and filters as **Costs**, read and change the model configuration, preview and apply an import, including a configuration file you attach to the conversation, find an account by its exact email address, read its plan and AI usage budget, and gift or take back a plan. The administrator session is checked again before each of these actions, and Numo confirms every change with you before making it. These tools return no activity, projects or content of another account. [Numo in the background](/docs/numo#background) receives them too while your account is an administrator with two-factor authentication on: it reads the model configuration and the costs on its own, and any other action needs one of your memories, which replaces your confirmation. @Numo mentions, routines and the public documentation help never receive them.

## Edit the instance variables {#instance-variables}

On a self-hosted instance whose environment file sets `MINDDY_CONFIG_OVERRIDES=1`, the **Instance** tab changes some of its variables without editing the file: the OpenRouter key, the administrator addresses, the email provider and senders, your own GitHub and GitLab apps, analytics, the instance name and contact address, and the publication of the model configuration. The installation guide asks whether to allow it, and the desktop app turns it on for the instance it installs on your computer. Only the file turns it on or off; minddy Cloud never offers it.

![Instance tab with each variable's source, a masked OpenRouter key set here and the administrator addresses from the file.](/documentation/en/instance-administration-instance.png)

The search field above the list finds a variable by its name, label or description. A value saved in the tab overrides the file, and **Remove** brings the file value back. Each variable shows where its value comes from; secrets show only their last characters. Most changes apply within a minute; the tab names those that apply after the instance restarts, and the desktop app then offers **Restart now**. Database access, encryption keys, the app address and build-time values can only be set in the file, so a wrong value in the tab never locks you out: remove it, or set `MINDDY_CONFIG_OVERRIDES=0` in the file to go back to the file values.

Saving a secret or the administrator addresses asks for your two-factor code if you have not entered it in the last minutes, and you cannot remove your own address. Every change appears in the inbox of the other administrators, including those named by role, and by email to every administrator, you included, when the instance sends email. Saving an unchanged value records nothing. Each variable keeps its last versions, with who changed it and when; **Restore** brings one back. Values are stored in the database, encrypted when workspace encryption is on.

## Choose the AI decision model {#decision-model}

Under **Models**, **Decisions**, **Decision model** sets the one decision model that answers every AI decision of the instance: Smart Fill, Smart Assign, relation decisions, event screening and the feedback review. There is no per-project, per-user or per-feature choice. The picker lists only OpenRouter models that publish the decision capability; chat, embedding and transcription models never appear. Saving test-calls the candidate with a representative decision. A model that is not a decision model, refuses the request, returns an invalid answer or takes longer than 5 seconds is refused, and the current model stays in use. When the catalog cannot be loaded, every change is refused. Self-hosted instances without managed AI have no platform catalog and keep the default, Jev.

New decisions use the saved model within about a minute on every server process. When the model fails or answers below the confidence threshold, the decision falls back to the language model. The threshold was calibrated on Jev and other decision models spread their confidence differently, so review agreement per model in the `ai_decision_evaluations_weekly` database view after a change. Usage rows record the model that answered.

## Configure Smart Fill relations {#smart-fill-relations}

After an issue is saved, Smart Fill can index it and link it to related issues. **Embedding model**, under **Models**, **Embeddings**, turns issue titles and descriptions, and feedback, into vectors. The default is `openai/text-embedding-3-small`. Changing it starts a new index version: old and new vectors are never compared. The hourly `/api/cron/issue-index` job then indexes existing issues, 100 per run, and bills each project's owner; it never creates relations. The same model turns each query of search by meaning into a vector, using the searching member's AI provider settings, and queries are compared only with vectors of the current index version. Until an issue is indexed again, related-issue search and search by meaning reach it by its words only. The same job converts vectors stored in clear into encrypted ones once their project encrypts. Relation decisions use the [decision model](#decision-model) and fall back to the language model when it fails or is unsure.

Embedding and transcription fields refuse a model of the wrong family on save, for example a chat model in an embeddings field, and the current model stays in use. This check needs the platform catalog: when it cannot be loaded, as on a self-hosted instance without managed AI, the choice cannot be verified and is accepted. For members who run automations on their own key, the per-provider defaults include `issue_embedding_model`: `text-embedding-3-small` for OpenAI and `gemini-embedding-001` for Google.

## Keep operator duties outside the UI {#responsibilities}

You remain responsible for least-privilege administrator membership, MFA recovery, host secrets, backups, retention, incident handling and provider costs. The console does not replace a database-plus-Storage restore or SMTP test. If access is refused, check confirmed address, allowlist, verified MFA and live session before changing anything. Revoked or banned sessions do not retain privilege merely because a JWT has not expired. Do not include other users’ private data, security factors or financial details in documentation screenshots.
