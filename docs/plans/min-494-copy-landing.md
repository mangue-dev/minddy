# MIN-494 landing copy audit

## Scope

Reviewed all 272 `Landing` message keys, including the homepage hero, feature
cards and their expanded details, navigation, footer, FAQ, dictation demo,
screenshot descriptions, and legacy sections. Rewrote explanatory copy across
English, French, Spanish, German, Italian, and Brazilian Portuguese. Preserved
translation keys, interpolation arguments, sample people, and demonstration
inputs.

## Findings and changes

- The hero named internal concepts before explaining the product. It now
  introduces software project management, tasks, documentation, feedback,
  teamwork, and optional AI help.
- The feedback card claimed suggestions organized themselves and never entered
  the tracker. It now explains the public suggestion page, voting, team replies,
  and the decision to turn a request into a project task. Expanded details explain
  review assistance and status updates after linking a task.
- The board, notebook, project pages, cycles, and keyboard menu relied on product
  vocabulary or metaphors. Each now starts with what someone can do and why.
- Numo copy implied it had already read the board and required no further
  context. The revised text describes information it can consult and actions a
  user can request.
- The coding workflow promised that two sentences were always sufficient and
  assumed cloud execution. It now asks for the problem, expected result, and
  constraints, then describes planning, changes, checks, and human review without
  promising a particular execution environment.
- Voice copy claimed availability everywhere and a five-second success time.
  It now describes the supported task-creation flow, gives concrete examples,
  and uses actionable errors.
- The personal API key FAQ implied entirely uncapped agent runs. It now separates
  compatible provider calls from unselected or unsupported calls and cloud code
  execution, which remain part of Minddy usage.
- The team FAQ now matches the implemented limits: three guests per project
  on Free and unlimited guests on Go and Pro. The data FAQ now points to the
  existing account data controls for export and deletion.
- Navigation and footer labels now name destinations. For example, “The rest”
  becomes “Sharing and integrations”. German copy consistently uses informal
  address, matching the other marketing revisions.

## Evidence and verification

Checked rendering context in `components/marketing/hero.tsx`,
`section-workspace.tsx`, `section-agents.tsx`, `section-more.tsx`, and
`voice-demo.tsx`. Cross-checked the concepts against the maintained product
knowledge files for projects, productivity, pages, agents, feedback, import,
and billing. Feedback processing and status synchronization are implemented in
`lib/server/feedback/review.ts` and `lib/server/feedback/status-sync.ts`.

The parent audit also confirmed per-feature API key selection and provider/model
fallbacks in the AI runtime, and cloud execution accounting in server usage code.
The copy therefore avoids unlimited-run claims and does not imply that a provider
key covers every cost.

The generated patch validates that every changed key already exists and retains
its interpolation arguments. JSON catalogs are merged and repository checks run
by the coordinating task. No runtime behavior or visual components changed in
this subtask. The final patch contains 946 entries across six locales. Commercial limits were
checked against `lib/billing-plans.ts`, and account export/deletion against
`components/settings/account-data-section.tsx`. Clear labels, existing legal
commitments, proper names, and demonstration data were retained. The existing
privacy claim was not broadened or changed.
