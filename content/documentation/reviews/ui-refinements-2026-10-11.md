# UI refinements review

Date: 2026-10-11. Reviewer: Codex `agent:/root`. This records an agent source,
localized-passage and component review, not human acceptance or deployed testing.
No desktop version or database schema changes in this PR.

## Coverage

Affected articles: `feedback`, `objectives`, `issues`, `databases`, `navigation` in `en`, `fr`,
`de`, `es`, `it`, `pt-BR`. Updated workflows: `F03`, `F04`, `W10`, `W11`, issue
creation and triage, and `P08`, `P09`, `P10`. Internal knowledge: `feedback`,
`core-tracker`, `pages`, `desktop-and-speed`. Existing stable sections and procedures remain intact.

The linked-feedback list is replaced with a count and filtered destination.
All six guides remove the former inline-list instructions. Feedback filtering
uses existing feedback metadata; triage filtering uses existing issue metadata.
Database guides cover setup cards, first-option creation, horizontal column
reordering, empty-body placeholders and confirmation of duplicate/trash actions.
Issue guides cover saved-draft deletion confirmation, shared with objectives.
Navigation guides cover the Documentation command and mobile loading indicator.

## Source evidence

- `components/draft-recovery-row.tsx` is shared by issue and objective creation;
  deletion is deferred until confirmation and cancellation preserves the draft.
- `components/collection-filter-items.tsx`, `lib/collection-filters.ts` and
  `components/triage/triage-page.tsx` implement issue-property filtering.
- `components/feedback/feedback-property-filters.tsx`, `lib/feedback-list-filters.ts`,
  the team feedback route and `lib/server/feedback/team-queries.ts` filter existing
  properties before the 500-result limit. Category filtering preserves all category
  values of matching requests; optional objective and author filters support None.
  Author search uses the existing authorized feedback-user endpoint.
- `components/objective-feedback-section.tsx` and its team-only route obtain an
  exact canonical, non-trashed count without a capped content read; membership
  precedes the count. The link includes resolved requests by opening all statuses.
- `components/pages/page-database-view.tsx` calls `trashPage`, not `discardPage`.
  `lib/use-pages-query.ts`, `lib/pages-api.ts`, the page DELETE route and
  `lib/server/pages.ts` preserve the existing recursive soft-delete behavior.
  Custom column deletion remains a separate permanent operation.
- Database options, placeholders, property values and column drag controls are
  verified against their actual components and the existing revision-aware saves.

## Visual and language evidence

New figure: `database-setup-cards-preview`, six localized PNGs. Playwright rendered
`DatabaseSetupBanner` with the current project stylesheet and loaded Inter font,
in light mode at native device scale 2, with 24 CSS pixels of page padding and sRGB.
The source fixture isolates authentication, assistant requests and backend writes;
its captions and alternatives explicitly identify a component preview. The cards
show the new database's suggestions, not a completed import or Numo operation.
Existing figures depict unaffected pickers, entry examples, conversion warnings,
creation forms and moderation controls; their original capture evidence is retained.

Browser checks exercise the real database view and shared draft controls: normal
column click, movement activation, horizontal transform and persisted order,
cancel/confirm duplication, cancel-free mutation deferral for trash, first-option
creation, mobile property alignment with 44-pixel touch targets, draft cancellation
and confirmation, dismiss tooltip and exact count destination. A real shared shell
at 2560 × 1440 fills the viewport and retains viewport-based side-panel edges.
These checks use local demonstration fixtures and mocked writes, not a signed-in
end-to-end application or production data. The server tests separately cover the
filtering, authorization and count paths. New passages are reviewed for parity
against the English delta and their localized runtime controls in all six locales.

The captures and final check results are recorded in the pull request. Unchanged
article claims retain their previous reviews; no release-wide operational rerun or
production deployment is claimed.

## PR 408 follow-up

Feedback and triage use the board's shared property submenus, selection counts,
and toggle rows; mobile uses the same expandable sections. Author search remains
in its own submenu. The `feedback` guide (F03/F04) describes these controls in all
six locales. The `databases` guide (P10) and localized column hints document F8
for keyboard reordering while Enter and Space retain standard menu activation.
Existing figures do not show either changed control and remain accurate.

Category saves update every matching project cache, then refetch filtered lists
after success or failure, including an unmount flush. Server parameter parsing
deduplicates visibility choices before filtering and the 500-row cap. Regression
checks cover these cases and update the setup-banner and empty-page test fixtures
to match the intended behavior. No additional feedback properties were added.

Follow-up browser evidence uses the real shared filter components and database
view with mocked authors and writes in the local fixture. Light-mode captures
are `docs/reviews/pr-408-feedback-filters.png`,
`docs/reviews/pr-408-feedback-filters-mobile.png`, and
`docs/reviews/pr-408-triage-filters.png`. Browser assertions cover multiple choices,
counts, author search, mobile selection, standard Enter/Space activation and F8
reordering; the existing pointer, bulk-action and empty-option checks also pass.
Verification: failing CI shard 1/2 (5,415 tests), targeted regressions, board render,
typecheck, lint, documentation, knowledge, owned-English and encrypted-access
checks. These are component/agent checks, not signed-in production evidence.
