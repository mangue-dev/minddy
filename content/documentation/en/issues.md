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
    "A06",
    "A11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 33,
  "sourceRevision": 33,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review); MIN-753 drafts tray; MIN-750 Smart Fill re-evaluation",
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
      "lib/smart-fill-fields.ts",
      "lib/server/smart-fill-reevaluation.ts",
      "lib/server/smart-fill-ownership.ts",
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
      "components/export-issues-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "app/api/me/issues/export/route.ts",
      "lib/export/issues-csv.ts",
      "lib/export-api.ts",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "lib/issue-prompt.ts",
      "lib/server/issue-prompt-context.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/issue-relation-decision.ts",
      "lib/server/issue-embedding-store.ts",
      "components/settings/account-preferences-section.tsx",
      "lib/issue-semantic-query.ts",
      "lib/server/issue-semantic-search.ts",
      "components/relation-target-picker.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/settings/account-smart-fill-section.tsx",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "components/relations-section.tsx",
      "components/objective-relations-section.tsx",
      "components/issue-field-shortcuts.tsx",
      "components/creation-relations.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/server/assistant/prompt.ts",
      "components/drafts-tray.tsx",
      "lib/use-all-drafts.ts"
    ]
  },
  "review": {
    "revision": 33,
    "fact": "agent:/root/min778 (resources paragraph checked against components/resources.tsx, lib/use-pages-query.ts, lib/use-attachment-uploads.ts and components/global-page-panel.tsx: the page picker creates a page, titled by the search when one is typed, attaches it and opens it in the side panel with Expand; rest of the article unchanged since the MIN-777 review; no figure changed)",
    "language": "agent:/root/min778 (en sentences on creating a page from the page picker with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "alt": "Unsent issue draft in the Aurora project with a localized title and description, manually available properties and the Create AUR-19 button.",
      "caption": "Describe the expected result, then choose the useful properties before creating the issue.",
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        720,
        396
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
      "revision": 33,
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        288,
        358
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        368,
        184
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        508,
        1416
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        324,
        540
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        977
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-file-preview",
      "kind": "screenshot",
      "src": "/documentation/en/file-preview.png",
      "alt": "Full-window CSV reader with sample project tasks, a large Close button and a File actions menu offering Download, Rename and Remove.",
      "caption": "The shared file reader keeps Close below the preview. The File actions menu offers Download and, when permitted, Rename and Remove.",
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
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
    "import-issues-workflow",
    "issue-file-preview"
  ]
}
---

An issue tracks a piece of work within a project, from its initial report to completion. Start with creation, triage and statuses, or use the sections on discussion, dependencies, sub-issues and plans for work already underway. Recurrence, bulk actions and CSV import have their own checks before you apply them.

## Create and edit an issue {#create-an-issue}

You need to be the owner or a Member of the destination project; readers can open issues but not create or edit them. Open the project and its new-issue control. Enter a title that names the work, then add the context, expected result and constraints in the description. The title and description work as one text: on a computer, the Down arrow on the title's last line moves to the description's first line, the Up arrow comes back, and the cursor keeps about the same place across the line. Shift+Enter in the title moves to the description; Enter does too, unless you chose Enter as your send shortcut, in which case it creates the issue. Command/Ctrl+Enter creates it from either field. The same arrows and Enter link the title and description of an open issue, objective, page or feedback request. The form opens on the current project; choose another one in **Create in**, at the top left of the form (next to the **New issue** title on a phone), especially when creating from a personal or cross-project view. On a computer, Command/Ctrl+Shift+P opens that menu, even while you type the title or description; once you choose a project or close the menu, the cursor returns exactly where it was. The pill shows this shortcut, which exists only when more than one project can be chosen; a phone shows no shortcut hint. Changing it clears the categories, objective and relations picked for the previous project. The create button names the identifier the issue will receive, such as `MIN-42`, and follows issues created meanwhile; its menu creates the issue and copies that identifier.

