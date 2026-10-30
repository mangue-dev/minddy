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
  "revision": 24,
  "sourceRevision": 24,
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
      "lib/use-ask-numo-about-selection.ts",
      "lib/assistant-selection.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts",
      "lib/server/assistant/conversation-attachments.ts",
      "lib/server/assistant/markdown-pdf.ts",
      "components/assistant/generated-file-cards.tsx",
      "components/assistant/assistant-starter-list.tsx",
      "components/home/home-numo-composer.tsx",
      "lib/keyboard/typeahead.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/assistant/assistant-shell.tsx",
      "components/assistant/chat-message.tsx",
      "components/typed-mention-chip.tsx",
      "lib/server/assistant/prompt.ts"
    ]
  },
  "review": {
    "revision": 24,
    "fact": "agent:claude-code (type-ahead from Home and the expanded or focused Numo panel into the composer, single keys still running their shortcut after the 200 ms window, checked against lib/keyboard/typeahead.ts, lib/keyboard/keyboard-context.tsx, components/home/home-numo-composer.tsx and components/assistant/assistant-shell.tsx; Numo citing issues, objectives, projects, pages and members as mention pills in replies and in what it writes (issue descriptions and plans, objective descriptions, comments, pages, notebook), checked against lib/server/assistant/prompt.ts, lib/server/assistant/tools.ts, components/assistant/chat-message.tsx and components/typed-mention-chip.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, the conversation figure predates mention pills in answers)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "revision": 24,
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
      "revision": 24,
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
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "alt": "Notion connection wizard showing the sign-in method known from the catalog.",
      "caption": "Sign-in step for a catalog service. No credentials were entered and no server was contacted.",
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-21",
      "viewport": [
        560,
        354
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
2. Choose the conversation provider, model and reasoning level with the provider logo next to the microphone; hovering it names the current model. These choices affect the conversation. When the model offers no reasoning control, the reasoning slider stays on **No reasoning**; on a model that always reasons, **No reasoning** runs its lightest level.
3. Send a bounded request, for example: “Read this issue and propose acceptance criteria. Do not change its status.”
4. Read the answer and follow its issue or source links. For an action request, open the changed object and check the result. Issues, objectives, projects, pages and members that Numo found appear in its answer as mention pills: a pill opens its target, and one you cannot see shows as **Unavailable**. Numo also writes these mentions into what it writes, such as issue descriptions and plans, objective descriptions, comments, pages and the notebook, only for items it identified; a member mentioned there is notified as with any mention.

In a new, empty conversation, four suggestion rows above the composer offer requests suited to the current page, for example **Summarize this issue** or **Write an implementation plan** when an issue is open in the side panel. Choosing a row fills the composer without sending it, so you can edit the request first. The rows disappear as soon as the composer contains text and return when you clear it. They appear in the desktop layout, not on a phone. The composer at the bottom of **Home** shows the same rows, with suggestions such as **Choose what to focus on today** or **Find what's overdue**; sending from there opens the panel in its expanded layout.

On **Home**, and in the Numo panel when it is expanded or has focus, you can start typing without clicking the composer: a quick burst of keys typed outside a text field goes into the composer, which takes focus. A single key on its own still runs its keyboard shortcut, for example C to create an issue, about 0.2 seconds later on those screens. G followed by one key stays a navigation sequence; a third key in the burst turns it into text.

To ask about a passage, select it in an editor, such as a page or an issue description, then choose **Ask Numo** in the selection toolbar on desktop. The panel opens without sending anything: next to the page or issue it comes from, the passage appears as a context pill showing its first words, and hovering the pill shows the whole passage. Type your question, for example “Rewrite this more concisely” or “Make issues from this”, and send it. The passage goes with that message only. To leave it out, remove its pill with its cross.

Numo can also look at the images in an issue or objective description, a plan, a comment, a page or your notebook when the conversation model accepts images. Without that capability, Numo says it could not view an image instead of describing it.

Numo can also write a file for you to download: a report or a document as PDF, an export as CSV, or a text, Markdown, HTML, JSON, XML, SVG or calendar file. Ask for it in your request; Numo can build it from files you added to the conversation. The file appears as a card under its answer: selecting the card opens its preview when the format allows it, **Download** saves it, and the menu next to it offers **Preview** and **Copy contents**. The file stays in your conversation’s private storage; to share it with the project, ask Numo to attach it to an issue, an objective or a comment it posts there. A PDF uses the standard fonts: characters outside Western European alphabets, and emoji, are left out.

The default Numo model comes from **Account settings → AI & Numo → Default Numo model**: App default or a personal model for the active provider. An explicit conversation choice takes precedence. See [AI settings and usage](/docs/ai-settings-and-usage#ai-keys-and-models).

![Numo demonstration conversation with page context, a priority-change request and its saved answer.](/documentation/en/work-with-numo-workflow.png)

### Continue a conversation {#continue}

The conversation list keeps earlier conversations reachable. Continue the existing conversation when it contains the needed decisions. Numo organizes and tracks work: it reads and updates issues, plans, pages and other Minddy content, and can read linked pull requests. When you ask, it can also comment on a pull request, resolve review conversations that are already addressed and merge it. When Numo searches issues, text matches and exact identifiers come first; a descriptive search can add issues of the same project found by meaning, which Numo is told to check before relying on them. It does not write code or push commits. To have code written, copy the issue's prompt for your own coding agent; see [Code work and pull requests](/docs/code-work#external-coding-agents).

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

Connecting runs as a wizard. A custom or registry server first asks for its name and HTTPS address; a catalog service opens on the sign-in step. A catalog service, a saved connection or a registry entry that declares a token already knows its sign-in method: the step shows it, and **Use another method** changes it. Otherwise, choose **Sign in with OAuth**, **Bearer token** or **No authentication**. **Advanced settings** hold the transport (Streamable HTTP by default, legacy SSE supported) and encrypted custom headers. Put secrets in credentials or headers, never the URL. Local commands and private-network endpoints are unsupported. For an existing OAuth app, register the displayed callback URL and enter its client ID and secret. After saving, the last step waits for sign-in, then tests the connection and shows how many tools Numo found. In desktop, OAuth opens the system browser and returns to the app.

![Personal MCP settings, empty connection list and Add another MCP server control.](/documentation/en/numo-mcp-connections-workflow.png)

### Test, reconnect and remove {#manage}

Use the connection menu to test, edit, reconnect, disable or remove it. An orange authentication warning needs reconnection. Blank credential fields preserve existing secrets; changing the URL clears them and custom headers. Remove a saved bearer token with its dedicated control; `{}` clears custom headers.

Disabling stops new calls, not requests already sent. Calls have a 30-second deadline, 1 MiB transport limit and 64 KB result limit. Verify timed-out writes remotely before retrying. Project routines use the owner's connections; other members cannot borrow them.

![Notion connection wizard showing the sign-in method known from the catalog.](/documentation/en/numo-mcp-connections-config-workflow.png)

## Recover stopped or waiting Numo work {#recover-numo-work}

Return to the existing conversation and read its last messages and cards. Distinguish a question awaiting input, an account budget limit, a routine cap, an operation allocation limit and a technical failure. Closing the panel is not proof that work stopped.

For a live question card, answer every required question and submit the set. Past cards are records and cannot submit a new answer. Skipping does not supply missing information or authorize dependent changes.

### Budget and failures {#recovery}

An account-limit card shows the reset date when known and may offer plan or personal-key options. A routine-limit card links to routine management; inspect the per-run cap. An operation-allocation card concerns that operation's allocation. Repeating the same request does not remove the limit.

A failed turn can continue from a saved checkpoint only when that checkpoint survived. Inspect issue changes, pages and external services before retrying: a write may have succeeded even when its response was lost. State what remains and ask to continue the existing work. If no recoverable checkpoint exists, provide that verified state in a new request. Record the error and affected conversation when reporting a persistent failure; exclude credentials.

## Choose an objective for feedback {#feedback-objectives}

Feedback objectives require an explicit choice. Ask Numo to link a request to a named project objective, or to remove that link; Numo resolves the request and objective before changing it. General review or categorization does not authorize objective assignment. An integration can supply a default chosen by the owner. Promotion inherits the feedback objective and categories; it keeps the objective empty when none was chosen.
