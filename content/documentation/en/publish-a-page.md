---
{
  "id": "publish-a-page",
  "locale": "en",
  "title": "Publish a page and revoke its link",
  "summary": "Test the visitor view, choose child access deliberately and revoke publication.",
  "topic": "Pages and databases",
  "type": "tutorial",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/pages/page-publish-dialog.tsx",
      "lib/server/page-publication.ts",
      "app/p/[token]/page.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "page-files",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-publish.png",
      "alt": "Page publication dialog with Private selected and password or bearer-link alternatives.",
      "caption": "Private keeps the page within the project. Review the intended audience before changing publication.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-page-steps"
  ]
}
---

## Publish the intended content {#publish-a-page}

Open a project page as a member and use its publication controls. Review the content and attachments first. Choose private, password-protected or public access. Password protection requires at least eight characters and is applied after submitting the password; selecting the mode alone does not create a protected link.

Copy the generated /p/ link after publication succeeds. If the page has descendants, review the include-children option and count. Including children publishes the selected branch; excluding them keeps their content outside that publication. A database without published children does not expose all its entry bodies automatically.

Open the link in a separate browser session without your account. Test the password if enabled, page content, intended subpages and file downloads. This verifies the visitor's read-only access rather than your broader member permissions.


![Page publication dialog with Private selected and password or bearer-link alternatives.](/documentation/en/page-publish.png)

## Revoke and check {#revoke-page}

Return to publication controls and choose private. After successful revocation, open the old link anonymously and check that access is denied. Copies or screenshots already received cannot be recalled. File download URLs already delivered by a published page are signed for up to 24 hours. Revocation prevents new page visits but those previously issued file URLs can remain valid until they expire.

User page links remain noindex and are separate from the indexed official manual. Noindex is a discovery policy, not an access password. If a child or file is unexpectedly readable, revoke first, inspect the published branch and retest before forwarding a corrected link. Files belonging to unpublished pages do not gain access merely through an internal reference.
