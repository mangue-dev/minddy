# Project roles review (MIN-693)

Date: 2026-10-17. Reviewer: `agent:/root`, with one translation agent per
locale (`agent:/root/min693_fr`, `_de`, `_es`, `_it`, `_pt-BR`). This is an
agent review of the decision record, permission matrix and source in progress
on the same branch. It is not human reader acceptance, a browser walkthrough
or a deployed release test. Application and desktop versions are unchanged
(0.11.1). The role controls were written in parallel with this review, so the
control labels below follow the agreed plain names and must be checked against
the shipped catalogs before release.

## Scope and sources

Authoritative contract: `docs/security/project-roles.md` (decisions and
permission matrix). Supporting source: `lib/project-roles.ts`,
`supabase/migrations/20270109200051_project_roles.sql`,
`lib/server/project-access.ts`, `lib/server/project-members.ts` and the
new error messages in `messages/en.json` (`readOnlyProject`, `commentNotAllowed`,
`cannotChangeOwner`, `transferTargetNotMember`, `transferKeyConflict`,
`transferStorageQuota`).

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR` (one revision each):

- `projects`: new role table in `member-permissions` (Owner, Member, Reader,
  Reader with **Can comment**, public-link visitor); role choice and pending
  edits in `project-members`; new sections `change-role`,
  `transfer-ownership` and `transfer-effects`; leaving rules in
  `project-removal`; guests-per-project counting; reload guidance in
  `invitation-recovery`; summary updated.
- `permissions-and-public-links`: roles, reader limits, MCP role per call,
  integrations without a role, revocation timing (signed private file URLs up
  to 600 seconds), who can publish links.
- `issues`: creation and editing need Owner or Member; readers not
  assignable; reader comments with **Can comment**.
- `objectives`: readers cannot lead; demotion clears the lead.
- `feedback`: readers cannot moderate; internal threads only with **Can
  comment**, no public board replies.
- `pages`: read-only for readers (no edit, import, duplicate, favorite,
  publish or version restore); comments with **Can comment**.
- `views`: sharing needs Owner or Member; readers keep personal views.
- `scheduled-routines`: reader comments do not start comment routines; a
  transfer pauses the former owner's routines.
- `numo`: reader turns use read tools only and are billed to the reader;
  transfer and routines.
- `minddy-mcp`: tools follow the current role on every call; reader tool set.
- `api-and-webhooks`: integrations have no role and keep fixed permissions;
  readers do not see them.
- `ai-settings-and-usage`: guests include readers and pending invitations, no
  per-seat billing; limits, storage and background AI follow a new owner.
- `personal-cycle`: only work assigned in projects where the user is Owner or
  Member.
- `glossary-and-data-model`: project roles in the project definition.
- `code-work`: forge `@numo` mentions count only for the owner or Members.

Claims checked against the decision record: one owner, transfer only to an
existing Member, former owner becomes a Member, routines disabled, plan limits
without retroactive enforcement, storage quota and project-key failure,
pending invitations re-attributed and still valid, subscriptions, payment
methods and personal keys unchanged, **Can comment** off by default and reset
on demotion, demotion unassigns open issues and clears objective leads,
reader-sensitive reads hidden, personal bookkeeping kept, live checks on each
request and signed URLs not recalled.

Not documented on purpose: the internal `project_permission_events` audit has
no user-facing view yet.

## Figures

No capture was taken in this change. Figure revisions were advanced with their
articles, but their images were not re-inspected against the new UI:

- `project-members` (`projects`, `project-members.png`, all six locales) is
  stale. It shows the invitation form without a role choice and the member
  list without role controls or **Transfer project ownership**. A recapture in all six
  locales remains open.
- `project-settings-steps` (`project-general.png`) is unaffected by roles but
  still lacks the MIN-692 visibility group noted in that review.
- `numo-permissions-and-approvals-workflow` keeps its "Member with project
  access" row; it remains accurate but does not name the reader limits, which
  the article prose now states. Its SVG fallback was not regenerated.
- `permissions-and-public-links-flow` and the other figures of the changed
  articles do not show role controls and remain accurate.

## Checks

`npm run check:documentation`, `npm run check:knowledge` and
`npm run check:owned-english` were run after the six locales were updated;
results are listed in the pull request. `check:documentation:release` was not
run.
