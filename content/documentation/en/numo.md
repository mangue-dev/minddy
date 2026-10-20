---
{
  "id": "numo",
  "locale": "en",
  "title": "Numo",
  "summary": "Work with Numo, understand its permissions and execution, connect MCP services and recover waiting or interrupted work.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "member",
    "owner",
    "integrator",
    "operator"
  ],
  "workflows": [
    "N01",
    "N02",
    "T05",
    "N08",
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 16,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement; MIN-676 engine-specific native model and thinking controls; persistent personal Numo default; PR #407 independent Numo Stop; MIN-721 removal of Numo code work; MIN-693 project roles; MIN-718 hybrid issue search; MIN-737 account settings reorganization",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/assistant/tools.ts",
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "components/settings/account-mcp-section.tsx",
      "app/api/account/mcp-connections/route.ts",
      "components/settings/account-mcp-clients.tsx",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "lib/server/numo/request-stop.test.ts",
      "supabase/migrations/20270109200042_numo_stop_preserves_workers.sql",
      "lib/server/numo/turns.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/assistant/assistant-context-bar.tsx",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-670 source, en wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (account default and conversation precedence source/UI review; prior procedures retained, no inference); agent:/root (independent Numo Stop source and focused application/PostgreSQL review; no hosted UI rehearsal); agent:/root (existing conversation, permissions, execution and MCP figures retained; no Stop cascade shown, original capture evidence retained); agent:/root/min721_docs (MIN-721 source review: code worker, delegation, native code agents and sandbox removed; legacy waiting_work turns stopped by the drain; no operational rerun, figures other than the execution diagram unchanged); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-728 agent image access: source and unit-test review of view_image and minddy_get_image; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the AI & Numo tab and the mcp-clients tab alias; the MCP connection screenshots predate the move and are retained; no browser walkthrough, no new captures)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-670 source, en wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale default-model additions reviewed for equivalent meaning); agent:/root (six-locale Numo Stop meaning and localized controls reviewed; not human acceptance); agent:/root/min721_docs (en removal edits and retained meaning; agent review, not human acceptance); agent:/root (en MIN-693 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-718 added passages with catalog UI labels; agent review, not human acceptance); agent:/root (en MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "code-work",
    "minddy-mcp",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [
    "work-with-numo",
    "agents-and-mcp",
    "numo-permissions-and-approvals",
    "numo-execution-model",
    "numo-mcp-connections",
    "recover-numo-work"
  ],
  "tags": [
    "Complete a project task with Numo",
    "Understand what Numo can change",
    "Understand durable Numo turns",
    "Connect a personal MCP service to Numo",
    "Recover stopped or waiting Numo work"
  ],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/work-with-numo-workflow.png",
      "alt": "Numo demonstration conversation with page context, a priority-change request and its saved answer.",
      "caption": "Existing demonstration thread, localized for display. The saved answer names AUR-11 and AUR-7; this capture does not prove a new execution.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        498,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/en/numo-permissions-and-approvals-workflow.svg",
      "alt": "Permission matrix for Numo project actions, personal connections and routines.",
      "caption": "Project access and explicit instructions limit Numo actions; external content cannot grant permission.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "matrix",
        "title": "Numo: access and authorization",
        "headers": [
          "Action or context",
          "Who authorizes it",
          "Boundary"
        ],
        "rows": [
          [
            "Project work",
            "Member with project access",
            "Existing project permissions still apply"
          ],
          [
            "Owner settings",
            "Project owner",
            "Membership, repository and feedback settings"
          ],
          [
            "Credentials and security",
            "Account holder, in settings",
            "Configure keys, Git and two-factor authentication directly"
          ],
          [
            "Public feedback reply",
            "An explicit user request",
            "Reading a request does not authorize a public reply"
          ],
          [
            "Personal MCP",
            "The conversation caller",
            "No other member’s personal connections"
          ],
          [
            "Scheduled routine",
            "Current project owner",
            "Owner’s connections and AI budget"
          ],
          [
            "Remote MCP result",
            "Untrusted service content",
            "Cannot authorize additional actions"
          ]
        ]
      }
    },
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/en/numo-execution-model-flow.svg",
      "alt": "Diagram: Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for your answer when input is needed. Replay durable events; reconcile uncertain writes.",
      "caption": "Read the stages in order. Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for your answer when input is needed. Replay durable events; reconcile uncertain writes.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-16",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Persist the intent, message and request UUID"
          },
          {
            "title": "Claim turn, checkpoint tools and their outcomes"
          },
          {
            "title": "Wait for your answer when input is needed"
          },
          {
            "title": "Replay durable events; reconcile uncertain writes"
          }
        ]
      }
    },
    {
      "id": "numo-mcp-connections-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/numo-mcp-connections-workflow.png",
      "alt": "Personal MCP settings, empty connection list and Add another MCP server control.",
      "caption": "Numo connections are personal; project routines use the project owner’s connections.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        1314
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/numo-mcp-connections-config-workflow.png",
      "alt": "Custom MCP server form with advanced authentication, transport and header settings.",
      "caption": "Custom MCP server form with advanced authentication, transport and header settings. No credentials were entered and no server was contacted.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        920
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow",
    "numo-permissions-and-approvals-workflow",
    "numo-execution-model-flow",
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow"
  ]
}
---

