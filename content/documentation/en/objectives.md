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
  "revision": 17,
  "sourceRevision": 17,
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
      "content/knowledge/core-tracker.md",
      "components/objective-dialog.tsx",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "lib/keyboard/shortcuts.ts"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
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
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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

Open the project's Objectives destination and create an objective. When you create it from elsewhere in the app, choose its project in **Create in**, at the top left of the form (next to the **New objective** title on a phone); changing it removes the lead and relations chosen for the previous project. On a computer, Command/Ctrl+Shift+P opens that menu, even while you type the name or description; once you choose a project or close the menu, the cursor returns exactly where it was. The pill shows this shortcut, which exists only when more than one project can be chosen; a phone shows no shortcut hint. Name the result you want, add useful context, and set its available lead, target date, color and status fields. The lead is the person responsible for the outcome; choosing a lead does not transfer project ownership. Only the owner or a Member can lead an objective, and a lead whose role changes to Reader is removed from it. An objective belongs to a project; it is distinct from a personal cycle spanning several projects.

The objective description and its comments use the same editor as project pages, without the block handles: type `/` to insert blocks and `@` to mention a person, issue, objective or page. The `@` menu also lists the resources attached to what you are writing: the issue or objective for its description and plan, a comment for its own files, or a creation dialog for the files added in it. A mention of a resource attached elsewhere shows as **Unavailable**. Several people can edit the description at once, with each person's caret shown with their name and color. Select text to format it or add a link. Paste or drop an image, or choose **Image** in the `/` menu, to insert it in the description.

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
