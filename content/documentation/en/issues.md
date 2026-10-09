---
{
  "id": "issues",
  "locale": "en",
  "title": "Issues",
  "summary": "Create and organize issues, track their lifecycle, maintain dependencies and plans, and import or update work in bulk.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W01",
    "W03",
    "W02",
    "W08",
    "W05",
    "W06",
    "W07",
    "W09",
    "W04",
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx",
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "captures/shots/relations/intent.md",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts",
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts",
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts",
      "components/settings/project-recurrences-section.tsx",
      "lib/server/recurrence.ts",
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx",
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "content/documentation/reviews/csv-preview-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "feedback",
    "trash-and-recovery",
    "pages",
    "notifications-and-inbox",
    "objectives",
    "code-work",
    "scheduled-routines",
    "projects",
    "views",
    "personal-cycle"
  ],
  "aliases": [
    "create-an-issue",
    "triage-incoming-work",
    "issue-statuses",
    "issue-discussion-and-resources",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans",
    "recurring-issues",
    "bulk-issue-actions",
    "import-issues"
  ],
  "tags": [
    "Create and edit an issue",
    "Review incoming work in triage",
    "Move an issue through its lifecycle",
    "Discuss work and attach its context",
    "Link dependencies and related issues",
    "Split an issue into sub-issues",
    "Maintain an implementation plan",
    "Repeat an issue after completion",
    "Update several issues together",
    "Import a CSV backlog after checking its mapping"
  ],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/en/new-issue.png",
      "alt": "Unsent issue draft with a localized title and description and manually available properties.",
      "caption": "Describe the expected result, then choose the useful properties before creating the issue.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        368
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/en/triage-incoming.png",
      "alt": "Incoming demonstration issue DOC-11 with its report, properties and duplicate, Decline and Accept controls.",
      "caption": "Read the incoming report before accepting it, declining it or linking a duplicate.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        866
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/en/issue-statuses.png",
      "alt": "Eight issue statuses in the picker, with backlog currently selected.",
      "caption": "The check marks the current status. Choose the status that reflects the work’s actual state.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        288,
        357
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-resources.png",
      "alt": "Add-link dialog with an example contact URL.",
      "caption": "Review the destination before adding a resource. This example link has not been submitted.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        212
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-dependencies.png",
      "alt": "Search for a blocker by issue identifier.",
      "caption": "Choose the relation direction before selecting its endpoint. The picker is shown without submitting a relation.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        368,
        152
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-sub-issues.png",
      "alt": "Sub-issue creation field in a demonstration parent issue.",
      "caption": "The inline field creates a child under this parent; a child keeps its own status and discussion.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-implementation-plan.png",
      "alt": "Demonstration plan showing two of six work tasks complete.",
      "caption": "The saved demonstration plan separates completed, active and pending steps. Its progress does not prove the fictional code task was executed.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/en/issue-date-recurrence.png",
      "alt": "Due-date picker in recurring mode with a weekly Sunday preview and optional time.",
      "caption": "Recurring mode previews the weekly cadence. Confirm the first due date before creating the issue.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        324,
        544
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-bulk-actions.png",
      "alt": "Action menu for two selected demonstration issues.",
      "caption": "The menu applies an action to the selected issues. No grouped change was submitted in this capture.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        506
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/import-issues-preview-workflow.png",
      "alt": "CSV preview with two localized demonstration rows and detected column mappings.",
      "caption": "CSV preview with two localized demonstration rows and detected column mappings. No import was submitted; optional AI planning was blocked for the capture.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        977
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps",
    "triage-incoming-work-steps",
    "issue-statuses-steps",
    "issue-discussion-and-resources-steps",
    "issue-dependencies-steps",
    "sub-issues-steps",
    "implementation-plans-steps",
    "recurring-issues-steps",
    "bulk-issue-actions-steps",
    "import-issues-workflow"
  ]
}
---

An issue tracks a piece of work within a project, from its initial report to completion. Start with creation, triage and statuses, or use the sections on discussion, dependencies, sub-issues and plans for work already underway. Recurrence, bulk actions and CSV import have their own checks before you apply them.

## Create and edit an issue {#create-an-issue}

You need membership in the destination project. Open the project and its new-issue control. Enter a title that names the work, then add the context, expected result and constraints in the description. Choose the project deliberately when creating from a personal or cross-project view.

For manual creation, switch Smart-fill off if its button is shown and enabled. This reveals the priority, effort, category and objective controls for you to set. The switch applies to this issue; reopening the creation form restores its account preference. It is independent of the project’s automation and Smart Assign switches.

