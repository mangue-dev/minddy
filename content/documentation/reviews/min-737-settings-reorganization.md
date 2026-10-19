# Account settings reorganization review (MIN-737)

Date: 2026-10-19. Reviewer: `agent:/root`. This is an agent source and
localized-passage review, not human reader acceptance, a browser walkthrough
or a deployed release test. Two figures were recaptured (see below).
Application and desktop versions are unchanged (0.11.1).

## Scope

Account settings (`/settings`) now has these tabs, in order: Profile,
Security, Preferences, Issues, Smart Fill, Cycles, Notifications (formerly
Inbox), AI & Numo (formerly AI), minddy MCP, Git and Privacy & data (formerly
Data).

- Profile shows the avatar, name and email, edited in place: the avatar opens
  a menu (new Lorelei avatar or upload), the name becomes a field on desktop
  (Enter or leaving it saves, Escape cancels) and opens a bottom sheet in the
  mobile layout; the email is read-only. The personal statistics follow: a strip of six figures
  (Completed, Tasks checked off, Created, Projects, Longest streak, Current
  streak) that replaces the former all-time totals, the 12-month headline and
  activity grid (cropped to the most recent weeks that fit, never scrolled),
  Where your work went and Work rhythm. On a phone the figure strip is a
  table with one row per figure. `/statistics` redirects
  to `/settings`, and the Statistics entry left the account menu.
- Preferences holds Appearance, Keyboard, Hidden projects and the Desktop app
  card, which shows the download link on the web and the server, preview
  channel and version in the desktop app.
- Issues holds the Assignment and Starting an issue cards; Smart Fill holds one
  card per option (Smart Fill, Issues to fill, Related issues, Issue indexing).
- AI & Numo holds the AI provider, MCP for Numo (formerly its own tab;
  `?tab=mcp-clients` links land here) and Issues Numo creates.
- The settings filter and the command palette (Command/Ctrl+K and the new-tab
  palette, Command/Ctrl+T) find settings cards and individual settings and
  open the right tab with the card or row highlighted.

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `personal-statistics`: entry point, figure strip and section names.
- `accounts`: in-place profile editing, Preferences contents, location of issue and
  Numo-status preferences, Privacy & data tab name.
- `issues`: Smart Fill switches by card.
- `code-work`: prompt auto-start switch under Issues, Starting an issue.
- `navigation`: Index issues location and settings search paragraph.
- `numo`: AI & Numo tab name and the MCP for Numo card.
- `minddy-mcp`: MCP for Numo card location.
- `transfer-between-instances`: Privacy & data tab name.
- `applications`: Desktop app card location and Notifications tab name.

## Figures

Recaptured on 2026-10-19 in `en`, `fr`, `de`, `es`, `it` and `pt-BR` with
`captures/shots/documentation-refresh/shot.mjs` against the local development
candidate (`http://localhost:3000`, working tree of this branch), demo account,
light theme, 2x density, 24 px padding. Business writes were blocked; nothing
was saved. Each image was opened and inspected. Records:
`content/documentation/reviews/visual-refresh-captures-2026-10-09.json`.

- `profile-and-preferences-workflow`: the profile header (avatar with its
  edit badge, name, read-only email), recaptured after the Edit profile
  dialog was replaced by in-place editing. Unsaved.
- `personal-statistics-steps`: now `personal-statistics-workflow.png`, the
  statistics block of the Profile tab. The demo account had no statistics
  history; with the user's approval, `captures/world/seed/018-statistiques.mjs`
  mirrored its existing history into the statistics ledger (30 issues it
  created, 6 completed issues assigned to it, at their real dates, with no
  copied text). Category names are the demo world's English categories in
  every locale.

Checked and kept: `numo-mcp-connections-workflow`,
`numo-mcp-connections-config-workflow`, `transfer-between-instances-workflow`
and `transfer-between-instances-export-workflow` crop a single card or dialog
and show no tab label, so the tab changes do not affect them.

## Sources checked

- `components/settings/account-settings-page.tsx` (tab order and contents),
  `lib/settings-sections.ts` (tab values, aliases and section catalog),
  `lib/settings-section-focus.ts`, `components/settings-shell.tsx`.
- `components/settings/account-profile-section.tsx`,
  `components/stats/profile-statistics.tsx`.
- `components/settings/account-issues-section.tsx`,
  `components/settings/account-smart-fill-section.tsx`,
  `components/settings/account-desktop-section.tsx`.
- Labels from the `Account`, `Profile`, `Stats` and `McpClients` namespaces of
  `messages/<locale>.json`.

## Second pass: project settings and Hidden projects

Date: 2026-10-19. Reviewer: `agent:/root`. Agent source and localized-passage
review only: no browser walkthrough, no new captures.

