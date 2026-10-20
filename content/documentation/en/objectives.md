---
{
  "id": "objectives",
  "locale": "en",
  "title": "Objectives",
  "summary": "Define a project outcome, attach its work and interpret progress, dependencies and momentum.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10",
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 15,
  "sourceRevision": 15,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-693 project roles; MIN-728 one editor engine; MIN-736 closed columns hidden by default; MIN-741 creation dialogs; MIN-742 resources; MIN-749 relation shortcut R",
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
      "components/objective-dialog.tsx",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "content/documentation/reviews/min-671-objective-momentum-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md",
      "content/documentation/reviews/ui-refinements-2026-10-11.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "content/documentation/reviews/min-728-one-editor-engine.md",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/creation-project-select.tsx",
      "content/documentation/reviews/min-741-creation-dialogs.md",
      "lib/use-resource-mentions.ts",
      "content/documentation/reviews/min-742-resources.md",
      "lib/keyboard/shortcuts.ts"
    ]
  },
  "review": {
    "revision": 15,
    "fact": "agent:/root (MIN-671 target-date condition and retained calculation claims checked against source and render tests; earlier procedural evidence retained); agent:/root (MIN-670 source, en wording and new-control review; existing procedural evidence retained); agent:/root (UI refinements source and control review; unchanged procedural evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-728 one editor engine: source and unit-test review of the shared editor on this surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-736 objective board status filter: source review of the project page and objective header; no browser walkthrough, no new captures); agent:/root (MIN-741 creation dialogs: source and unit-test review of the Create in project control, the cleared lead and relations and the Create objective button; objectives-steps recaptured on 2026-10-19 in all six locales from the local candidate (documentation-product screen reader-objectives) and inspected; no other browser walkthrough); agent:/root (MIN-742 resources: source and unit-test review of resource mentions scoped to their surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-749 relation shortcut R: source and unit-test review of components/issue-field-shortcuts.tsx, the board card, issue panel, objective page and new-issue dialog relation pickers and lib/keyboard/shortcuts.ts; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (en changed-passage review against English revision 7; earlier unchanged prose reviews retained); agent:/root (MIN-670 source, en wording and new-control review; existing procedural evidence retained); agent:/root (en changed-passage parity and localized-label review); agent:/root (en MIN-693 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (en editorial review of the MIN-728 passage); agent:/root (en MIN-736 added sentence with catalog status labels; agent review, not human acceptance); agent:/root (en MIN-741 Create in passages and figure alt text with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-742 added sentence with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-749 added sentences; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "issues",
    "personal-cycle",
    "personal-statistics"
  ],
  "aliases": [
    "objective-dependencies-and-momentum"
  ],
  "tags": [
    "Track an outcome with an objective",
    "Interpret objective dependencies and momentum"
  ],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/en/reader-objectives.png",
      "alt": "Unsubmitted objective-creation dialog in the Aurora project with a demonstration result name and the Create objective button.",
      "caption": "Name the result before choosing the lead, target date and status. This dialog has not created a second objective.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        720,
        358
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

An objective groups a project’s issues around an outcome. Create it and attach the relevant work, then inspect progress, blocking dependencies and momentum before adjusting the target or closing the objective.

## Track an outcome with an objective {#objectives}

Open the project's Objectives destination and create an objective. When you create it from elsewhere in the app, choose its project in **Create in**, at the top left of the form (next to the **New objective** title on a phone); changing it removes the lead and relations chosen for the previous project. Name the result you want, add useful context, and set its available lead, target date, color and status fields. The lead is the person responsible for the outcome; choosing a lead does not transfer project ownership. Only the owner or a Member can lead an objective, and a lead whose role changes to Reader is removed from it. An objective belongs to a project; it is distinct from a personal cycle spanning several projects.

The objective description and its comments use the same editor as project pages, without the block handles: type `/` to insert blocks and `@` to mention a person, issue, objective or page. The `@` menu also lists the resources attached to what you are writing: the issue or objective for its description and plan, a comment for its own files, or a creation dialog for the files added in it. A mention of a resource attached elsewhere shows as **Unavailable**. Several people can edit the description at once, with each person's caret shown with their name and color. Select text to format it or add a link, and paste or drop an image to insert it in the description.

Open each relevant issue and choose the objective in its properties, or use the objective's issue controls. Check that the intended work appears under the objective. Use its discussion and resources for decisions and reference pages that apply to the whole outcome.

![Unsubmitted objective-creation dialog in the Aurora project with a demonstration result name and the Create objective button.](/documentation/en/reader-objectives.png)

### Read progress before closing {#objective-progress}

Review completed and active issues alongside the objective's progress. A progress indicator summarizes attached work; it cannot determine whether a product outcome is acceptable. Inspect missing tasks and canceled or duplicate work before marking the objective complete. The objective's board shows open work first: select **Done** and **Canceled** in its **Status** filter to review closed issues there.

Use the objective lifecycle to distinguish planned, underway, completed and canceled outcomes. A target date is a goal, while a forecast is an estimate based on activity. If the objective appears empty, check issue membership and view filters instead of recreating it. Deleting an objective uses the recoverable trash workflow rather than being an ordinary status change.

## Interpret objective dependencies and momentum {#objective-dependencies-and-momentum}

Open the objective and its relations. On the objective page, R opens the relation type choice outside a text field. Check which outcome depends on another and read blocking issue relationships where they explain the constraint. Parent-child organization, a related link and a blocking dependency answer different questions; inspect the direction before changing a relation.

A blocking relation may connect an issue or another objective to this objective, within the same project. Its open member issues inherit the unresolved blocker: the displayed relation identifies both the actual prerequisite and the objective passing it on. This is not a new direct relation stored on every issue. Closing the blocker or the blocked objective, or removing an issue from that objective, removes the corresponding inherited blockage. Resolve the actual prerequisite or correct an obsolete relation. Merely changing an objective's target date does not complete its blocking issues.

### Interpret the momentum signal {#momentum}

The Momentum panel appears only when the objective has a target date. Removing that date hides the panel, including its history, pace statistics and estimated finish date. Add a target date to show it again; the overall progress indicator remains available without one.

Momentum summarizes recently completed work. It can be accelerating, steady, slowing or stalled, with separate states for not-started, complete and canceled objectives. Use it to identify an outcome needing attention, then read the underlying issues and activity.

An estimated finish date requires at least two completions, a full observed week, positive delivered effort and remaining work. Only currently linked issues contribute; completions before objective creation do not count as recent momentum.

- With a valid target, history spans creation to that date. Throughput uses observed time since creation, including time after a missed target.
- If a target date is set but does not define a valid period after creation, the calculation uses a rolling eight-week history and a 28-day forecast window.

Sparse history or a recent scope change makes the estimate less useful. It is not a promised deadline and excludes work you have not attached. Compare the target date, remaining work and actual constraints before changing commitments.


## Choose an objective for feedback {#objective-feedback}

In the objective properties, the feedback count opens the project’s Feedback destination filtered to this objective, including resolved requests. A zero count is also shown. Requests remain separate from issue progress and momentum.

Feedback can also belong to an objective without becoming an issue. In the project’s Feedback destination, choose the objective in a request’s properties. These requests do not contribute to issue progress or momentum. When promoted, the new issue inherits the selected objective and feedback categories, subject to changes in the creation form.