Set the useful properties before confirming: status, priority, effort, assignee, objective, categories, due date and recurrence. An assignee is a project member; an objective groups issues around a project outcome. You can leave optional properties unset instead of guessing. Priority ranges from none through low, medium and high to urgent; effort uses XS, S, M, L and XL.

Confirm creation and open the new issue. Check its identifier and project. Reopen its property pickers to change values as the task becomes clearer. The description explains the work; an implementation plan is maintained separately in the Plan tab.


![Unsent issue draft with a localized title and description and manually available properties.](/documentation/en/new-issue.png)

### Check saving and visibility {#issue-save}

After a property change, verify the displayed value. Filters may remove an issue from the current view immediately when its assignee, status or category changes. Search its identifier or open the project without those filters before creating a replacement.

If creation or saving fails, retain your text, read the error and check that membership and the destination still exist. A retry after a network failure should first check whether the issue was already created. Attach project pages as live resources when their current content is needed, and use comments for task discussion.

## Review incoming work in triage {#triage-incoming-work}

Open the project's Triage destination. Read the incoming issue and its source context before accepting it into planned work. Check whether an existing issue already represents the request. Clarify the expected outcome, project, assignee, priority and effort as needed.

Choose Accept and confirm to move a retained issue to backlog. Choose Decline and confirm to set it to canceled. For a duplicate, use the duplicate picker to select the retained issue; the incoming issue becomes duplicate and points to that issue. After an item leaves triage, the next item is selected. Verify the resulting status or duplicate link in the issue itself. Moving between cards without taking one of these actions does not close the issue.

### Sorting and limits {#triage-order}

Smart Triage uses deterministic sorting rules.

Within each status column, the rules first put open issues blocking other open work ahead of unblocked issues. Issues blocked by open work go last, even when they also block other issues. Closed endpoints no longer create that priority. Within a tier, higher priority, smaller effort and overdue or imminent due dates bring work forward. Within the same blocking tier, issues sharing an objective stay together, ordered by the best-ranked issue in their group. Ties use due date, then oldest creation date, then manual position, with the identifier as a final stable tie-break. A related link does not affect this ordering. It is not an experimental AI triage mode. The ordering helps decide which items to inspect first; it does not establish the truth of a description, resolve duplicates automatically or grant permissions.

If the expected item is missing, check the active project, status and filters, then search its identifier. Imported or externally synchronized work may enter triage; inspect the original source and the integration's mapping before changing mirrored fields. A request linked from feedback is still a distinct feedback object with its own public discussion.


![Incoming demonstration issue DOC-11 with its report, properties and duplicate, Decline and Accept controls.](/documentation/en/triage-incoming.png)

## Move an issue through its lifecycle {#issue-statuses}

Open the issue's status picker or use the board's status actions. In a kanban view, moving work between status columns changes the issue itself; changing a filter only changes what you see. Verify the new status in the detail panel after the move.

| Status | Use |
| --- | --- |
| Triage | Incoming work awaiting review. |
| Backlog | Retained work not yet selected to start. |
| Todo | Work selected to do. |
| In progress | Work underway. |
| In review | Implementation awaiting review. |
| Done | Expected result completed. |
| Canceled | Work closed without delivery. |
| Duplicate | Work represented by another issue. |

Statuses are fixed rather than customized per project. Triage and duplicate are available in pickers but deliberately absent from normal kanban columns. A missing column is not evidence that the status or issue does not exist.


![Eight issue statuses in the picker, with backlog currently selected.](/documentation/en/issue-statuses.png)

### Terminal states and verification {#closed-work}

Done, canceled and duplicate are terminal for tracking: they stop blocking dependent issues and leave active counts. Closing as canceled does not mean the task was delivered. When marking a duplicate, identify the retained issue so discussion and progress have a clear destination.

Check filters if an issue disappears after closing it. Reopen the issue by identifier to inspect the result and change its status if you closed it by mistake. For blocked work, also inspect dependency direction: a status change on one issue does not rewrite its description or plan.

## Discuss work and attach its context {#issue-discussion-and-resources}

Open the issue's discussion timeline to add a comment. Explain a decision, question or verification result so another member can understand what changed. Use mentions when you need a person or linked object in context; notifications still depend on the recipient's preferences and device delivery.

Attach a relevant project page, file or link through the resources controls. A linked page is a live resource: its title follows page renaming and its content can evolve. A file is a stored attachment rather than a guarantee that an external URL remains available.

![Add-link dialog with an example contact URL.](/documentation/en/work-resources.png)

### Visibility and failed uploads {#resource-access}