For manual creation, switch Smart-fill off if its button is shown and enabled. This reveals the priority, effort, category, objective and relations controls for you to set. To set only some of these properties, keep Smart-fill on and, outside the title and description, press the property's key: P for priority, E for effort, L for categories or O for objective. Its picker opens, and the value you choose stays visible. Smart-fill only infers the properties you left empty. The switch applies to this issue; reopening the creation form restores its account preference. It is independent of Smart Assign and routines. While Smart-fill is on, it also [links the issue to related issues](#smart-fill-relations) once it is saved, so the relations picker is hidden; R still opens it. Relations you already chose stay visible above the title and are created with the issue.

Set the useful properties before confirming: status, priority, effort, assignee, objective, categories, due date and recurrence. An assignee is the project owner or a Member, never a reader; an objective groups issues around a project outcome. You can leave optional properties unset instead of guessing. Priority ranges from none through low, medium and high to urgent; effort uses XS, S, M, L and XL.

Confirm creation and open the new issue. Check its identifier and project. Reopen its property pickers to change values as the task becomes clearer. The description explains the work; an implementation plan is maintained separately in the Plan tab.

Closing the form with text in it asks whether to keep it: **Save** keeps it as a draft, **Discard** drops it, **Back** returns to the form. Saved issue and objective drafts gather in **Drafts**, at the bottom right of the window between Numo and the task notebook; the button appears only while you have a draft and shows how many. Its list gives each draft's title and first description line. Choose a draft to reopen it in its creation form and finish it; creating the issue removes the draft. The delete button beside a draft asks for confirmation first, and the deletion cannot be undone. On a phone, open the command palette and search for the draft's title. Drafts are kept on this device for 30 days, ten of each kind at most; the list shows only drafts of projects where you can still create issues.


![Unsent issue draft in the Aurora project with a localized title and description, manually available properties and the Create AUR-19 button.](/documentation/en/new-issue.png)

The description, comments and the new-issue dialog use the same editor as project pages, without the block handles. Type `/` to insert a heading, list, task, quote, **Callout**, code block, **Toggle** or divider, and `@` to mention a person, issue, objective or page. The `@` menu also lists the resources attached to what you are writing: the issue or objective for its description and plan, a comment for its own files, or a creation dialog for the files added in it. A mention of a resource attached elsewhere shows as **Unavailable**. Several people can edit the same description at once: each person's caret appears with their name and color, and changes made by Numo or a connected agent appear as they are saved. Numo, connected agents and CSV exports read the text as Markdown, which follows a few seconds after typing stops. Select text to make it bold, italic, struck through or code, or to add a link. Paste or drop an image, or choose **Image** in the `/` menu, to insert it in the description; other kinds of files belong in the issue's resources. A mention points at its target, not at its name: it follows a rename and survives editing and copy-paste into another description, comment, page or the Numo composer. A reader who cannot open the target sees an **Unavailable** mention, without its name or project.

### Check saving and visibility {#issue-save}

After a property change, verify the displayed value. Filters may remove an issue from the current view immediately when its assignee, status or category changes. Search its identifier or open the project without those filters before creating a replacement.

If creation or saving fails, retain your text, read the error and check that membership and the destination still exist. A retry after a network failure should first check whether the issue was already created. Attach project pages as live resources when their current content is needed, and use comments for task discussion.

### Choose what Smart-fill does {#smart-fill-preferences}

Smart-fill preferences belong to your account. Open **Account settings** → **Smart Fill**. Each option has its own card:

