# MIN-684 page promotion review

Date: 2026-10-20. Reviewer: agent:/root. This is an agent factual and
language review of the source on the same branch and its unit tests, not human
reader acceptance, a browser walkthrough or a deployed release test. No figure
was captured or recaptured. Application and desktop versions are unchanged
(0.11.1).

The audience is a project owner or Member who wants a page, or a database
entry, to become work in the tracker. The changed outcome is a **Promote to
issue** action that hands a whole page to Numo, which asks questions when
needed, creates one issue and attaches the page to it. The page is kept.

## Articles and workflows

In `en`, `fr`, `de`, `es`, `it` and `pt-BR`, one revision each:

- `pages` revision 13, new section `promote-page-to-issue` after
  `page-tree`. Workflow P01 (page tree and its menu) and P02 (the open page's
  document menu). It covers both page menus, the side-panel database entry,
  the reader restriction, AI usage, save-before-promote and its failure, Numo's
  questions, the single issue with the attached page, the retained page and a
  duplicate check after an uncertain result.
- `databases` revision 13, one paragraph in `entry-actions`. Workflow P09. It
  covers the single-entry handle menu, the absent action for a multi-row
  selection (no bulk promotion), the retained entry and a link to the pages
  section.

Localized UI labels come from `Pages.promoteToIssue` and `Pages.pageOptions`
in each catalog. The `de` and `pt-BR` sections use "Problem" and "problema",
matching the catalog label and the `issues` article title in those locales.
`content/knowledge/pages.md` gains one paragraph so Numo can answer questions
about the action. `coverage.json` is unchanged: the outcome falls within P01,
P02 and P09.

## Claims checked against the source

- Entry points: `usePageDocumentMenu` in
  `components/pages/page-document-actions.tsx` builds both the tree row menu
  (`components/pages/page-tree.tsx`, `…` button and right-click) and the open
  page's `…` menu (`components/pages/page-view.tsx`, labeled
  `Pages.pageOptions`), including a database entry opened in the side panel.
- Reader restriction: that hook returns only Copy for agent and Export when
  `canWrite` is false. The database handle menu in
  `components/pages/page-database-view.tsx` requires `canWrite` and
  `targets.length === 1`, so a multi-row selection has no promotion item.
- Save before promotion: `usePromotePage` in
  `components/pages/page-promotion-context.tsx` awaits every registered
  editor's `prepare` (the page's `flushBeforeNavigation`). A `false` result or
  a thrown error shows `Pages.saveFailed` and returns without opening Numo.
- Numo request: `openIntent` with the page's project, explicit page context
  and `Pages.promotePagePrompt`, which asks Numo to read the title, content and
  database properties, ask questions when the page or database scope is
  unclear, create one issue, attach the page and leave it in place. The
  assistant panel sends a prompt-bearing intent on opening
  (`components/assistant-panel.tsx`).
- Issue creation and attachment are performed by Numo following that request.
  They depend on the model and AI usage; this review did not run a live Numo
  conversation.

`components/pages/page-promotion-context.test.tsx` passes, 10 tests: explicit
context for an unopened page, saving only the targeted open page with its typed
title, waiting for a pending save, `saveFailed` on a failed or rejected save,
ignoring a second activation, forgetting an unmounted editor, untitled pages,
the menu item targeting its page and its absence for readers. The database
handle menu's single-row and reader conditions were checked by source reading
only.

## Figures

No figure shows the full page menu or the database handle menu.
`import-export-and-print-pages-steps` shows only the Export submenu and stays
accurate; `create-and-organize-pages-steps` shows the + creation menu. Figure
revision markers in both articles advance with the guides without new
captures. A capture of the page menu with **Promote to issue** could help
readers but needs a seeded project session, which this review did not run.

## Related article not changed

`task-notebook` (`promote-note`) says the reader reviews and sends Numo's
prepared request. The assistant panel sends a prompt-bearing intent
automatically, so that wording may predate the current behavior. It is outside
MIN-684 and is recorded here for a separate check rather than changed.

## Checks

`npm run check:documentation`, `npm run check:knowledge`,
`npm run check:owned-english` and `git diff --check`.
