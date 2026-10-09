---
{
  "id": "notifications-and-inbox",
  "locale": "en",
  "title": "Inbox and notifications",
  "summary": "Review unread activity and mentions, then adjust account notification preferences.",
  "topic": "Plan and find work",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "projects",
    "applications",
    "accounts"
  ],
  "aliases": [],
  "tags": [
    "Follow notifications and invitations in Inbox"
  ],
  "figures": [
    {
      "id": "notifications-and-inbox-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-inbox.png",
      "alt": "Inbox with demonstration mentions, assignments and comments, including read and unread items.",
      "caption": "Demonstration activity shows the author, issue and read state. All includes read and unread notifications.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Read Inbox {#notifications-and-inbox}

Open Inbox from navigation. It is a popover that groups notifications by date and offers unread, all and mentions filters. Select an item to inspect its underlying issue or page and check the read state. Opening a notification marks it read. Its row also offers mark-read or mark-unread controls, and the popover can mark all notifications read. Marking unread restores that activity marker; it does not undo the underlying issue or page change. A notification is a pointer to accessible work, not a replacement for its current content.

Pending project invitations also appear in Inbox. Accept or decline after checking the project and account. Legacy Inbox links open the current entry point rather than establishing a separate page.

![Inbox with demonstration mentions, assignments and comments, including read and unread items.](/documentation/en/work-inbox.png)

## Choose notification channels {#notification-preferences}

Open account notification preferences to adjust which activity you receive. Browser, PWA or desktop delivery also needs device registration and the operating system's permission. Disabling a device channel is distinct from changing the in-app activity filters.

If a notification leads to unavailable content, verify whether project membership changed or the object was deleted. For missing push delivery, check device permission and registration using the [device-notification section](/docs/applications#devices-and-notifications); in-app Inbox remains a useful place to inspect activity. Never send session cookies or private notification contents as troubleshooting screenshots.
