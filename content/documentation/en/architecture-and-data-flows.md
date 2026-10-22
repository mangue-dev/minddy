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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/capabilities.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "alt": "Diagram: Browser and authenticated application. Supabase: PostgreSQL, Auth, Storage, Realtime. Independent scheduler for background jobs. Optional providers have separate data destinations.",
      "caption": "The application coordinates access to persistent data and background work, with separate destinations for external integrations.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-16",
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
            "title": "Independent scheduler for background jobs"
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

The `Next.js` application serves the interface and authorized server APIs. Supabase provides PostgreSQL, Auth, Storage and Realtime. PostgreSQL holds application records, account/platform state and Storage metadata; the Storage backend holds object bytes. Protected server configuration contains keys and provider credentials. Application containers can be recreated, but database volumes, raw Storage and matching keys must persist. A complete restore needs them together.


![Diagram: Browser and authenticated application. Supabase: PostgreSQL, Auth, Storage, Realtime. Independent scheduler for background jobs. Optional providers have separate data destinations.](/documentation/en/architecture-and-data-flows-flow.svg)

## Follow a user request {#requests}

The browser uses public application and Supabase origins. Auth establishes the session; server endpoints verify the actor and object access before reading or changing content. Realtime projects updates to connected sessions. In the full profile, server-to-Supabase calls use internal Kong without changing browser origins or account-link identity. The scheduler invokes authenticated HTTP jobs independently of browser connections.

## Identify each outbound boundary {#providers}

AI models, email, Git, remote MCP, push, analytics and external object backends are separate destinations when enabled. Running the app yourself does not make those services local. Managed Supabase operates your selected backend while the full profile places the pinned stack under your control. Cloud operates the service with its configured providers; self-hosting supplies your own accounts and choices. Review permissions, costs and data terms for each enabled integration. Never infer a provider or Cloud edition from a hostname or deployment platform.