Issue membership and project access govern internal discussion and resources. Adding a resource to an issue does not publish it anonymously. When referring to feedback, distinguish the team-only discussion from a public response before sending text.

Check that an uploaded resource appears and can be opened after the operation. If it fails, preserve the original file, read the upload error, and verify the applicable file size or account-storage limit. Self-hosted operators also need working Storage metadata, policies and raw bytes. Avoid posting credentials or private diagnostic dumps as attachments.

## Link dependencies and related issues {#issue-dependencies}

Open an issue's relations controls and find the other issue by title or identifier. Choose a blocking relation when one task must finish before another can proceed. If A blocks B, A is the prerequisite and B is blocked by A. A related relation adds context without imposing that order.

Read both issue identifiers and the displayed direction before confirming. For example, “Prepare the endpoint” blocks “Connect the client”, rather than the reverse. A dependency does not make either issue a sub-issue, and a parent-child relation is not a substitute for a blocking relation.

![Search for a blocker by issue identifier.](/documentation/en/work-dependencies.png)

### Resolved and inherited blockers {#blocker-state}

Terminal statuses done, canceled and duplicate stop an issue from blocking work. Relations connect issues or objectives in the same project; both endpoints must be accessible there. They do not link arbitrary private work across projects or publish either endpoint.

An open issue can inherit a blocker through its open objective. If A blocks objective B, open issues attached to B show A as an inherited blocker, even without a direct A-to-issue relation. The display names the actual blocker and the objective responsible for inheritance. Inspect that objective relation before trying to unlink it from the issue. Closing A, closing B or moving the issue out of B removes that inherited blockage. This mechanism follows objective membership, not the parent/sub-issue hierarchy.

Remove a relation from the relations controls when its meaning no longer applies, then verify both the label and the blocked indicator. Marking an issue as a duplicate has lifecycle semantics and points to retained work; use it for duplicated tasks rather than creating an ordinary related link and assuming that closes the duplicate.

If the relation picker cannot find an issue, check project access and the identifier. Do not expose another project's content by pasting a private issue URL into a public feedback reply.

## Split an issue into sub-issues {#sub-issues}

Open the parent issue and use its sub-issue controls to create smaller pieces of work. Give each child a distinct outcome. Inspect its project, properties and parent identifier after creation; a hierarchy should make the task easier to track, not replace the description of what each child must achieve.

The hierarchy permits one level: a parent must be a top-level issue in the same project, and a sub-issue cannot itself have children. When no objective is explicitly chosen during creation, the child inherits the parent’s objective; inspect the resulting properties rather than assuming that later parent edits propagate.

A child remains an issue with its own status and discussion. The parent’s progress indicator is weighted by child effort and status completion credit. The sub-issue list’s completed/total counter is a separate raw count. Read the child states alongside both measures. Use a dependency when you mean “must finish before”; use a parent when you mean “part of this larger task”.

![Sub-issue creation field in a demonstration parent issue.](/documentation/en/work-sub-issues.png)

### Open or remove the parent relationship {#change-parent}

The parent identifier beside the child title opens a menu. Use the open-parent action to inspect the larger task. To detach the child, choose unlink from the parent and read the confirmation before applying it. Successful unlinking removes the parent relationship while retaining the issue.

Do not delete a child merely to reorganize the hierarchy. Check existing parent and child relationships before reparenting, and resolve a rejected relationship rather than forcing a circular hierarchy. If a save fails, reopen the child to see whether the parent change was applied before retrying. Keep completed child work intact when revising the overall plan.

## Maintain an implementation plan {#implementation-plans}

Open the issue's Plan tab. Its description should already state the problem and expected result. Add the implementation steps manually, or ask Numo to inspect the linked repository before proposing a code-level plan. An AI-generated path or function is not evidence unless the repository was actually read.

Indent a task line with two spaces for each nesting level; a tab counts as four spaces. Nesting organizes steps in the plan and does not create issue parent/child relationships. Each noncanceled work task still contributes to progress, including nested tasks.

The plan uses Markdown task lines: `- [ ]` for pending, `- [~]` for in progress, `- [x]` for completed and `- [-]` for canceled. Put the task text after the marker, for example `- [ ] Check the contact link on mobile`. Canceled tasks are excluded from the completion count. Tasks under a recognized Questions heading are treated as questions and are also excluded from progress, so keep work steps in a separate section of the same heading level. Save explicit edits with the save control; cancel discards the draft. Checking a rendered task updates that task's state. Use pending, in progress, completed and canceled states to reflect what happened rather than to imply verification that has not run.

![Demonstration plan showing two of six work tasks complete.](/documentation/en/work-implementation-plan.png)

