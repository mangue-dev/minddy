---
{
  "id": "permissions-and-public-links",
  "locale": "en",
  "title": "Understand permissions and public links",
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
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "share-a-view",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/en/permissions-and-public-links-flow.svg",
      "alt": "Diagram: Account and project permission checks. Private object or explicit publication. Published set only; signed file access. Revoke link; issued file URLs expire later.",
      "caption": "These components have distinct responsibilities. Account and project permission checks. Private object or explicit publication. Published set only; signed file access. Revoke link; issued file URLs expire later.",
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
