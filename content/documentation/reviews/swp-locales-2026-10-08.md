# S/W/P documentation language and source review

Reviewer: Codex agent `review_documentation_locales`, 2026-10-08.
This is an agent review authorized by the owner, not human acceptance.
The owner offered a later French reread. English and French authoring belongs
to the main agent; this lot owns German, Spanish, Italian, and Brazilian
Portuguese counterparts of the 37 retained S/W/P articles.

## Review method

Compare each translation with the English source revision, section by section.
Preserve ordered actions, prerequisites, permissions, results, options, limits,
warnings, availability, executable syntax, IDs, and links. Translate titles,
summaries, topic labels, meaningful example data, and body prose without
reducing a procedure to a summary. Quote the actual localized control label
when naming a control. Keep articles in draft where behavior, required figures,
or release evidence remain incomplete.

Source inspection supports factual review but does not prove a procedure worked
in the shipped interface. UI captures, representative-reader sessions, and
operational rehearsals require separate actual evidence.

## Completed reviews

### S07: choose-an-instance, source revision 1

Compared the existing `de`, `es`, `it`, and `pt-BR` variants with the complete
English source. All four retain the operating-model choice, separate-instance
account boundary, infrastructure and provider costs, backup/key duties,
support limitation, required Supabase components, unsupported deployment
variants, optional-provider conditions, relay opt-in and opt-out, license,
naming policy, and account-transfer credential/subscription exclusions. All
four preserve the four semantic section IDs and localized figure reference,
caption, and alternative text. No translation abridgement was found.

Examined `docs/editions.md`, `docs/self-hosting-distribution.md`,
`content/knowledge/open-source.md`, and the account-data section of
`content/knowledge/settings-and-data.md` for those claims. These sources support
the written distinction. This is a checkout source review, not a Cloud
deployment observation, tagged-release test, or installation rehearsal.

The article's `draft` state, unset factual approval, and unreviewed required
diagram remain appropriate. Existing six-language text does not by itself
establish that its responsibility diagram is legible or that its installation
and transfer instructions lead to completed outcomes.

## Source and glossary observations

The existing application catalogs include awkward translated status labels,
including Italian `Status.todo`, Spanish `Status.duplicate`, and Brazilian
Portuguese `Status.in_review`. Documentation must preserve those literal UI
labels when instructing readers to select them, while explaining their meaning
in natural prose. This lot does not edit unrelated legacy application strings.

Independent preparation inspected database types/limits in
`lib/page-databases.ts`, attachment checks in `lib/server/page-files.ts`,
database-import checks in `lib/server/database-import.ts`, and trash
authorization in `lib/server/trash.ts`. The detailed article reviews below must
still connect those sources to the actual written claims as English batches
arrive.

## Completed source and language lot

All 37 retained S/W/P IDs now have complete German, Spanish, Italian, and
Brazilian Portuguese counterparts of English source revision 1. This is 144
new translations plus four existing S07 variants reviewed in full. The agent
compared each procedure and caveat, not only metadata or section counts.
Titles, summaries, reader-facing topic names and complete bodies are localized;
semantic section IDs are unchanged. Each translation retains draft status and
separately recorded source factual review after subsequent corrections. Language-review metadata identifies this
agent explicitly. French authoring and any later owner reread are separate.

### Factual defects corrected during review

- S02: signup is a three-step email → identity → password wizard; only the
  final step submits account creation. The name must be nonblank, the email
  must pass the displayed syntax check, and the repeated password must satisfy
  the eight-character / ASCII lowercase / ASCII uppercase / digit policy.
  Checked `lib/signup-wizard.ts`, `lib/password-policy.ts` and the signup UI;
  complete translations now preserve the steps and validation.
- S03: a recovery code disables MFA, rather than merely bypassing one challenge.
  The recovery UI and `components/auth/mfa-challenge.tsx` support this consequence.
  The procedure now tells readers to configure MFA again after regaining access.
  The main agent incorporated the finding in English and French before the
  four complete translations were finalized.
