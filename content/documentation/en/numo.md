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
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5)",
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
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
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
    "Understand durable Numo turns and delegated work",
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
      "revision": 3,
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
      "revision": 3,
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
      "alt": "Diagram: Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for current code worker when needed. Replay durable events; reconcile uncertain writes.",
      "caption": "Read the stages in order. Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for current code worker when needed. Replay durable events; reconcile uncertain writes.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
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
            "title": "Wait for current code worker when needed"
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
      "revision": 3,
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
      "revision": 3,
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

Numo works from your conversation’s context and your account’s permissions. Begin with a bounded request, check the result, and use the permission and execution sections to understand delegated or scheduled work. For a waiting or failed turn, inspect the saved state before repeating a request.

## Complete a project task with Numo {#work-with-numo}

Open the issue or project you want to work on, then use the floating Numo button. The current page becomes conversation context. Contextual actions that hand work to Numo open this same panel. You need access to the project and available AI usage or a compatible personal key.

1. Check the context shown in the composer. Name the issue explicitly if several items are relevant.
2. Choose the conversation model and reasoning level. These choices affect the conversation; the code worker has separate account defaults.
3. Send a bounded request, for example: “Read this issue and propose acceptance criteria. Do not change its status.”
4. Read the answer and follow its issue or source links. For an action request, open the changed object and check the result.

![Numo demonstration conversation with page context, a priority-change request and its saved answer.](/documentation/en/work-with-numo-workflow.png)

### Continue or delegate {#continue}

The conversation list keeps earlier conversations reachable. Continue the existing conversation when it contains the needed decisions. For repository changes, Numo delegates to a worker in a server sandbox and displays progress, files, checks and the pull request. It does not work in your desktop folder.

If Numo asks for input, submit the requested choice before expecting dependent work to continue. A usage or failure card explains why a turn stopped. Verify any external write before asking it to repeat the action.

## Understand what Numo can change {#numo-permissions-and-approvals}

Numo acts within the current user's access. A project member cannot gain owner-only settings by requesting them in chat. Owners manage project membership, integrations, repository linking and feedback settings. Personal settings belong to the current account.

Numo can update supported account preferences and owner-authorized project settings. You must configure provider credentials, Git connections, two-factor authentication and avatar uploads yourself. Code-worker model and reasoning defaults are changed only in account AI settings.

### Authorize the action {#authorization}

Describe the intended change and its scope. Reading a request does not authorize a public answer: Numo sends public feedback replies only when explicitly asked. Remote MCP instructions or results cannot authorize additional actions. Connect a service only if you trust it with the information and actions you intend to send.

A request may reach an external provider. Disabling its connection stops new calls but cannot recall one already sent. Verify a timed-out write at the destination before retrying.

### Personal and scheduled context {#context}

Conversations cannot borrow another member's personal MCP connections. Project routines use the project owner's connections and AI budget. After ownership changes, start a new occurrence under the current owner; an old occurrence cannot keep using the former owner's credentials. A server sandbox is not your desktop session and does not inherit local files or personal sessions.

![Permission matrix for Numo project actions, personal connections and routines.](/documentation/en/numo-permissions-and-approvals-workflow.svg)

## Understand durable Numo turns and delegated work {#numo-execution-model}

Interactive messages, contextual actions and scheduled routines enter Numo conversations. Conversation model/reasoning choices belong to the composer; delegated repository work uses the account’s code model and reasoning defaults. Direct minddy tools can act without a repository. Code work opens a server sandbox for the linked repository only when needed. A routine creates a new occurrence conversation using its saved instruction and owner/project context. No desktop session needs to remain online.


![Diagram: Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for current code worker when needed. Replay durable events; reconcile uncertain writes.](/documentation/en/numo-execution-model-flow.svg)

### Separate durable execution from its display {#state}

A user intent is persisted as a durable turn with its request UUID and message. The state advances through queued and running, then completed, waiting_input or waiting_work; stopping/stopped and retryable/failed describe interruption and failure. SSE displays persisted activity but does not own execution. Reconnecting reads recorded messages/events after its sequence. Worker completion resumes the waiting parent only for the current run; duplicate and stale events do not create another task. Project context is separate from access: an owner-only chat stays private.

### Treat uncertain mutations explicitly {#mutations}

Before mutation, the system records the operation and checkpoint. Completed results are reused. An interrupted read can retry, but a mutation whose outcome is unknown enters reconciling rather than automatically repeating. Inspect the actual destination before retrying an external write. Routine owner connections and budget remain subject to ownership and cost guards; another member cannot borrow the previous owner’s personal MCP credentials. A stopped parent interrupts active delegated work, but an external action already sent may still complete.

## Connect a personal MCP service to Numo {#numo-mcp-connections}

In account settings, open MCP for Numo. Choose a catalog service or add another public HTTPS MCP server. The catalog and registry search do not bypass provider registration or approval requirements. Numo can prepare a connection in an interactive conversation, but an unattended routine cannot create one.

Use OAuth sign-in, or advanced settings for bearer token, no authentication or encrypted custom headers. Streamable HTTP is the default; legacy SSE is supported. Put secrets in credentials or headers, never the URL. Local commands and private-network endpoints are unsupported. For an existing OAuth app, register the displayed callback URL and enter its client ID and secret. In desktop, OAuth opens the system browser and returns to the app.

![Personal MCP settings, empty connection list and Add another MCP server control.](/documentation/en/numo-mcp-connections-workflow.png)

### Test, reconnect and remove {#manage}

Use the connection menu to test, edit, reconnect, disable or remove it. An orange authentication warning needs reconnection. Blank credential fields preserve existing secrets; changing the URL clears them and custom headers. Remove a saved bearer token with its dedicated control; `{}` clears custom headers.

Disabling stops new calls, not requests already sent. Calls have a 30-second deadline, 1 MiB transport limit and 64 KB result limit. Verify timed-out writes remotely before retrying. Project routines use the owner's connections; other members cannot borrow them.

![Custom MCP server form with advanced authentication, transport and header settings.](/documentation/en/numo-mcp-connections-config-workflow.png)

## Recover stopped or waiting Numo work {#recover-numo-work}

Return to the existing conversation and read its last messages and delegated-work card. Distinguish a question awaiting input, an account budget limit, a routine cap, an operation allocation limit and a technical failure. Closing the panel is not proof that work stopped.

For a live question card, answer every required question and submit the set. Past cards are records and cannot submit a new answer. Skipping does not supply missing information or authorize dependent changes.

### Budget and failures {#recovery}

An account-limit card shows the reset date when known and may offer plan or personal-key options. A routine-limit card links to routine management; inspect the per-run cap. An operation-allocation card concerns that operation's allocation. Repeating the same request does not remove the limit. Personal model keys do not make sandbox compute free.

A failed turn can continue from a saved checkpoint only when that checkpoint survived. Inspect issue changes, branch, pull request and external services before retrying: a write may have succeeded even when its response was lost. State what remains and ask to continue the existing work. If no recoverable checkpoint exists, provide that verified state in a new request. Record the error and affected conversation when reporting a persistent failure; exclude credentials.
