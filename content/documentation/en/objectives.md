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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 development (MIN-671)",
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
      "content/documentation/reviews/min-671-objective-momentum-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root (MIN-671 target-date condition and retained calculation claims checked against source and render tests; earlier procedural evidence retained)",
    "language": "agent:/root (en changed-passage review against English revision 7; earlier unchanged prose reviews retained)",
    "date": "2026-10-10"
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
      "alt": "Unsubmitted objective-creation dialog with a demonstration result name.",
      "caption": "Name the result before choosing the lead, target date and status. This dialog has not created a second objective.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        330
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

Open the project's Objectives destination and create an objective. Name the result you want, add useful context, and set its available lead, target date, color and status fields. The lead is the person responsible for the outcome; choosing a lead does not transfer project ownership. An objective belongs to a project; it is distinct from a personal cycle spanning several projects.

Open each relevant issue and choose the objective in its properties, or use the objective's issue controls. Check that the intended work appears under the objective. Use its discussion and resources for decisions and reference pages that apply to the whole outcome.

![Unsubmitted objective-creation dialog with a demonstration result name.](/documentation/en/reader-objectives.png)

### Read progress before closing {#objective-progress}

Review completed and active issues alongside the objective's progress. A progress indicator summarizes attached work; it cannot determine whether a product outcome is acceptable. Inspect missing tasks and canceled or duplicate work before marking the objective complete.

Use the objective lifecycle to distinguish planned, underway, completed and canceled outcomes. A target date is a goal, while a forecast is an estimate based on activity. If the objective appears empty, check issue membership and view filters instead of recreating it. Deleting an objective uses the recoverable trash workflow rather than being an ordinary status change.

## Interpret objective dependencies and momentum {#objective-dependencies-and-momentum}

Open the objective and its relations. Check which outcome depends on another and read blocking issue relationships where they explain the constraint. Parent-child organization, a related link and a blocking dependency answer different questions; inspect the direction before changing a relation.

A blocking relation may connect an issue or another objective to this objective, within the same project. Its open member issues inherit the unresolved blocker: the displayed relation identifies both the actual prerequisite and the objective passing it on. This is not a new direct relation stored on every issue. Closing the blocker or the blocked objective, or removing an issue from that objective, removes the corresponding inherited blockage. Resolve the actual prerequisite or correct an obsolete relation. Merely changing an objective's target date does not complete its blocking issues.

### Interpret the momentum signal {#momentum}

The Momentum panel appears only when the objective has a target date. Removing that date hides the panel, including its history, pace statistics and estimated finish date. Add a target date to show it again; the overall progress indicator remains available without one.

Momentum summarizes recently completed work. It can be accelerating, steady, slowing or stalled, with separate states for not-started, complete and canceled objectives. Use it to identify an outcome needing attention, then read the underlying issues and activity.

An estimated finish date requires at least two completions, a full observed week, positive delivered effort and remaining work. Only currently linked issues contribute; completions before objective creation do not count as recent momentum.

- With a valid target, history spans creation to that date. Throughput uses observed time since creation, including time after a missed target.
- If a target date is set but does not define a valid period after creation, the calculation uses a rolling eight-week history and a 28-day forecast window.

Sparse history or a recent scope change makes the estimate less useful. It is not a promised deadline and excludes work you have not attached. Compare the target date, remaining work and actual constraints before changing commitments.