- W09: recurring issues start from an issue's date control and need a due date.
  Daily, weekly, monthly and yearly intervals are supported. Project recurrence
  settings manage or stop an existing recurrence; they are not the initial
  template-creation control. Checked `components/settings/project-recurrences-section.tsx`
  and `lib/recurrence.ts`; English and French were corrected.
- W10: the objective's `lead_user_id` is its responsible person; changing it does
  not transfer project ownership. Checked `components/objective-dialog.tsx`;
  English and French now describe responsibility rather than an owner transfer.
- W19: trash retention is 30 days. Restoring or permanently deleting projects
  and routines is restricted to their owner. Other supported project objects
  follow the relevant project membership check. Checked `lib/trash-retention.ts`
  and `lib/server/trash.ts`; English and French were corrected before translation.
- P07: `components/pages/page-document-actions.tsx` has export/print actions and
  no generic page import action. The guide now gives document menu → Export,
  Markdown page/branch, PDF print view and browser print controls, or a database
  archive. Supported imports start from an empty database (P11). English and
  French were corrected before complete translation.

These are verified checkout facts. They do not establish that an authenticated
reader completed the procedures in the candidate application or Cloud.

### Review register

Each row below was translated and reviewed against the complete English body.
The evidence column records the article's checkout references, not a claim that
all environments or platforms were executed. All four locale variants preserve
the actions, conditions, warnings, and outcomes of that source body.