- In the **Smart Fill** card, **Enable Smart Fill** turns Smart-fill on or off for your account. It fills missing priority, effort, categories and objective; status, assignee and due date stay yours. The switches of the next two cards depend on it.
- In **Issues to fill**, **Fill created issues** and **Fill triage issues** choose which new issues it fills: the issues you create, and the triage issues you own. **Re-evaluate edited issues**, on by default, lets Smart-fill [read an issue again](#smart-fill-reevaluation) after its title or description changes.
- In **Related issues**, **Link related issues**, on by default, lets Smart-fill [add relations](#smart-fill-relations) after an issue is saved.
- In **Issue indexing**, **Index issues**, on by default and independent of Smart-fill, turns the titles and descriptions of the issues you create or edit into private vectors used to find related issues and to [search issues by meaning](/docs/navigation#search-by-meaning). Background indexing of a project's existing issues follows both the project owner's switch and the author's: an issue whose author turned it off is never indexed. Vectors are encrypted with the project, like the issue; vectors stored before the project started encrypting are converted by the background job. When the switch is off, no vector is created for your issues, even when someone else edits them, and the related-issue search compares words only. Your own searches then use text only, without search by meaning. Vectors already created stay while the text is unchanged; they are deleted as soon as the text changes, or with the issue.

Turning a switch off also cancels the passes that have not run yet. Numo can change these preferences when you ask it to.

### When Smart-fill reads an issue again {#smart-fill-reevaluation}

With **Re-evaluate edited issues** on, an issue created with Smart-fill on is read again after its title or description changes. Smart-fill waits until the text has not changed for five minutes, so a series of edits is read once; the pass can start up to one minute later. It then sets the priority, effort, categories and objective again from the new text.

It only changes the properties nobody chose by hand: those left empty when the issue was created and that nobody has changed since. As soon as you, Numo or a connected agent changes one of them, Smart-fill leaves it alone for good. It never removes the objective or all the categories; it can clear the effort when the text no longer describes estimable work. Issues created before this feature, with Smart-fill switched off or with every property already set are never read again.

Each change appears in the issue's activity with Smart-fill as its author, and an issue moved to another objective also appears in the activity of both objectives. A pass that finds nothing to change writes nothing. The pass counts toward the **Automations** share of the person who made the latest edit, follows that person's **Re-evaluate edited issues** preference, and is skipped when their budget is exhausted or the provider fails.

## Review incoming work in triage {#triage-incoming-work}

Open the project's Triage destination. Read the incoming issue and its source context before accepting it into planned work. Check whether an existing issue already represents the request. Clarify the expected outcome, project, assignee, priority and effort as needed.

Use the list filters to narrow incoming issues by priority, effort, assignee, objective, categories or integration. Choices within one property are alternatives; different properties are combined. Clear the filters to show all incoming issues again.

Choose Accept and confirm to move a retained issue to backlog. Choose Decline and confirm to set it to canceled. For a duplicate, use the duplicate picker to select the retained issue; the incoming issue becomes duplicate and points to that issue. Describing the request in the picker's search also lists similar issues under **Related by meaning**, after the text matches; see [Search issues by meaning](/docs/navigation#search-by-meaning). After an item leaves triage, the next item is selected. Verify the resulting status or duplicate link in the issue itself. Moving between cards without taking one of these actions does not close the issue.

### Sorting and limits {#triage-order}

Smart Triage uses deterministic sorting rules.

Within each status column:

- Open issues blocking other open work come first, followed by unblocked issues. Issues blocked by open work come last, even if they also block others. Closed endpoints no longer affect this priority.
- Within a blocking tier, higher priority, smaller effort and overdue or imminent due dates bring work forward.
- Issues sharing an objective stay together within that tier, ordered by the best-ranked issue in the group.
- Ties use due date, then oldest creation date, manual position and finally the identifier.

A related link does not affect ordering. Smart Triage is not an experimental AI mode: its ranking helps you choose what to inspect first, but does not validate descriptions, resolve duplicates or grant permissions.

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

Statuses are fixed rather than customized per project. Triage and duplicate are available in pickers but deliberately absent from normal kanban columns. By default, boards also hide the **Done** and **Canceled** columns; select them in the **Status** filter to show them. A missing column is not evidence that the status or issue does not exist.


![Eight issue statuses in the picker, with backlog currently selected.](/documentation/en/issue-statuses.png)

### Terminal states and verification {#closed-work}

Done, canceled and duplicate are terminal for tracking: they stop blocking dependent issues and leave active counts. Closing as canceled does not mean the task was delivered. When marking a duplicate, identify the retained issue so discussion and progress have a clear destination.

Check filters if an issue disappears after closing it. Reopen the issue by identifier to inspect the result and change its status if you closed it by mistake. For blocked work, also inspect dependency direction: a status change on one issue does not rewrite its description or plan.

## Discuss work and attach its context {#issue-discussion-and-resources}

Open the issue's discussion timeline to add a comment. Explain a decision, question or verification result so another member can understand what changed. Use mentions when you need a person or linked object in context; notifications still depend on the recipient's preferences and device delivery. A reader can comment only when the owner turned on **Can comment** for them. They can then reply, mention people, attach files to their own comments, and edit or delete their own comments.

Attach a relevant project page, file or link through the resources controls. A linked page is a live resource: its title follows page renaming and its content can evolve. A file is a stored attachment rather than a guarantee that an external URL remains available. To write a page that does not exist yet, choose **Page**, then **New page** at the bottom of the list; typing a title in the search first gives it that title. The page is created in the project, attached to the issue and opened in a side panel, where **Expand** opens the full page.

Resources appear as cards: the image itself or the file type's icon, the name and the size. A link shows its page's preview image when the site provides one, otherwise its favicon. Click or right-click a card to open its menu: Preview, Open link or Open page, then Rename, Download and Remove when they apply. Preview opens a supported file across the whole window. Images, PDF files, Markdown (`.md`), plain text (`.txt`, `.text`), CSV files and supported audio or video use the same reader. Markdown is formatted, text stays literal, and CSV opens as a scrollable table. Use Close or Escape to return to the issue. The File actions (`…`) menu offers Download and, when you can change this resource, Rename and Remove. Clicking a file mention in a text opens the same reader. Minddy asks for confirmation before removing a resource, which then detaches from this context. A page resource keeps its page's title and cannot be renamed. Unsupported formats keep their download action. **Open page** reads the page in a side panel, where **Expand** opens the full page; a database opens as a full page directly.

![Full-window CSV reader with sample project tasks, a large Close button and a File actions menu offering Download, Rename and Remove.](/documentation/en/file-preview.png)

![Add-link dialog with an example contact URL.](/documentation/en/work-resources.png)

### Visibility and failed uploads {#resource-access}

Issue membership and project access govern internal discussion and resources. Adding a resource to an issue does not publish it anonymously. When referring to feedback, distinguish the team-only discussion from a public response before sending text.

Check that an uploaded resource appears and can be opened after the operation. If it fails, preserve the original file, read the upload error, and verify the applicable file size or account-storage limit. Self-hosted operators also need working Storage metadata, policies and raw bytes. Avoid posting credentials or private diagnostic dumps as attachments.

## Link dependencies and related issues {#issue-dependencies}

Open an issue's relations controls and find the other issue by title or identifier. Outside a text field, R opens the relation type choice from a hovered card or the issue panel. A descriptive query also lists, after the text matches, issues of the same project found [by meaning](/docs/navigation#search-by-meaning) under **Related by meaning**. Choose a blocking relation when one task must finish before another can proceed. If A blocks B, A is the prerequisite and B is blocked by A. A related relation adds context without imposing that order.

Read both issue identifiers and the displayed direction before confirming. For example, “Prepare the endpoint” blocks “Connect the client”, rather than the reverse. A dependency does not make either issue a sub-issue, and a parent-child relation is not a substitute for a blocking relation.

![Search for a blocker by issue identifier.](/documentation/en/work-dependencies.png)

### Resolved and inherited blockers {#blocker-state}

Terminal statuses done, canceled and duplicate stop an issue from blocking work. Relations connect issues or objectives in the same project; both endpoints must be accessible there. They do not link arbitrary private work across projects or publish either endpoint.

An open issue can inherit a blocker through its open objective. If A blocks objective B, open issues attached to B show A as an inherited blocker, even without a direct A-to-issue relation. The display names the actual blocker and the objective responsible for inheritance. Inspect that objective relation before trying to unlink it from the issue. Closing A, closing B or moving the issue out of B removes that inherited blockage. This mechanism follows objective membership, not the parent/sub-issue hierarchy.

Remove a relation from the relations controls when its meaning no longer applies; a confirmation names the other issue or objective, and only the link goes away. Then verify both the label and the blocked indicator. Marking an issue as a duplicate has lifecycle semantics and points to retained work; use it for duplicated tasks rather than creating an ordinary related link and assuming that closes the duplicate.

If the relation picker cannot find an issue, check project access and the identifier. Do not expose another project's content by pasting a private issue URL into a public feedback reply.

### Links added by Smart-fill {#smart-fill-relations}

With **Link related issues** on, Smart-fill looks for related issues after an issue is created or its title or description changes. The work runs in the background after the save: creating or editing never waits for it, and links can appear a few seconds later. For a new issue, it follows the same choices as the other fields, so it does not run when you switched Smart-fill off for that issue. It does not run for issues imported from a linked repository, for recurring copies or for changes synced from the repository.

Smart-fill compares the issue with at most five candidates from the same project, leaving out canceled, duplicate and deleted issues. One decision then classifies each candidate as related, blocks, blocked by or no relation. Similarity alone never creates a link, a dependency needs stronger evidence than a related link, and Smart-fill adds nothing when in doubt. A related link needs an obvious connection, such as the same bug, a direct follow-up or a reversal: two issues that only share a feature or a topic stay unlinked. Most issues therefore receive no link. A single pass adds at most two relations. It never touches a pair that already has a relation, never adds a blocking relation that would close a cycle, and discards its result if the issue's text changed during the decision. It never marks a duplicate and never changes a status.

Links added this way appear in the issue's relations like any other, and the timeline names Smart-fill as their author. Check the direction of a dependency as you would for your own. To remove a link, use the relations controls: Smart-fill does not add a removed link back for that pair. To stop new links, turn off **Link related issues** in [your preferences](#smart-fill-preferences). Issues created before this feature, imported issues and issues synced from a repository are indexed gradually in the background, but they never receive links automatically.

Indexing and relation decisions use AI. They count toward the **Automations** share of the account that owns the pass: the account charged for the new issue's Smart-fill, usually its creator; the editor for an edit; and the project owner for background indexing. Usage history lists indexing as **Smart-fill · issue index**. A relation decision appears as **AI decision** when the decision model answers it, and as **Smart-fill · relations** when the fallback model does. If that budget is exhausted or the provider fails, the pass is skipped and the issue stays unchanged. [Searching issues by meaning](/docs/navigation#search-by-meaning) uses the same index: each new query counts toward the searching account's **Automations** share and appears as **Issue search**.

## Split an issue into sub-issues {#sub-issues}

Open the parent issue and use its sub-issue controls to create smaller pieces of work. Give each child a distinct outcome. Inspect its project, properties and parent identifier after creation; a hierarchy should make the task easier to track, not replace the description of what each child must achieve.

The hierarchy permits one level: a parent must be a top-level issue in the same project, and a sub-issue cannot itself have children. When no objective is explicitly chosen during creation, the child inherits the parent’s objective; inspect the resulting properties rather than assuming that later parent edits propagate.

A child remains an issue with its own status and discussion. The parent’s progress indicator is weighted by child effort and status completion credit. The sub-issue list’s completed/total counter is a separate raw count. Read the child states alongside both measures. Use a dependency when you mean “must finish before”; use a parent when you mean “part of this larger task”.

![Sub-issue creation field in a demonstration parent issue.](/documentation/en/work-sub-issues.png)

### Open or remove the parent relationship {#change-parent}

The parent identifier beside the child title opens a menu. Use the open-parent action to inspect the larger task. To detach the child, choose unlink from the parent and read the confirmation before applying it. Successful unlinking removes the parent relationship while retaining the issue.

Do not delete a child merely to reorganize the hierarchy. Check existing parent and child relationships before reparenting, and resolve a rejected relationship rather than forcing a circular hierarchy. If a save fails, reopen the child to see whether the parent change was applied before retrying. Keep completed child work intact when revising the overall plan.

## Maintain an implementation plan {#implementation-plans}

Open the issue's Plan tab. Its description should already state the problem and expected result. Add the implementation steps manually, or [copy the **Generate a plan** prompt](#copy-issue-prompt) for your own coding agent, which explores the repository itself. Numo cannot read the repository: it can sharpen the description and, when you ask, write a basic plan, but any file path or function it names is a guess. A path or function in a plan is evidence only when the repository was actually read.

The plan is edited in place, like the description: click in it and type, without an edit mode or a save button. An empty plan shows a placeholder. Several members, Numo and connected agents can edit the same plan at once, each with a named caret, and a task an agent checks appears in your editor while you write elsewhere. Type `- [ ]` followed by a space at the start of a line, or choose **Task list** in the `/` menu, to add a task. Click a task's box to complete it, or open its menu for the other states.

Press Tab in a task to nest it under the previous one and Shift+Tab to bring it back; in the stored Markdown, each level is indented by two spaces. Nesting organizes steps in the plan and does not create issue parent/child relationships. Each noncanceled work task still contributes to progress, including nested tasks.

The plan uses Markdown task lines: `- [ ]` for pending, `- [~]` for in progress, `- [x]` for completed and `- [-]` for canceled. Put the task text after the marker, for example `- [ ] Check the contact link on mobile`. Canceled tasks are excluded from the completion count. Tasks under a recognized Questions heading are treated as questions and are also excluded from progress, so keep work steps in a separate section of the same heading level. The editor shows these lines as tasks and writes them back in the same format, which Numo and connected agents read. Use pending, in progress, completed and canceled states to reflect what happened rather than to imply verification that has not run.

![Demonstration plan showing two of six work tasks complete.](/documentation/en/work-implementation-plan.png)

### Preserve progress and concurrent edits {#plan-progress}

Extend or patch the existing plan instead of replacing it with a new unchecked copy. Retain completed steps and explanations of changed scope. Changes made by other members and agents appear in the plan as they are made. A tool that replaces the whole plan still replaces the passages it rewrote, so ask agents to edit only the part they change.

To have the plan implemented, copy the issue's prompt for your own coding agent, as described below. A checked task does not itself prove the code passes tests. Read the result, changes and checks before marking the issue done.

### Copy a prompt for another coding agent {#copy-issue-prompt}

To hand an issue to a coding agent outside Minddy, such as Claude Code, Codex or Cursor, open the issue's actions menu, choose **Copy as prompt**, then **Generate a plan** (or **Review the plan** when one exists), **Implement the issue**, **Verify the implementation** or **Custom…**. With several issues selected, **Copy the combined prompt** puts them in one prompt. Copying runs no AI model and uses no AI allowance: Minddy assembles what it already stores, and the agent explores the repository itself. If **Start the issue or task when I copy its prompt** is enabled in account preferences, copying also starts an issue that has not started yet. See [Code work and pull requests](/docs/code-work) for the complete workflow and pull request review.

The prompt carries the issue's fields, categories, relations, the number of attached resources and the plan's progress, but not the plan text, which the agent reads through the Minddy MCP server or asks you for. It also lists the project's linked repository and every pull request linked to the issue, with its state and branches when known. The agent continues an open pull request on its branch and treats merged or closed ones as history. Without an open pull request, the prompt suggests a branch name made of the issue identifier and a short title, such as `min-42-keyboard-navigation`. This is only a suggestion: the agent checks existing branches and follows the repository's naming convention first. Keeping the identifier in the branch name, the pull request title or a `Fixes MIN-42` line lets Minddy attach the pull request to the issue when the repository is linked.

If the pull request information cannot be loaded, the prompt says so instead of claiming there is none. Plan and plan review prompts ask the agent to stop before implementing. A custom prompt keeps your request and its scope as written. The issue's content and your request keep their original language; the surrounding instructions are in English.

## Repeat an issue after completion {#recurring-issues}

Create or open an issue that remains useful each time, such as a periodic dependency check. Set a due date, then choose a daily, weekly, monthly or yearly recurrence in the issue’s date control. A recurrence without a due date is rejected. Review the properties and assignee before saving. Project recurrence settings list active series; use them to change the cadence or stop repetition.

Recurring issues recreate themselves after the issue is done; the next issue is created in the backlog. Check the next issue's identifier and properties after completing a recurrence.

The next due date comes from the previous due date plus one cadence, not from the day you completed the task. The successor copies title, description, priority, effort, assignee, objective and categories. It does not copy the implementation plan, parent relationship, resources or comments. Recurrence moves to the successor; reopening and completing the old issue again does not create another occurrence. If successor creation fails, the series stops rather than repeatedly retrying on the completed issue. Inspect the result and configure recurrence on the appropriate next task after resolving the failure. Do not assume that a calendar schedule runs code or completes the new issue for you.


![Due-date picker in recurring mode with a weekly Sunday preview and optional time.](/documentation/en/issue-date-recurrence.png)

### Change or stop repetition {#recurrence-change}

Use the recurrence settings to edit or disable future repetition. Inspect already created issues separately: stopping future creation does not mean existing work has been completed or removed.

A Numo routine is a different object: it schedules a conversation and can use the owner's AI budget and configured providers. Choose recurring issues for a repeated tracked task and a routine for an instruction that should execute on a schedule. If the next issue is missing, check whether the previous issue was marked done, whether recurrence remains enabled and whether you are viewing the backlog without restrictive filters.

## Update several issues together {#bulk-issue-actions}

On a board, hold Shift and click each issue card to toggle its selection. With a mouse, you can also drag a selection rectangle from empty board space; Shift, Command or Ctrl makes that gesture additive. The rectangle gesture is not a touch-screen selection mode. Check the selected count and visible identifiers before opening the bulk actions. Selection is a working set for the action, not a saved view and not a permission grant. Open them with **Actions** on the selection bar, or press Command+K on macOS or Ctrl+K on Windows/Linux while issues are selected.

Choose Actions in the floating selection bar to open the command palette. Choose status, priority, effort or assignee, set the value and confirm the inline form. The objective action appears only for a selection in one project with available objectives. Other actions, such as adding to or removing from a cycle, linking two issues or sending the selection to Numo, appear when the current board supports them. Inspect the affected issues afterward. On a touch-only device without a supported multi-selection gesture, edit each issue through its detail panel.

### Partial results and destructive actions {#bulk-results}

When working across projects, verify membership in every affected project. Read any partial failure result: successful changes may already be saved even if another issue was rejected. Inspect the result before retrying the entire selection.

Deletion affects every selected item, so confirm the set before proceeding. **Move issues to trash** asks for confirmation; the issues, with their comments, files and links, can be restored from the [trash](/docs/trash-and-recovery) for 30 days. Clear selection after the operation when you are moving to unrelated work. If filters change as a result of your update, issues can leave the displayed view while remaining in the project. Search identifiers to verify the new state instead of recreating them.

## Import a CSV backlog after checking its mapping {#import-issues}

The project owner opens Import in project settings and selects a CSV export. Linear and Jira layouts are detected; other CSVs use generic mapping. The limit is 5 MiB and 5,000 issues per import. Split a larger export deliberately and keep parent references within the same batch where possible.

Map the title column before importing. Review description, status, priority, effort, due date, categories and assignees. Map people to actual project members and inspect new categories. Parent references match external keys in the batch and support one level. CSV files do not import attached file bytes.

An AI proposal is requested only for mapping gaps. It is editable and a failed or unavailable provider leaves manual mapping usable. A manual correction prevents a late proposal from overwriting your choices.

### Commit and inspect {#result}

Read the issue counts, status distribution and warnings after each mapping change. Correct skipped or invalid rows before committing. Import creates new issues; do not assume reuploading is a deduplicating update. After success, inspect representative issues, assignments, dates and parent links. If the response is lost, inspect the project before retrying the whole file to avoid duplicate work.

![CSV preview with two localized demonstration rows and detected column mappings.](/documentation/en/import-issues-preview-workflow.png)

## Export issues as CSV {#export-issues}

As a signed-in project member, open the command palette with Command+K on macOS or Ctrl+K elsewhere and search for “Export issues as CSV”. Choose that command, select one project or all accessible projects, and review the status checkboxes. The current project's page preselects that project. Done, canceled and duplicate issues are excluded by default; include them when you need the full history. At least one status must remain selected. Board filters and card selection do not define this export.

Choose Export and check the download confirmation and reported issue count. The UTF-8 CSV contains issue identifiers, titles, Markdown descriptions, statuses, priorities, effort, categories, assignees, objectives, project names, dates and parent identifiers. Access is restricted to your accessible projects. A header-only file can mean there are no matching accessible issues. Treat the downloaded descriptions and names as project data when sharing the file.

### Check completeness and re-import {#export-issues-limits}

The export is capped at 20,000 issues. A truncation warning means the file may be incomplete; narrow the project and status scope, export separate groups and compare counts. Retrying the same scope does not fetch a later page. If the download fails, check the error, your session and project access before retrying.

The format can be [imported into minddy](#import-issues), with the destination owner's permission and a review of field mapping. Import creates new issues; it does not restore the original identifiers or update existing issues. Keep parent rows in the same import batch. CSV is an issue-data format, not a backup of attached files, comments, account settings or credentials. For an account transfer, use the [instance-transfer guide](/docs/transfer-between-instances).