### Preserve progress and concurrent edits {#plan-progress}

Extend or patch the existing plan instead of replacing it with a new unchecked copy. Retain completed steps and explanations of changed scope. Before saving a substantial rewrite, compare it with the latest plan if another member or agent has been working on the issue.

A written plan can be handed to Numo for implementation when repository work and its configured sandbox are available. After completed work exists, the interface also offers implementation verification. Those actions launch work; the presence of a checked checkbox does not itself prove the code passes tests. Read the result, changes and checks before marking the issue done.

## Repeat an issue after completion {#recurring-issues}

Create or open an issue that remains useful each time, such as a periodic dependency check. Set a due date, then choose a daily, weekly, monthly or yearly recurrence in the issue’s date control. A recurrence without a due date is rejected. Review the properties and assignee before saving. Project recurrence settings list active series; use them to change the cadence or stop repetition.

Recurring issues recreate themselves after the issue is done; the next issue is created in the backlog. Check the next issue's identifier and properties after completing a recurrence.

The next due date comes from the previous due date plus one cadence, not from the day you completed the task. The successor copies title, description, priority, effort, assignee, objective and categories. It does not copy the implementation plan, parent relationship, resources or comments. Recurrence moves to the successor; reopening and completing the old issue again does not create another occurrence. If successor creation fails, the series stops rather than repeatedly retrying on the completed issue. Inspect the result and configure recurrence on the appropriate next task after resolving the failure. Do not assume that a calendar schedule runs code or completes the new issue for you.


![Due-date picker in recurring mode with a weekly Sunday preview and optional time.](/documentation/en/issue-date-recurrence.png)

### Change or stop repetition {#recurrence-change}

Use the recurrence settings to edit or disable future repetition. Inspect already created issues separately: stopping future creation does not mean existing work has been completed or removed.

A Numo routine is a different object: it schedules a conversation and can use the owner's AI budget and configured providers. Choose recurring issues for a repeated tracked task and a routine for an instruction that should execute on a schedule. If the next issue is missing, check whether the previous issue was marked done, whether recurrence remains enabled and whether you are viewing the backlog without restrictive filters.

## Update several issues together {#bulk-issue-actions}

On a board, hold Shift and click each issue card to toggle its selection. With a mouse, you can also drag a selection rectangle from empty board space; Shift, Command or Ctrl makes that gesture additive. The rectangle gesture is not a touch-screen selection mode. Check the selected count and visible identifiers before opening the bulk actions. Selection is a working set for the action, not a saved view and not a permission grant.

Choose Actions in the floating selection bar to open the command palette. Choose status, priority, effort or assignee, set the value and confirm the inline form. The objective action appears only for a selection in one project with available objectives. Other actions, such as adding to or removing from a cycle, linking two issues or sending the selection to Numo, appear when the current board supports them. Inspect the affected issues afterward. On a touch-only device without a supported multi-selection gesture, edit each issue through its detail panel.

![Action menu for two selected demonstration issues.](/documentation/en/work-bulk-actions.png)

### Partial results and destructive actions {#bulk-results}

When working across projects, verify membership in every affected project. Read any partial failure result: successful changes may already be saved even if another issue was rejected. Inspect the result before retrying the entire selection.

Deletion affects every selected item, so confirm the set before proceeding. Clear selection after the operation when you are moving to unrelated work. If filters change as a result of your update, issues can leave the displayed view while remaining in the project. Search identifiers to verify the new state instead of recreating them.

## Import a CSV backlog after checking its mapping {#import-issues}

The project owner opens Import in project settings and selects a CSV export. Linear and Jira layouts are detected; other CSVs use generic mapping. The limit is 5 MiB and 5,000 issues per import. Split a larger export deliberately and keep parent references within the same batch where possible.

Map the title column before importing. Review description, status, priority, effort, due date, categories and assignees. Map people to actual project members and inspect new categories. Parent references match external keys in the batch and support one level. CSV files do not import attached file bytes.

An AI proposal is requested only for mapping gaps. It is editable and a failed or unavailable provider leaves manual mapping usable. A manual correction prevents a late proposal from overwriting your choices.

### Commit and inspect {#result}

Read the issue counts, status distribution and warnings after each mapping change. Correct skipped or invalid rows before committing. Import creates new issues; do not assume reuploading is a deduplicating update. After success, inspect representative issues, assignments, dates and parent links. If the response is lost, inspect the project before retrying the whole file to avoid duplicate work.

![CSV preview with two localized demonstration rows and detected column mappings.](/documentation/en/import-issues-preview-workflow.png)
