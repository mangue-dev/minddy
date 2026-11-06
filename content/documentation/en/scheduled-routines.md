---
{
  "id": "scheduled-routines",
  "locale": "en",
  "title": "Routines",
  "summary": "Run Numo from a schedule, an issue event, feedback or a new database entry.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-06",
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
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "components/routines/routines-panel.tsx",
      "components/routines/use-routine-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-924: routine runs never ask questions, and when they notify the owner, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-924 passage; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-06"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Schedule and inspect a Numo routine"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/scheduled-routines-workflow.png",
      "alt": "Scheduled and event modes, one condition group, app icons and discreet information buttons.",
      "caption": "Local demonstration of the actual trigger editor. No routine was saved or executed.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        788,
        910
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Create a routine {#scheduled-routines}

Only the project owner can create, edit or enable a routine. Open Routines, choose an owned project and write the instruction Numo should receive. Mention relevant issues, pages or objectives. Each occurrence has a private Numo conversation, history and minddy tools. Routines organize and track work, for example a weekly triage, a review of stale issues or a weekly summary; they do not change repository code.

Choose **Scheduled** or **Event**. Database arrivals are an option in the event list.

- **Scheduled:** choose daily, weekly or monthly, the time and your timezone. Check the first-run preview.
- **Event:** choose issue creation, entry into a target status, assignment, a comment on a followed issue, feedback receipt, or a new database entry. Choose the target status, person or followed issue where requested. A status trigger includes issues created directly in that status. Assignment requires an actual change of assignee. A comment written by a reader does not start a comment routine.

For a database arrival, choose **New database entry** in the event list, then a page database in this project. A creation, duplicate, database import or move into that database counts as an arrival. Restoring an entry does not create a new arrival.

**Conditions** are optional: without them, every matching event can start the routine. Set the delay separately under **Start timing**. The small information buttons explain waiting behavior and timing. Pickers use the same status, priority, category and person indicators as the rest of minddy. Use arrow keys and Enter; longer lists include search.

Set the delay after an event if needed, from 0 to 120 minutes. Keep your timezone for Numo's context. Event and database routines listen for future arrivals and have no next scheduled date. Automatic processing requires the instance scheduler; a manual run remains available.

## Build conditions that can wait {#conditions}

Use **Add condition** to build one group of up to 16 conditions. Choose **All conditions** (AND) or **Any condition** (OR) for the whole group. Select issue status, assignee, category, priority or effort; for a database, select its typed property. Choose a compatible operator and value. People, categories and databases must belong to this project. Nested groups cannot be added. Saved nested rules keep their meaning; if they cannot be shown as one equivalent group, **Replace conditions** clears them so you can build a new group.

For example: entry into Triage, with all conditions requiring category Backend and priority High. An issue arriving without a category stays waiting. Adding Backend later can start the occurrence. Once consumed, that waiting item cannot start a second occurrence. Leaving the target status cancels it; entering again creates a new waiting item. A reassignment similarly replaces its waiting item.

An entry created without its required property stays waiting until an edit satisfies the filter. Removing a referenced property or changing its type shows a filter error: correct the routine's conditions before continuing. The delay is also respected when a filter becomes true. Feedback receipt includes private and pending feedback; running Numo does not publish it or bypass moderation.

![Scheduled and event modes, one condition group, app icons and discreet information buttons.](/documentation/en/scheduled-routines-workflow.png)

## Manage and verify runs {#runs}

Open the routine to inspect waiting conditions, change its instruction or trigger, pause it, or review occurrences. On its page, the owner writes the instruction in place (it is saved as you type and stays the same across your open tabs and devices, even while Numo rewrites it), unfolds **Trigger** to change it, chooses the **Spending cap**, and switches between **Active** and **Paused** from the state badge at the top. Pausing, deleting or changing its configuration invalidates waiting items. Re-enabling listens to future events without replaying old arrivals. A manual run can start any trigger type without waiting for its event and also consumes usage.

Right-click a routine in the list to open its latest run without selecting it first; **Open latest run** stays unavailable until the routine has run. The project owner can also choose **Run now**, **Pause** or **Resume**, **Edit** or **Move to trash** from the same menu. **Resume** is unavailable when the instance cannot schedule routines. Other members only see entries that leave the routine unchanged. To create a routine, right-click **Routines** in the sidebar and choose **New routine**.

Hold Shift and click routines in the list to select several; a click on the list's empty space clears the selection. **Actions** in the floating bar, or Command+K on macOS or Ctrl+K on Windows/Linux, runs the selected routines you own now, pauses or resumes them, or moves them to the trash after a confirmation; routines of projects you do not own are left unchanged, and each run consumes usage. **Ask Numo** opens Numo with every selected routine in its context.

Each occurrence uses the owner's AI budget with a 15% monthly-budget cap by default, including every Numo call of that occurrence. Open its conversation to inspect the source and outcome. An occurrence runs without you and never asks questions: when a choice is not Numo's to make, such as trashing or merging, it leaves it to you in a message. Write instructions that do not wait for your answer. Inspect saved results before adjusting a cap or retrying. When ownership is [transferred](/docs/projects#transfer-ownership), the former owner's routines in the project are paused and cannot start new work; the new owner creates the routines that should continue.

An occurrence that ends normally does not notify you. When it finds something you need to act on, Numo leaves you a [message](/docs/notifications-and-inbox#notifications-and-inbox) that opens the item concerned. You are notified automatically when an occurrence fails, is stopped or runs out of budget, and when a scheduled or event occurrence cannot start. The **Routines** switch in your [notification settings](/docs/notifications-and-inbox#notification-preferences) controls these notifications, and **Messages from Numo** controls the messages.

The cap applies when an included monthly budget is available; an uncapped personal-key mode does not acquire an artificial monthly allowance.

Project automations from earlier versions no longer run and are not converted into routines. Read the [transition guide](/docs/automation-settings) to recreate a workflow as a routine.
