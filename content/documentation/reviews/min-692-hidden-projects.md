# Hidden projects review (MIN-692)

Date: 2026-10-17. Reviewer: `agent:/root`. This is an agent source, route-test,
unit-test and localized-passage review, not human reader acceptance, a browser
walkthrough or a deployed release test. Application and desktop versions are
unchanged (0.11.1).

## Scope and sources

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `projects`, revision 8 (`de` and `es` revision 9, source revision 8),
  workflows `S05` and `S06`: new section `hide-project` ("Hide a project for
  yourself") and one changed sentence in `project-settings`.
- `navigation`, revision 8, workflows `S04` and `W15`: one sentence added to
  the project bullet of `sidebar-menus`.

Hiding a project is a personal navigation preference. Sources checked against
the added passages:

- `supabase/migrations/20270109200050_hidden_projects.sql` stores one row per
  user and project. RLS limits reads and deletes to the row's user; inserts
  also require `can_access_project`. Rows cascade with the account and project.
- `lib/server/hidden-projects.ts` and `app/api/account/hidden-projects/` list,
  hide and show for the authenticated caller only. Hiding requires a live
  project the caller can read; both directions are idempotent.
- `lib/use-hidden-projects.ts` is the single client preference shared by the
  sidebar menu, the project settings and the account section. Changes apply
  at once, are rolled back with an error toast when the save fails, and a
  failed read hides nothing.
- `components/app-shell-chrome.tsx` leaves hidden projects out of the home
  panel's project list. The project switchers keep only the project on screen;
  leaving it does not bring it back. `components/home/home-project-signals.tsx`
  leaves them out of the home triage signals.
- `components/project-context-actions.tsx` adds **Hide project** or **Show
  project** to every member's project menu, without destructive styling.
- `components/settings/project-visibility-section.tsx` renders **Visibility
  for you** in the General tab for owners and members, apart from Leave and the
  danger zone. `components/settings/account-hidden-projects-section.tsx`
  renders **Hidden projects** in Account settings → Preferences with **Open**
  and **Show**.

Not changed by hiding: project access, membership, content, routines,
integrations, notifications and the command palette's project search.

## Figures

`project-settings-steps` (`project-general.png`) was not recaptured. It still
shows the identity fields and the separate trash action that its caption
describes; it does not show the new **Visibility for you** group. The
`navigation` figures do not show a project context menu and remain accurate.
A recapture of the General tab in all six locales remains open.

## Checks

`lib/server/hidden-projects-route.test.ts`, `lib/use-hidden-projects.test.tsx`,
`components/project-context-actions.test.tsx` and `lib/i18n-contract.test.ts`
passed, with the documentation, knowledge, owned-English and encryption checks
listed in the pull request.

The migration and the RLS scenario of `supabase/tests/hidden_projects.test.sql`
(plus UPDATE and anon refusals) were run against the linked database on
2026-10-17 inside a single statement that always raises, so everything rolled
back; a follow-up query confirmed that neither the table nor the fixture users
remained. All eleven checks passed. The migration itself was not applied.
