---
{
  "id": "issue-discussion-and-resources",
  "locale": "en",
  "title": "Discuss work and attach its context",
  "summary": "Use comments, mentions, files and live page resources on an issue.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W08"
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "content/knowledge/core-tracker.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "create-and-organize-pages",
    "page-files",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-resources.png",
      "alt": "Add-link dialog with an example contact URL.",
      "caption": "Review the destination before adding a resource. This example link has not been submitted.",
      "revision": 1,
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
    "issue-discussion-and-resources-steps"
  ]
}
---

## Add discussion or a resource {#issue-discussion-and-resources}

Open the issue's discussion timeline to add a comment. Explain a decision, question or verification result so another member can understand what changed. Use mentions when you need a person or linked object in context; notifications still depend on the recipient's preferences and device delivery.

Attach a relevant project page, file or link through the resources controls. A linked page is a live resource: its title follows page renaming and its content can evolve. A file is a stored attachment rather than a guarantee that an external URL remains available.

![Add-link dialog with an example contact URL.](/documentation/en/work-resources.png)

## Visibility and failed uploads {#resource-access}

Issue membership and project access govern internal discussion and resources. Adding a resource to an issue does not publish it anonymously. When referring to feedback, distinguish the team-only discussion from a public response before sending text.

Check that an uploaded resource appears and can be opened after the operation. If it fails, preserve the original file, read the upload error, and verify the applicable file size or account-storage limit. Self-hosted operators also need working Storage metadata, policies and raw bytes. Avoid posting credentials or private diagnostic dumps as attachments.
