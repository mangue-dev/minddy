---
{
  "id": "permissions-and-public-links",
  "locale": "en",
  "title": "Permissions and public links",
  "summary": "The server checks project access on every scoped operation.",
  "topic": "Technical concepts",
  "type": "explanation",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "T02"
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
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md",
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
    "pages",
    "views",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [
    "Understand permissions and public links"
  ],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/en/permissions-and-public-links-flow.svg",
      "alt": "Diagram: Account and project permission checks. Private object or explicit publication. Published set only; signed file access. Revoke link; issued file URLs expire later.",
      "caption": "Publication exposes only selected content; previously issued file links can remain valid after revocation until they expire.",
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
            "title": "Account and project permission checks"
          },
          {
            "title": "Private object or explicit publication"
          },
          {
            "title": "Published set only; signed file access"
          },
          {
            "title": "Revoke link; issued file URLs expire later"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "permissions-and-public-links-flow"
  ]
}
---

## Apply the object’s access boundary {#permissions-and-public-links}

The server checks project access on every scoped operation. A project owner manages owner-only settings, members and integrations. Members work on project issues and pages through the available permission checks; a client hiding a control is not authorization. Personal account settings, notebook and owner-only Numo chats do not become shared when a project is attached as context. MCP acts as its authorized account and checks project membership; it does not turn an agent into an instance administrator.


![Diagram: Account and project permission checks. Private object or explicit publication. Published set only; signed file access. Revoke link; issued file URLs expire later.](/documentation/en/permissions-and-public-links-flow.svg)

## Understand what a publication exposes {#publication}

A published page or shared view uses an opaque bearer link, optionally protected by a password. Anyone with the link and, when required, its password can access the published content. Revoke the link when no longer needed. Public page subpages resolve only inside the published set; excluded child titles are not exposed. Attachments are signed only for published pages while the private bucket and authenticated application routes remain closed. Mentions may remain text without private profile links. A published database includes only entries in its published branch.

## Check sharing and revocation anonymously {#revocation}

Open the result in a separate signed-out session, inspect the intended content and files and verify excluded objects remain inaccessible. Revoke the publication and test the link again. Already copied data cannot be recalled, and a previously issued signed file URL can remain valid until expiry; page file URLs use a 24-hour lifetime. User secret links remain noindex, separate from this indexable official documentation. Noindex is a crawler instruction, not an access control. Never paste private bearer links into public reports or documentation examples.