- Account settings: Hidden projects is now its own tab
  (`?tab=hidden-projects`, label `Account.hiddenProjectsTitle`); Preferences
  keeps Appearance, Keyboard and the Desktop app card.
- Project settings, General: an identity header like the account profile
  (centered icon, name and key, then the Members, Objectives, Categories and
  Created figures). The owner edits in place: the icon menu offers New orb
  (only without an image), Upload an image, Import from a website… and Remove
  the image (only with an image); the name and key become a field on a
  computer (Enter or leaving saves, Escape cancels) or open a sheet on a
  phone. There is no Save button; members and readers see the header
  read-only.
- Categories: one card, New category on its title line, color dot and
  in-place rename per row, delete with confirmation.
- Members: three cards, Invite by email, Members with its count, and Pending
  invitations.
- Integrations: list items with name, key prefix, dates, type and Revoked
  badges, revoked keys last and dimmed; Configure the webhook… and Revoke in
  the ⋯ menu; the Webhook delivery line and the Objective for new feedback
  line, whose picker can create an objective.

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `projects` (revision 11; `de` and `es` 12): General header and in-place
  editing, a new Categories paragraph, the Hidden projects tab link and the
  Members cards.
- `api-and-webhooks` (revision 8; `es` 9): New integration, list contents,
  Revoke and Configure the webhook… in the ⋯ menu, Webhook delivery line,
  Objective for new feedback.
- `feedback` (revision 12): Objective for new feedback line.
- `accounts` (revision 12, extended): Hidden projects tab, Preferences
  contents.

Checked without change: `permissions-and-public-links`, `issues`, `numo`
(its MCP for Numo menu actions are unchanged; only icons were added).

Figures:

- `project-settings-steps` (`project-general.png`) and
  `project-members-steps` (`project-members.png`) were recaptured on
  2026-10-19 in all six locales with
  `captures/shots/documentation-refresh/shot.mjs` (screens `project-general`
  and `project-members`) against the local candidate, demo account, light
  theme, 2x density; writes blocked, nothing edited; each image inspected.
- `feedback-objective-selection` is retained and outdated: it shows the
  former Objective row under Integrations. The demo project has no feedback
  integration to photograph, so it is pending a recapture once one exists.

Catalog fixes made in the same pass: in `messages/it.json`,
`Settings.integrationRevoke` ("Ritrovare" → "Revoca"),
`Settings.integrationRevokedBadge` ("Rinunciata" → "Revocata"),
`Settings.integrationRevokeTitle`, `Settings.integrationRevokedToast` and
`Settings.webhookTitle` were mistranslated; in `messages/pt-BR.json`
`Members.invite` ("Convite" → "Convidar"). The articles quoting them follow.

Sources: `components/settings/project-settings-page.tsx`,
`components/settings/project-general-section.tsx`,
`components/settings/project-identity-header.tsx`,
`components/settings/inline-edit-field.tsx`,
`components/project-categories.tsx`, `components/project-members.tsx`,
`components/project-integrations.tsx`,
`components/settings/account-settings-page.tsx`, the categories write policy
in `supabase/migrations/20270109200051_project_roles.sql`, and the `Settings`,
`Projects`, `Categories`, `Members` and `Account` namespaces of
`messages/<locale>.json`.

## Third pass: project figures and danger zone

The project header now shows five figures — Issues (the project's issue
count, read from the board's issue list), Members, Objectives, Categories and
Created — and Hide from your sidebar moved from its own "Visibility for you"
card into the danger zone, next to Move project to trash (owner) or Leave
project (member). `projects` was updated in the six locales and
`project-settings-steps` (`project-general.png`) recaptured again on
2026-10-19 with the same tooling and inspected.

## Fourth pass: project Feedback tab

The Feedback tab of project settings follows the same card-and-row layout as
the other tabs: the setup banner became a card title with a Reconfigure
button, the Active/Off pills next to the channel switches were removed (the
switch says it), the public URL is a row with Copy and Open, visitor identity
is a row whose hint names the mode in force (SSO is enabled from the row, and
regenerated or disabled from its ⋯ menu, the signing secret sitting under the
row), and the API channel is a single row with the active feedback key count
and Manage integrations. No behaviour changed.

The `feedback` article text describes these settings generically and stays
accurate. `publish-a-feedback-board-workflow` was recaptured on 2026-10-19 in all six
locales with `captures/shots/documentation-refresh/shot.mjs` against the
local candidate: the Public board card of the demo project, whose visitors
identify by email code (the previous capture used a restored backend with a
local SSO signer, no longer available, so the alt text and caption now
describe email verification and the Enable SSO action). The board's URL is
concealed with a neutral bar; nothing was toggled; each image was inspected.
Two Italian labels shown in it were corrected in `messages/it.json`:
`Settings.feedbackShowCategories` and `Settings.feedbackAccentTitle`.