| Workflow | Article | Stable sections | Checkout evidence |
| --- | --- | --- | --- |
| S01 | `first-project` | `first-project`, `first-use-recovery` | `content/knowledge/core-tracker.md`, `components/sidebar-onboarding.tsx`, `app/(app)/home/page.tsx` |
| S02 | `account-access` | `account-access`, `session-and-mail` | `app/(auth)/signup/page.tsx`, `app/(auth)/login/page.tsx`, `app/auth/confirm/page.tsx` |
| S03 | `account-recovery` | `account-recovery`, `mfa-recovery` | `app/(auth)/reset-password/page.tsx`, `components/settings/account-security-section.tsx`, `docs/self-hosting-auth.md` |
| S04 | `navigation` | `navigation`, `panels`, `tabs` | `components/app-sidebar.tsx`, `components/secondary-sidebar.tsx`, `content/knowledge/agents-and-mcp.md`, `content/knowledge/productivity.md` |
| S05 | `project-settings` | `project-settings`, `project-removal` | `content/knowledge/settings-and-data.md`, `components/settings/project-general-section.tsx` |
| S06 | `project-members` | `project-members`, `member-permissions`, `invitation-recovery` | `components/inbox-content.tsx`, `components/home/onboarding-join-dialog.tsx`, `content/knowledge/settings-and-data.md` |
| S07 | `choose-an-instance` | `choose-an-instance`, `responsibilities`, `services`, `next-step` | `docs/editions.md`, `content/knowledge/open-source.md`, `docs/self-hosting-distribution.md` |
| W01 | `create-an-issue` | `create-an-issue`, `issue-save` | `content/knowledge/core-tracker.md`, `components/create-issue-dialog.tsx`, `components/issue-fields.tsx` |
| W02 | `issue-statuses` | `issue-statuses`, `closed-work` | `content/knowledge/core-tracker.md`, `components/kanban-board.tsx`, `components/issue-context-menu.tsx` |
| W03 | `triage-incoming-work` | `triage-incoming-work`, `triage-order` | `app/(app)/projects/[id]/triage/page.tsx`, `components/triage/triage-page.tsx`, `lib/smart-triage.ts` |
| W04 | `bulk-issue-actions` | `bulk-issue-actions`, `bulk-results` | `components/bulk-issue-actions.tsx`, `components/global-board.tsx` |
| W05 | `issue-dependencies` | `issue-dependencies`, `blocker-state` | `content/knowledge/core-tracker.md`, `components/issue-side-panel.tsx`, `components/issue-indicators.tsx`, `captures/shots/relations/intent.md` |
| W06 | `sub-issues` | `sub-issues`, `change-parent` | `components/issue-parent-menu.tsx`, `components/issue-family-banner.tsx` |
| W07 | `implementation-plans` | `implementation-plans`, `plan-progress` | `content/knowledge/plans-and-agents.md`, `components/issue-plan.tsx`, `captures/shots/issue-plan/intent.md` |
| W08 | `issue-discussion-and-resources` | `issue-discussion-and-resources`, `resource-access` | `components/issue-timeline.tsx`, `components/issue-resources-section.tsx`, `content/knowledge/core-tracker.md` |
| W09 | `recurring-issues` | `recurring-issues`, `recurrence-change` | `components/settings/project-recurrences-section.tsx`, `content/knowledge/core-tracker.md` |
| W10 | `objectives` | `objectives`, `objective-progress` | `content/knowledge/core-tracker.md`, `components/objective-dialog.tsx`, `components/objective-detail.tsx` |
| W11 | `objective-dependencies-and-momentum` | `objective-dependencies-and-momentum`, `momentum` | `components/objective-relations-section.tsx`, `components/objective-momentum.tsx`, `content/knowledge/core-tracker.md` |
| W12 | `personal-cycle` | `personal-cycle`, `cycle-results` | `content/knowledge/productivity.md`, `components/cycle/cycle-header.tsx`, `components/settings/account-cycles-section.tsx` |
| W13 | `views-and-filters` | `views-and-filters`, `view-recovery` | `content/knowledge/productivity.md`, `components/board-toolbar.tsx`, `components/sidebar-filter-field.tsx`, `app/api/me/saved-views/route.ts` |
| W14 | `share-a-view` | `share-a-view`, `revoke-view` | `app/api/views/[id]/share/route.ts`, `app/share/[token]/page.tsx`, `content/knowledge/feedback.md` |
| W15 | `search-and-shortcuts` | `search-and-shortcuts`, `shortcut-alternatives` | `components/command-palette.tsx`, `components/keyboard-cheatsheet.tsx`, `components/issue-field-shortcuts.tsx` |
| W16 | `notifications-and-inbox` | `notifications-and-inbox`, `notification-preferences` | `content/knowledge/productivity.md`, `components/inbox-popover.tsx`, `components/inbox-content.tsx`, `components/settings/account-notifications-section.tsx` |
| W17 | `task-notebook` | `task-notebook`, `promote-note` | `content/knowledge/productivity.md`, `components/scratchpad/scratchpad-modal.tsx`, `components/scratchpad/start-tasks.ts` |
| W18 | `personal-statistics` | `personal-statistics`, `statistics-limits` | `app/(app)/statistics/page.tsx`, `components/stats/effort-durations.tsx`, `content/knowledge/productivity.md` |
| W19 | `trash-and-recovery` | `trash-and-recovery`, `permanent-removal` | `app/(app)/trash/page.tsx`, `content/knowledge/productivity.md` |
| P01 | `create-and-organize-pages` | `create-and-organize-pages`, `page-tree` | `content/knowledge/pages.md`, `components/pages/page-create-menu.tsx`, `components/pages/page-tree.tsx` |
| P02 | `page-editor` | `page-editor`, `editor-save` | `components/pages/page-editor.tsx`, `components/pages/page-slash-command.tsx`, `content/knowledge/pages.md` |
| P03 | `page-comments-and-collaboration` | `page-comments-and-collaboration`, `page-conflict` | `components/pages/page-comment-popover.tsx`, `components/pages/page-presence.tsx`, `components/pages/page-conflict-banner.tsx` |
| P04 | `page-files` | `page-files`, `file-access` | `components/pages/page-uploads.tsx`, `lib/server/page-files.ts`, `content/knowledge/pages.md` |
| P05 | `page-history` | `page-history`, `restore-page-version` | `components/pages/page-history.tsx`, `lib/server/page-versions.ts` |
| P06 | `publish-a-page` | `publish-a-page`, `revoke-page` | `components/pages/page-publish-dialog.tsx`, `lib/server/page-publication.ts`, `app/p/[token]/page.tsx` |
| P07 | `import-export-and-print-pages` | `import-export-and-print-pages`, `export-fidelity` | `components/pages/page-document-actions.tsx`, `lib/server/pages-export.ts`, `components/pages/page-print-view.tsx` |
| P08 | `create-a-database` | `create-a-database`, `database-types` | `content/knowledge/pages.md`, `components/pages/database-setup-banner.tsx`, `components/pages/database-property-dialogs.tsx` |
| P09 | `database-cells-and-entries` | `database-cells-and-entries`, `entry-actions`, `database-display` | `components/pages/page-database-view.tsx`, `components/pages/database-cell-editor.tsx`, `content/knowledge/pages.md` |
| P10 | `change-a-database-schema` | `change-a-database-schema`, `convert-column` | `components/pages/database-property-dialogs.tsx`, `components/pages/database-column-name.tsx`, `content/knowledge/pages.md` |
| P11 | `import-a-database` | `import-a-database`, `database-import-result` | `components/pages/database-import-dialog.tsx`, `lib/server/database-import.ts`, `content/knowledge/pages.md` |

