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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-721 removal of code delegation in routines; MIN-685 sidebar context menus; MIN-693 project roles",
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
    "revision": 9,
    "fact": "agent:/root (MIN-677 source review and single-group editor keyboard/mobile follow-up; unchanged procedures retain prior evidence); agent:/root/min721_docs (MIN-721 source review: code delegation and code routine templates removed; routine examples are now triage, stale issues and weekly summary; no operational rerun); agent:/root (MIN-685 sidebar context menu source and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (en translation, label and retained-meaning self-review); agent:/root/min721_docs (en removal edits; agent review, not human acceptance); agent:/root (en MIN-685 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-693 added passages, label and retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-12",
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

Only the project owner can create, edit or enable a routine. Open Routines, choose an owned project and write the instruction Numo should receive. Mention relevant issues, pages or objectives. Each occurrence has a private Numo conversation, history and Minddy tools. Routines organize and track work, for example a weekly triage, a review of stale issues or a weekly summary; they do not change repository code.

Choose **Scheduled** or **Event**. Database arrivals are an option in the event list.

- **Scheduled:** choose daily, weekly or monthly, the time and your timezone. Check the first-run preview.
- **Event:** choose issue creation, entry into a target status, assignment, a comment on a followed issue, feedback receipt, or a new database entry. Choose the target status, person or followed issue where requested. A status trigger includes issues created directly in that status. Assignment requires an actual change of assignee. A comment written by a reader does not start a comment routine.

For a database arrival, choose **New database entry** in the event list, then a page database in this project. A creation, duplicate, database import or move into that database counts as an arrival. Restoring an entry does not create a new arrival.

**Conditions** are optional: without them, every matching event can start the routine. Set the delay separately under **Start timing**. The small information buttons explain waiting behavior and timing. Pickers use the same status, priority, category and person indicators as the rest of Minddy. Use arrow keys and Enter; longer lists include search.

Set the delay after an event if needed, from 0 to 120 minutes. Keep your timezone for Numo's context. Event and database routines listen for future arrivals and have no next scheduled date. Automatic processing requires the instance scheduler; a manual run remains available.

## Build conditions that can wait {#conditions}

Use **Add condition** to build one group of up to 16 conditions. Choose **All conditions** (AND) or **Any condition** (OR) for the whole group. Select issue status, assignee, category, priority or effort; for a database, select its typed property. Choose a compatible operator and value. People, categories and databases must belong to this project. Nested groups cannot be added. Saved nested rules keep their meaning; if they cannot be shown as one equivalent group, **Replace conditions** clears them so you can build a new group.

For example: entry into Triage, with all conditions requiring category Backend and priority High. An issue arriving without a category stays waiting. Adding Backend later can start the occurrence. Once consumed, that waiting item cannot start a second occurrence. Leaving the target status cancels it; entering again creates a new waiting item. A reassignment similarly replaces its waiting item.

An entry created without its required property stays waiting until an edit satisfies the filter. Removing a referenced property or changing its type shows a filter error: correct the routine's conditions before continuing. The delay is also respected when a filter becomes true. Feedback receipt includes private and pending feedback; running Numo does not publish it or bypass moderation.

![Scheduled and event modes, one condition group, app icons and discreet information buttons.](/documentation/en/scheduled-routines-workflow.png)

## Manage and verify runs {#runs}

Open the routine to inspect waiting conditions, change its instruction or trigger, pause it, or review occurrences. Pausing, deleting or changing its configuration invalidates waiting items. Re-enabling listens to future events without replaying old arrivals. A manual run can start any trigger type without waiting for its event and also consumes usage.

Right-click a routine in the list to open its latest run without selecting it first; **Open latest run** stays unavailable until the routine has run. The project owner can also choose **Run now**, **Pause** or **Resume**, **Edit** or **Move to trash** from the same menu. **Resume** is unavailable when the instance cannot schedule routines. Other members only see entries that leave the routine unchanged. To create a routine, right-click **Routines** in the sidebar and choose **New routine**.

Each occurrence uses the owner's AI budget with a 15% monthly-budget cap by default, including every Numo call of that occurrence. Open its conversation to inspect the source, outcome and questions. When owner input is required, answer in that same conversation; the remaining occurrence budget is retained. Inspect saved results before adjusting a cap or retrying. When ownership is [transferred](/docs/projects#transfer-ownership), the former owner's routines in the project are paused and cannot start new work; the new owner creates the routines that should continue.

The cap applies when an included monthly budget is available; an uncapped personal-key mode does not acquire an artificial monthly allowance.

Project automations from earlier versions no longer run and are not converted into routines. Read the [transition guide](/docs/automation-settings) to recreate a workflow as a routine.
