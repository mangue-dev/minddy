---
{
  "id": "architecture-and-data-flows",
  "locale": "en",
  "title": "Architecture and data flows",
  "summary": "The Next.js application serves the interface and authorized server APIs.",
  "topic": "Technical concepts",
  "type": "explanation",
  "audiences": [
    "operator",
    "integrator"
  ],
  "workflows": [
    "T03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "docs/editions.md",
      "docs/self-hosting-distribution.md",
      "lib/server/capabilities.ts",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity)",
    "date": "2026-10-09"
  },
  "related": [
    "instance-configuration",
    "storage-and-attachments",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Trace application, database and provider data flows"
  ],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/en/architecture-and-data-flows-flow.svg",
      "alt": "Diagram: Browser and authenticated application. Supabase: PostgreSQL, Auth, Storage, Realtime. Independent scheduler and trusted runner. Optional providers have separate data destinations.",
      "caption": "The application coordinates access to persistent data and background work, with separate destinations for external integrations.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Browser and authenticated application"
          },
          {
            "title": "Supabase: PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Independent scheduler and trusted runner"
          },
          {
            "title": "Optional providers have separate data destinations"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "architecture-and-data-flows-flow"
  ]
}
---

## Locate durable state {#architecture-and-data-flows}

The Next.js application serves the interface and authorized server APIs. Supabase provides PostgreSQL, Auth, Storage and Realtime. PostgreSQL holds application records, account/platform state and Storage metadata; the Storage backend holds object bytes. Protected server configuration contains keys and provider credentials. Application containers can be recreated, but database volumes, raw Storage and matching keys must persist. A complete restore needs them together.


![Diagram: Browser and authenticated application. Supabase: PostgreSQL, Auth, Storage, Realtime. Independent scheduler and trusted runner. Optional providers have separate data destinations.](/documentation/en/architecture-and-data-flows-flow.svg)

## Follow a user request {#requests}

The browser uses public application and Supabase origins. Auth establishes the session; server endpoints verify the actor and object access before reading or changing content. Realtime projects updates to connected sessions. In the full profile, server-to-Supabase calls use internal Kong without changing browser origins or account-link identity. The scheduler invokes authenticated HTTP jobs independently of browser connections. The trusted runner opens restricted repository sandboxes only when Numo needs code work; sandboxes do not inherit instance secrets or the Docker socket.

## Identify each outbound boundary {#providers}

AI models, email, Git, remote MCP, push, analytics and external object backends are separate destinations when enabled. Running the app yourself does not make those services local. Managed Supabase operates your selected backend while the full profile places the pinned stack under your control. Cloud operates the service with its configured providers; self-hosting supplies your own accounts and choices. Review permissions, costs and data terms for each enabled integration. Never infer a provider or Cloud edition from a hostname or deployment platform.
