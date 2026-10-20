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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/settings/account-notifications-section.tsx",
      "components/notification-badge.tsx",
      "components/settings/account-settings-page.tsx",
      "lib/server/notifications.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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

Open Inbox from its icon in the top bar, from the Inbox row of the sidebar on a phone, or by pressing G then I outside a text field. A red count on the icon adds unread notifications and pending invitations; an installed PWA shows the same count on its app icon. Inbox opens as a popover, or as a sheet on a phone, and groups notifications under Today, Yesterday and Earlier.

Inbox opens on the Unread filter. All also lists read notifications, and Mentions keeps only mentions in comments and pages. Select an item to open its underlying issue, page or pull request. Opening a notification marks it read. Its row also offers Mark as read or Mark as unread, and Mark all as read in the Inbox header clears every unread marker. Marking unread restores that activity marker; it does not undo the underlying issue or page change. A notification is a pointer to accessible work, not a replacement for its current content.

Delete on a row removes that notification after a confirmation, and Delete read in the header removes every read notification after a confirmation. Both deletions are permanent; unread notifications stay, and the issue, page or pull request a notification points to is not affected.

Pending project invitations appear under Invitations in the Unread and All filters. Accept or decline after checking the project and the inviter. Legacy Inbox links open the current entry point rather than establishing a separate page.

![Inbox with demonstration mentions, assignments and comments, including read and unread items.](/documentation/en/work-inbox.png)

## Choose notification channels {#notification-preferences}

Select Inbox settings in the Inbox header, or open Account settings and choose the Notifications tab. Under Inbox notifications, a switch per category (Assignments, Mentions, Comments, Numo, Routines, Pull requests, Feedback and Pages) decides what lands in your Inbox. Turning a category off stops future notifications of that kind, including their push alerts; it does not remove notifications you already received.

The Push notifications section on the same tab lists the devices that receive alerts. Browser, PWA or desktop delivery also needs device registration and the operating system's permission. Turning a device off or removing it stops alerts on that device only; your Inbox and its categories are unchanged.

If a notification leads to unavailable content, verify whether project membership changed or the object was deleted. For missing push delivery, check device permission and registration using the [device-notification section](/docs/applications#devices-and-notifications); in-app Inbox remains a useful place to inspect activity. Never send session cookies or private notification contents as troubleshooting screenshots.
