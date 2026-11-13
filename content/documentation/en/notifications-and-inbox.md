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
  "revision": 12,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-11",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/server/notifications.ts",
      "lib/server/numo-notes.ts",
      "lib/notification-prefs.ts",
      "components/mobile-navigation.tsx"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.30.0 release review MIN-794: source audit against v0.20.0..HEAD; corrected the Inbox entry points to include notification search in the command palette, and the preferences section to state that administrators of a self-hosted instance get an unmutable Instance variables notification; no browser walkthrough; figures not reviewed in this pass); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-924: which routine runs notify the owner, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-907 inbox button in the phone bottom bar with its dot: checked against components/mobile-navigation.tsx and components/app-shell-chrome.tsx; no browser walkthrough; existing figure kept); agent:claude-code (MIN-975: inbox redesign — view picker and More actions menu, actor/sentence/context rows with mention pills, no date groups, invitation buttons with confirmation, swipe actions on phones; source audit against the change; no browser walkthrough; figures not recaptured yet, pending design validation)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (en corrected passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-914 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-924 passage; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-907 phone inbox entry point, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-11"
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
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Read Inbox {#notifications-and-inbox}

Open Inbox from its icon in the top bar, from the inbox button in the bar at the bottom of the screen on a phone, or by pressing G then I outside a text field. A red count on the icon adds unread notifications and pending invitations, and on a phone a dot marks the inbox button; an installed PWA shows the same count on its app icon. Inbox opens as a popover, or as a sheet on a phone, and lists notifications newest first, each with its time. Once you type in the command palette, it also finds notifications: choosing one opens Inbox on the view that lists it, Unread or All, and highlights it without marking it read.

Inbox opens on the Unread view. The picker at the top switches to All, which also lists read notifications, or to Mentions, which keeps only mentions in comments and pages. Each row names who acted (a member, Numo, Smart Assign, an MCP agent, the feedback board or the forge), says what happened with the issue, page, pull request or project shown as a pill, and adds context when there is some, such as the comment excerpt or the issue title. Select a row to open its issue, page or pull request. Opening a notification marks it read. On a phone, swipe a row to the right to mark it read or unread, or to the left to delete it. On a computer, pointing at a row shows Mark as read or Mark as unread, and Mark all as read in the More actions menu next to the picker clears every unread marker. Marking unread restores that activity marker; it does not undo the underlying issue or page change. A notification is a pointer to accessible work, not a replacement for its current content.

Numo can also leave you a message: a short title that names the item it is about, with a sentence or two of context when needed, about something that needs your attention, written by one of your routines or in a conversation where you asked to be told later. It shows the Numo icon, and selecting it opens the issue, objective, page, pull request or routine it is about, or the project when it names none. Numo writes these messages only to you, never to other members, and sends the same message about the same item at most once a day.

A routine notifies you on its own when an occurrence fails, runs out of budget or cannot start. An occurrence that ends normally reaches you only as a message from Numo. See [Routines](/docs/scheduled-routines#runs).

Delete, shown when you point at a row on a computer, removes that notification after a confirmation, and Delete read in the More actions menu removes every read notification after a confirmation. Both deletions are permanent; unread notifications stay, and the issue, page or pull request a notification points to is not affected.

Pending project invitations appear at the top of the Unread and All views, with Reject and Join buttons. Each asks for confirmation, so check the project and the inviter before you answer. Legacy Inbox links open the current entry point rather than establishing a separate page.

![Inbox with demonstration mentions, assignments and comments, including read and unread items.](/documentation/en/work-inbox.png)

## Choose notification channels {#notification-preferences}

Select Inbox settings in the More actions menu of Inbox, or open Account settings and choose the Notifications tab. Under Inbox notifications, a switch per category (Assignments, Mentions, Comments, Numo, Routines, Pull requests, Feedback, Pages and Messages from Numo) decides what lands in your Inbox. Turning a category off stops future notifications of that kind, including their push alerts; it does not remove notifications you already received. On a self-hosted instance, administrators also get an Instance variables notification when another administrator changes an instance variable; no switch turns it off. See [Edit the instance variables](/docs/instance-administration#instance-variables).

The Push notifications section on the same tab lists the devices that receive alerts. Browser, PWA or desktop delivery also needs device registration and the operating system's permission. Turning a device off or removing it stops alerts on that device only; your Inbox and its categories are unchanged.

If a notification leads to unavailable content, verify whether project membership changed or the object was deleted. For missing push delivery, check device permission and registration using the [device-notification section](/docs/applications#devices-and-notifications); in-app Inbox remains a useful place to inspect activity. Never send session cookies or private notification contents as troubleshooting screenshots.
