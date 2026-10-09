---
{
  "id": "encryption-and-data-boundaries",
  "locale": "en",
  "title": "Encryption and data boundaries",
  "summary": "When configured and migrated, minddy encrypts workspace content and files before durable writes with authenticated server-side encryption.",
  "topic": "Technical concepts",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "T04"
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
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md",
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
    "workspace-encryption",
    "backups-and-restoration",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [
    "Understand encryption and the data it does not hide"
  ],
  "figures": [
    {
      "id": "encryption-and-data-boundaries-flow",
      "kind": "diagram",
      "src": "/documentation/en/encryption-and-data-boundaries-flow.svg",
      "alt": "Diagram: Encrypted durable content and wrapped keys. Root key stays in protected server configuration. Authorized runtime can decrypt content. Exports and external providers need separate care.",
      "caption": "The application can decrypt stored content for authorized access; exports and external services need separate protection.",
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
            "title": "Encrypted durable content and wrapped keys"
          },
          {
            "title": "Root key stays in protected server configuration"
          },
          {
            "title": "Authorized runtime can decrypt content"
          },
          {
            "title": "Exports and external providers need separate care"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "encryption-and-data-boundaries-flow"
  ]
}
---

## What at-rest encryption protects {#encryption-and-data-boundaries}

When configured and migrated, minddy encrypts workspace content and files before durable writes with authenticated server-side encryption. Project, user and system data keys are versioned and wrapped by a dedicated root outside PostgreSQL. A database-only extraction cannot read protected content without its keys. The application must decrypt for authorized access, search and unattended AI work. A compromised runtime or access to both configuration keys and data crosses that boundary; this is not end-to-end secrecy from the operator.


![Diagram: Encrypted durable content and wrapped keys. Root key stays in protected server configuration. Authorized runtime can decrypt content. Exports and external providers need separate care.](/documentation/en/encryption-and-data-boundaries-flow.svg)

## Identify readable or exported data {#exceptions}

Auth keeps login email as account identity. Routing IDs, project/issue keys, states, priorities, timestamps and other allowed metadata remain queryable. Publicly published content is intentionally readable to its audience. Exports, downloaded files, browser-visible content and information sent to external AI, email, Git or MCP providers require their own handling. A configured flag does not prove historical copies, logs or provider-retained data were converted or retired. Never claim Cloud production encryption status from repository source alone.

## Preserve keys with a coordinated recovery plan {#recovery}

Keep MINDDY_DATA_ROOT_KEY protected outside the database and retain recovery copies for current and historical backups. Recover database, Storage bytes and matching configuration as one consistent set. Encrypt the outer backup if it contains both data and keys. Changing the root without rewrapping keys makes existing content unreadable; turning content encryption off does not convert ciphertext back to plaintext. Rehearse recovery before activating encryption on existing data and verify actual decrypted content and downloaded bytes.
