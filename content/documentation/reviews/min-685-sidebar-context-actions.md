# Sidebar context menu review (MIN-685)

Date: 2026-10-17. Reviewer: `agent:/root`. This is an agent source, unit-test
and localized-passage review, not human reader acceptance, a browser
walkthrough or a deployed release test. Application and desktop versions are
unchanged (0.11.1).

## Scope and sources

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `navigation`, revision 7, workflows `S04` and `W15`: new section
  `sidebar-menus` ("Act from a sidebar row").
- `projects`, revision 7 (`de` and `es` revision 8, source revision 7),
  workflows `S05` and `S06`: one paragraph in `project-removal`.
- `scheduled-routines`, revision 8, workflow `N06`: one paragraph in `runs`.
- `code-work`, revision 10, workflows `N03` and `N04`: one paragraph in
  `decision`.

Right-clicking a sidebar row previously offered only the navigation entries
(open in a new tab, copy the link). The reviewed change adds actions on the
object the row represents. Sources checked against the added passages:

- `lib/sidebar-context-actions.ts` orders object actions first, then the shared
  navigation entries, then destructive actions behind a separator.
- `components/secondary-sidebar.tsx` resolves the row under the pointer and
  composes its menu; the navigation entries keep the `CommandPaletteActions`
  labels from `components/navigation-context-actions.tsx`.
- `components/project-context-actions.tsx` builds the project menu (a **New**
  submenu with issue, objective and page creation in the right-clicked project,
  project settings, and **Move to trash** only when the viewer owns the project)
  and the tab entries (Issues, Objectives, Pages, Feedback). Every action is
  bound to the project passed in, not to the current route.
- `components/projects/project-trash-dialog.tsx` is the confirmation shared by
  the project settings and the sidebar. It moves the project to the trash with
  the existing retention period; no permanent deletion was added.
- `components/feedback/feedback-team-page.tsx` opens the internal feedback
  composer once when the active route carries `?new=1`.
- `components/routines/routines-panel.tsx` builds the routine row menu:
  **Open latest run** (disabled without a previous run), and, for
  the project owner only, **Run now**, **Pause** or **Resume** (Resume disabled
  when the scheduler is not configured), **Edit** and **Move to trash**.
- `components/app-shell-chrome.tsx` gives the **All issues** row **New issue**
  and the **Routines** row **New routine** (shown when the viewer owns a
  project). The latter opens `/routines?new=1`, whose page opens the wizard
  once, or explains why no routine can be created there.
- `components/routines/use-routine-actions.tsx` shares the switch, run and trash
  mutations and their confirmation with the routine pane.
- `components/pull-requests/pr-context-actions.tsx` and `lib/pr-context-menu.ts`
  derive the state changes from the current state (open: draft or close; draft:
  ready for review or close; closed: reopen; merged: none), each confirmed;
  offer **Merge** only for an open, non-draft pull request whose readiness
  allows merging, handing over to the detail's merge confirmation; and offer
  **Copy fix prompt** and **Fix with Numo** on a failed check, an unresolved
  review thread, or a conflicting or out-of-date branch. Forge writes are hidden
  when the loaded read denies write access and disabled until the menu has
  re-read the pull request. The server checks permissions and mergeability again.

The focused unit suites `lib/sidebar-context-actions.test.ts`,
`lib/pr-context-menu.test.ts`, `components/project-context-actions.test.tsx`,
`components/routines/use-routine-actions.test.tsx` and
`components/pull-requests/pr-context-actions.test.tsx` passed locally
(5 files, 24 tests) on 2026-10-17.

Not written: long-press or other touch behavior on mobile. The articles only
describe right-clicking a row in the sidebar.

## Related articles

`objectives`, `pages` and `feedback` were read. Their own creation procedures
remain accurate, and none of them describes the sidebar menu or claims that it
offers only navigation entries. The new tab entries are documented in
`navigation#sidebar-menus`. `content/knowledge/` contains no description of
sidebar context menus, so no knowledge file changed.

## Figures

No figure changed. The existing figures (`navigation-steps` and
`search-and-shortcuts-steps` in `navigation`, `project-settings-steps` and
`project-members-steps` in `projects`, `scheduled-routines-workflow`,
`review-pull-requests-workflow`) do not depict the sidebar menus and remain
accurate; their original capture evidence is retained. Figure revisions follow
the article revisions. No new screenshot was captured and no browser walkthrough
was performed.

## Language and verification

The added passages were translated from the English source in all six locales
using each catalog's UI labels (`Nav`, `Pages`, `FeedbackBoard`, `Common`,
`Routines`, `PullRequests`, `CommandPaletteActions`). Some Italian catalog
labels read unidiomatically (for example `Routines.runNow`, `Common.moveToTrash`
and `FeedbackBoard.newFeedback`); the article quotes them as shown in the
interface. These are agent self-reviews under the documentation contract, not
human approvals. Section IDs and links resolve in every locale. Final check
results: `check:documentation`, `check:knowledge`, `check:owned-english` and
`git diff --check`.
