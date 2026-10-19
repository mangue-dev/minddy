# Default status columns review (MIN-736)

Date: 2026-10-19. Reviewer: `agent:/root`. This is an agent source, unit-test
and localized-passage review, not human reader acceptance, a browser
walkthrough or a deployed release test. Application and desktop versions are
unchanged (0.11.1).

## Scope

A board view without a status filter of its own now shows only the Backlog,
Todo, In progress and In review columns. Done and Canceled come back by
selecting them in the board's Status filter; a view that stores a status
filter keeps it. Stored views are not rewritten. The objective, parent-issue
and cycle boards, which have no saved view, apply the same default through
their own Status filter, remembered per app tab; objective, issue-family and
cycle progress still count every issue.

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `views`, `views-and-filters`: one sentence on the default columns and how
  to show closed ones; the `view-recovery` step now selects Done and Canceled
  instead of relying on an unfiltered board.
- `issues`, `issue-statuses`: one sentence noting that boards hide Done and
  Canceled by default.
- `objectives`, `objective-progress`: one sentence on showing closed issues
  on the objective's board through its Status filter.

No figure changed: `work-view-filters` shows the filter menu closed on its
facets and no board columns.

## Sources checked

- `lib/view-filter.ts` (`DEFAULT_STATUS_FILTER`, `effectiveStatusFilter`,
  `filterIssues`, `visibleStatuses`, `normalizeConfig`, `activeFilterCount`).
- `components/board-toolbar.tsx` (Status filter rows and badge) and
  `components/status-filter-menu.tsx` (the standalone Status filter).
- Scoped boards: `components/objective-banner.tsx`,
  `components/issue-family-banner.tsx`, `lib/issue-family-board.ts`, the cycle
  mode of `components/global-board.tsx`.
- Readers: `app/(app)/projects/[id]/page.tsx`, `components/global-board.tsx`,
  `components/public-board.tsx`, `app/share/[token]/page.tsx`.
- Tests: `lib/view-filter.test.ts`, `lib/issue-family-board.test.ts`.
