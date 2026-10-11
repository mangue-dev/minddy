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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "content/documentation/reviews/routine-localized-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-677-editor-captures.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root (MIN-677 source review, isolated PostgreSQL regressions and trigger editor keyboard/mobile follow-up; unchanged procedures retain prior evidence)",
    "language": "agent:/root (en translation, label and retained-meaning self-review)",
    "date": "2026-10-11"
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
      "alt": "Trigger cards, event selection, nested AND/OR groups and a separate launch delay.",
      "caption": "Local demonstration of the actual trigger editor. No routine was saved or executed.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        788,
        1237
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

Only the project owner can create, edit or enable a routine. Open Routines, choose an owned project and write the instruction Numo should receive. Mention relevant issues, pages or objectives. Each occurrence has a private Numo conversation, history, Minddy tools and optional code delegation. Code workers use the owner's account defaults; a repository is needed only for repository work.

Choose one trigger:

- **Schedule:** choose daily, weekly or monthly, the time and your timezone. Check the first-run preview.
- **Event:** choose issue creation, entry into a target status, assignment, a comment on a followed issue, or feedback receipt. Choose the target status, person or followed issue where requested. A status trigger includes issues created directly in that status. Assignment requires an actual change of assignee.
- **Database entry:** choose a page database in this project. A creation, duplicate, database import or move into that database counts as an arrival. Restoring an entry does not create a new arrival.

For an event or database trigger, select its card and configure **When this happens**. **Conditions** are optional: without them, every matching event can start the routine. Set the delay separately under **Start timing**. The numbered conditions and indented groups show which rules belong together. Use arrow keys and Enter in the pickers; longer lists include a search field.

Set the delay after an event if needed, from 0 to 120 minutes. Keep your timezone for Numo's context. Event and database routines listen for future arrivals and have no next scheduled date. Automatic processing requires the instance scheduler; a manual run remains available.

## Build conditions that can wait {#conditions}

Use **Add condition** and **Add group** to combine **All conditions** (AND) and **Any condition** (OR). Select issue status, assignee, category, priority or effort; for a database select its typed property. Choose a compatible operator and value. People, categories and databases must belong to this project. Conditions are bounded to six nested levels and 64 nodes, without executable expressions.

For example: entry into Triage AND category Backend AND (an assignee is present OR priority is High). An issue arriving without a category stays waiting. Adding Backend later can start the occurrence. Once consumed, that waiting item cannot start a second occurrence. Leaving the target status cancels it; entering again creates a new waiting item. A reassignment similarly replaces its waiting item.

An entry created without its required property stays waiting until an edit satisfies the filter. Removing a referenced property or changing its type shows a filter error: correct the routine's conditions before continuing. The delay is also respected when a filter becomes true. Feedback receipt includes private and pending feedback; running Numo does not publish it or bypass moderation.

![Trigger cards, event selection, nested AND/OR groups and a separate launch delay.](/documentation/en/scheduled-routines-workflow.png)

## Manage and verify runs {#runs}

Open the routine to inspect waiting conditions, change its instruction or trigger, pause it, or review occurrences. Pausing, deleting or changing its configuration invalidates waiting items. Re-enabling listens to future events without replaying old arrivals. A manual run can start any trigger type without waiting for its event and also consumes usage.

Each occurrence uses the owner's AI budget with a 15% monthly-budget cap by default, including Numo and delegated workers. Open its conversation to inspect the source, outcome, checks, questions and delegated work. When owner input is required, answer in that same conversation; the remaining occurrence budget is retained. Inspect saved results before adjusting a cap or retrying. After an ownership change, the previous owner's routine cannot start new work; create a routine as the current owner.

The cap applies when an included monthly budget is available; an uncapped personal-key mode does not acquire an artificial monthly allowance.

Archived project automations appear as paused proposals when their owner opens Routines. Read the [transition guide](/docs/automation-settings) before enabling one.
