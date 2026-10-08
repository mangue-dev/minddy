---
{
  "id": "numo-execution-model",
  "locale": "en",
  "title": "Understand durable Numo turns and delegated work",
  "summary": "Interactive messages, contextual actions and scheduled routines enter Numo conversations.",
  "topic": "Technical concepts",
  "type": "explanation",
  "audiences": [
    "integrator",
    "operator"
  ],
  "workflows": [
    "T05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "content/knowledge/agents-and-mcp.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "mcp-tool-reference",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/en/numo-execution-model-flow.svg",
      "alt": "Diagram: Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for current code worker when needed. Replay durable events; reconcile uncertain writes.",
      "caption": "Read the stages in order. Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for current code worker when needed. Replay durable events; reconcile uncertain writes.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "numo-execution-model-flow"
  ]
}
---

## One conversation with different execution paths {#numo-execution-model}

Interactive messages, contextual actions and scheduled routines enter Numo conversations. Conversation model/reasoning choices belong to the composer; delegated repository work uses the account’s code model and reasoning defaults. Direct Minddy tools can act without a repository. Code work opens a server sandbox for the linked repository only when needed. A routine creates a new occurrence conversation using its saved instruction and owner/project context. No desktop session needs to remain online.


![Diagram: Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for current code worker when needed. Replay durable events; reconcile uncertain writes.](/documentation/en/numo-execution-model-flow.svg)

## Separate durable execution from its display {#state}

A user intent is persisted as a durable turn with its request UUID and message. The state advances through queued and running, then completed, waiting_input or waiting_work; stopping/stopped and retryable/failed describe interruption and failure. SSE displays persisted activity but does not own execution. Reconnecting reads recorded messages/events after its sequence. Worker completion resumes the waiting parent only for the current run; duplicate and stale events do not create another task. Project context is separate from access: an owner-only chat stays private.

## Treat uncertain mutations explicitly {#mutations}

Before mutation, the system records the operation and checkpoint. Completed results are reused. An interrupted read can retry, but a mutation whose outcome is unknown enters reconciling rather than automatically repeating. Inspect the actual destination before retrying an external write. Routine owner connections and budget remain subject to ownership and cost guards; another member cannot borrow the previous owner’s personal MCP credentials. A stopped parent interrupts active delegated work, but an external action already sent may still complete.