### Remaining publication evidence

The candidate version is `0.11.1 candidate (89ebb59a5)`, not an identified
Minddy Cloud deployment. All 36 newly authored articles still need the required
`<article-id>-steps` instructional figure and actual behavior evidence. S07
still needs responsibility-diagram approval. W11 also requires the localized
explanatory diagram retained in the approved coverage matrix. Neither source
inspection nor complete translations removes those requirements. Captures and
an agent walkthrough can establish only the specific observed states; a later
French owner reread must be recorded only after it occurs.

### Verification

A deterministic comparison found 37 IDs and 148 locale variants, with identical
ordered semantic section IDs, source revision 1, draft status, and source factual
review distinct from runtime acceptance. This is structural validation in addition to the agent's editorial
comparison; it is not a linguistic quality score or operational acceptance.

## Subsequent source corrections, reviewed 2026-10-08

The four locale variants were updated from the current English source after
these concrete factual corrections, preserving every semantic section:

- S01: six-step project wizard, two-to-five-letter key, default icon and no
  repository in the manual example, optional brief, and final automatic
  assignment decision before Finish.
- W03: Accept moves an issue to backlog; Decline moves it to canceled; marking
  duplicate selects the canonical issue. Moving to the next card does not
  imply another issue was resolved. Spanish and Italian action labels match
  the corrected application catalogs.
- W04: Shift-click and mouse marquee selection, additive selection modifiers,
  available bulk properties, and the single-project/objective conditions;
  touch users edit individual issues.
- W07: all four Markdown checkbox states, canceled-task denominator exclusion
  and the recognized Questions heading.
- W12: one-time auto-fill, one/two-week durations, start day, one-to-four future
  cycles, intensity, automatic capture, manual-add assignment to the cycle
  owner, ineligible statuses and rollover that preserves the assignee.
- W14: project-member sharing permission, own personal views, unshareable
  global views, password minimum, read-only anonymous access and revocation.
- W17: promotion opens Numo with task/subtasks and current project context;
  it needs available AI usage or a compatible personal key and creates
  nothing merely by opening the composer.
- W18: configured statistics sections have no date-range filter; units,
  periods and read-only Numo budget/statistics access remain explicit.

These are source/language corrections, not proof of completed saves, issue
creation, AI execution, sharing or cycle rollover in the running product.

## Final source/language metadata recorded for this lot

`swp-reviewed-bodies-2026-10-08.json` records the complete reviewed bodies and
source hashes for all 148 German, Spanish, Italian and Brazilian Portuguese
variants. Metadata now names this agent for factual source comparison and
complete language review after the listed corrections. These reviews use
checkout source inspection and peer-verified English facts; they do not claim
that every external service or end-to-end procedure ran successfully. Articles
remain draft while missing figures and actual acceptance evidence are resolved.

`swp-figure-visual-review-2026-10-08.json` records individual actual inspection
and localized captions for the figures attached so far. S07 diagram approval
was completed separately by the main agent. Figure approval and source review
do not by themselves close the release acceptance checklist.
