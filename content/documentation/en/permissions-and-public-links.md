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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-693 project roles",
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
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root (en MIN-693 added passages, label and retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 5,
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

The server checks project access and your project role on every scoped operation. Each project has one owner, who manages owner-only settings, members, roles and integrations. Members work on project content. Readers can read it and, when the owner turns on **Can comment** for them, comment; they cannot edit content or publish links, and they do not see integrations or share and board tokens. The [project roles](/docs/projects#member-permissions) table lists each role's access. A client hiding a control is not authorization. Personal account settings, notebook and owner-only Numo chats do not become shared when a project is attached as context. MCP acts as its authorized account and follows that account's current role in each project on every call; it does not turn an agent into an instance administrator. Project integrations with `mdy_` keys are not people: they keep the fixed permissions of their kind and receive no role.

A role change or removal applies to the next request. Content already delivered is not recalled, and a signed URL already issued for a private file stays valid until it expires, at most 10 minutes later.


![Diagram: Account and project permission checks. Private object or explicit publication. Published set only; signed file access. Revoke link; issued file URLs expire later.](/documentation/en/permissions-and-public-links-flow.svg)

## Understand what a publication exposes {#publication}

A published page or shared view uses an opaque bearer link, optionally protected by a password. The owner and members can publish and revoke these links; readers cannot. Anyone with the link and, when required, its password can access the published content. Revoke the link when no longer needed. Public page subpages resolve only inside the published set; excluded child titles are not exposed. Attachments are signed only for published pages while the private bucket and authenticated application routes remain closed. Mentions may remain text without private profile links. A published database includes only entries in its published branch.

## Check sharing and revocation anonymously {#revocation}

Open the result in a separate signed-out session, inspect the intended content and files and verify excluded objects remain inaccessible. Revoke the publication and test the link again. Already copied data cannot be recalled, and a previously issued signed file URL can remain valid until expiry; page file URLs use a 24-hour lifetime. User secret links remain `noindex`, separate from this indexable official documentation. Noindex is a crawler instruction, not an access control. Never paste private bearer links into public reports or documentation examples.