Numo works from your conversation’s context and your account’s permissions. Begin with a bounded request, check the result, and use the permission and execution sections to understand scheduled work. For a waiting or failed turn, inspect the saved state before repeating a request.

## Complete a project task with Numo {#work-with-numo}

Open the issue or project you want to work on, then use the floating Numo button. The current page becomes conversation context. Contextual actions that hand work to Numo open this same panel. You need access to the project and available AI usage or a compatible personal key.

1. Check the context shown in the composer. Name the issue explicitly if several items are relevant. To add an issue as context, type `@` in the composer or use **Add context** → **Issue**; a description also lists issues found [by meaning](/docs/navigation#search-by-meaning) under **Related by meaning**.
2. Choose the conversation model and reasoning level. These choices affect the conversation.
3. Send a bounded request, for example: “Read this issue and propose acceptance criteria. Do not change its status.”
4. Read the answer and follow its issue or source links. For an action request, open the changed object and check the result.

Numo can also look at the images in an issue or objective description, a plan, a comment, a page or your notebook when the conversation model accepts images. Without that capability, Numo says it could not view an image instead of describing it.

The default Numo model comes from **Account settings → AI & Numo → Default Numo model**: App default or a personal model for the active provider. An explicit conversation choice takes precedence. See [AI settings and usage](/docs/ai-settings-and-usage#ai-keys-and-models).

![Numo demonstration conversation with page context, a priority-change request and its saved answer.](/documentation/en/work-with-numo-workflow.png)

### Continue a conversation {#continue}

The conversation list keeps earlier conversations reachable. Continue the existing conversation when it contains the needed decisions. Numo organizes and tracks work: it reads and updates issues, plans, pages and other Minddy content, and can read linked pull requests. When Numo searches issues, text matches and exact identifiers come first; a descriptive search can add issues of the same project found by meaning, which Numo is told to check before relying on them. It does not write code or change a repository. To have code written, copy the issue's prompt for your own coding agent; see [Code work and pull requests](/docs/code-work#external-coding-agents).

If Numo asks for input, submit the requested choice before expecting dependent work to continue. A usage or failure card explains why a turn stopped. Verify any external write before asking it to repeat the action.

## Understand what Numo can change {#numo-permissions-and-approvals}

Numo acts within the current user's access and role. A project member cannot gain owner-only settings by requesting them in chat. A reader's Numo, in chat or through `@Numo` in a comment they are allowed to post, uses only read tools and is billed to the reader. Owners manage project membership, integrations, repository linking and feedback settings. Personal settings belong to the current account.

Numo can update supported account preferences and owner-authorized project settings. You must configure provider credentials, Git connections, two-factor authentication and avatar uploads yourself.

### Authorize the action {#authorization}

Describe the intended change and its scope. Reading a request does not authorize a public answer: Numo sends public feedback replies only when explicitly asked. Remote MCP instructions or results cannot authorize additional actions. Connect a service only if you trust it with the information and actions you intend to send.

A request may reach an external provider. Disabling its connection stops new calls but cannot recall one already sent. Verify a timed-out write at the destination before retrying.

### Personal and scheduled context {#context}

Conversations cannot borrow another member's personal MCP connections. Project routines use the project owner's connections and AI budget. After an ownership transfer, the former owner's routines in the project are paused; the new owner creates the routines that should continue. An old occurrence cannot keep using the former owner's credentials. Numo runs on the server: it does not read files on your computer or use your personal sessions.

![Permission matrix for Numo project actions, personal connections and routines.](/documentation/en/numo-permissions-and-approvals-workflow.svg)

## Understand durable Numo turns {#numo-execution-model}

Interactive messages, contextual actions and scheduled routines enter Numo conversations. Conversation model and reasoning choices belong to the composer. Numo acts through its Minddy tools and any personal MCP connections you added; it needs no repository. A routine creates a new occurrence conversation using its saved instruction and owner/project context. No desktop session needs to remain online.

![Diagram: Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for your answer when input is needed. Replay durable events; reconcile uncertain writes.](/documentation/en/numo-execution-model-flow.svg)

### Separate durable execution from its display {#state}

A user intent is persisted as a durable turn with its request UUID and message. The state advances through `queued` and `running`, then `completed` or `waiting_input`; `stopping`/`stopped` and `retryable`/`failed` describe interruption and failure. SSE displays persisted activity but does not own execution. Reconnecting reads recorded messages/events after its sequence. Duplicate and stale events do not create another task. Project context is separate from access: an owner-only chat stays private.

### Treat uncertain mutations explicitly {#mutations}

Before mutation, the system records the operation and checkpoint. Completed results are reused. An interrupted read can retry, but a mutation whose outcome is unknown enters `reconciling` rather than automatically repeating. Inspect the actual destination before retrying an external write. Routine owner connections and budget remain subject to ownership and cost guards; another member cannot borrow the previous owner’s personal MCP credentials.

Stopping Numo ends its turn. An external action already sent may still complete. A conversation that was waiting on code work from an earlier version is stopped automatically and returns to idle.

## Connect a personal MCP service to Numo {#numo-mcp-connections}

In account settings, open **AI & Numo** and use the **MCP for Numo** card. Links to the former MCP for Numo tab open there. Choose a catalog service or add another public HTTPS MCP server. The catalog and registry search do not bypass provider registration or approval requirements. Numo can prepare a connection in an interactive conversation, but an unattended routine cannot create one.

Use OAuth sign-in, or advanced settings for bearer token, no authentication or encrypted custom headers. Streamable HTTP is the default; legacy SSE is supported. Put secrets in credentials or headers, never the URL. Local commands and private-network endpoints are unsupported. For an existing OAuth app, register the displayed callback URL and enter its client ID and secret. In desktop, OAuth opens the system browser and returns to the app.

![Personal MCP settings, empty connection list and Add another MCP server control.](/documentation/en/numo-mcp-connections-workflow.png)

### Test, reconnect and remove {#manage}

Use the connection menu to test, edit, reconnect, disable or remove it. An orange authentication warning needs reconnection. Blank credential fields preserve existing secrets; changing the URL clears them and custom headers. Remove a saved bearer token with its dedicated control; `{}` clears custom headers.

Disabling stops new calls, not requests already sent. Calls have a 30-second deadline, 1 MiB transport limit and 64 KB result limit. Verify timed-out writes remotely before retrying. Project routines use the owner's connections; other members cannot borrow them.

![Custom MCP server form with advanced authentication, transport and header settings.](/documentation/en/numo-mcp-connections-config-workflow.png)

## Recover stopped or waiting Numo work {#recover-numo-work}

Return to the existing conversation and read its last messages and cards. Distinguish a question awaiting input, an account budget limit, a routine cap, an operation allocation limit and a technical failure. Closing the panel is not proof that work stopped.

For a live question card, answer every required question and submit the set. Past cards are records and cannot submit a new answer. Skipping does not supply missing information or authorize dependent changes.

### Budget and failures {#recovery}

An account-limit card shows the reset date when known and may offer plan or personal-key options. A routine-limit card links to routine management; inspect the per-run cap. An operation-allocation card concerns that operation's allocation. Repeating the same request does not remove the limit.

A failed turn can continue from a saved checkpoint only when that checkpoint survived. Inspect issue changes, pages and external services before retrying: a write may have succeeded even when its response was lost. State what remains and ask to continue the existing work. If no recoverable checkpoint exists, provide that verified state in a new request. Record the error and affected conversation when reporting a persistent failure; exclude credentials.

## Choose an objective for feedback {#feedback-objectives}

Feedback objectives require an explicit choice. Ask Numo to link a request to a named project objective, or to remove that link; Numo resolves the request and objective before changing it. General review or categorization does not authorize objective assignment. An integration can supply a default chosen by the owner. Promotion inherits the feedback objective and categories; it keeps the objective empty when none was chosen.
