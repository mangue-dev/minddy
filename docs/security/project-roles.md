# Project roles: investigation, permission matrix and decisions (MIN-693)

This record is the authorization contract for project roles. It was established
before any role enforcement was written, against revision `cff513d4a`
(`origin/main`, 2026-10-17). Update it with every change to project
authorization.

## 1. Baseline before this change

### Ownership and membership

- The owner is `projects.owner_id`. It is `NOT NULL`, cascades from
  `auth.users`, and `guard_project_content` makes it immutable on UPDATE
  (`20270107720000_project_content_encryption.sql`). No transfer existed.
- The owner has no `project_members` row. Every other person with access has
  exactly one row (`project_id`, `user_id`, `role`, `added_by`, `created_at`).
- `project_members.role` was `text DEFAULT 'member'` with no CHECK. It was
  written once, hard-coded to `'member'`, by invitation acceptance. Nothing read
  it for authorization; member responses rendered every non-owner as `member`.
  Only the local snapshot fingerprint and the account export read it.
- Invitations (`project_invitations`) had no role. Creation goes through the
  owner-only guarded RPCs (plain and encrypted email). Acceptance upserted
  `role: 'member'`, which would also have overwritten an existing row.
- No audit of membership or permission changes existed.

### Authorization primitives

| Layer | Primitive | Rule before MIN-693 |
| --- | --- | --- |
| SQL | `is_project_owner`, `is_project_member`, `can_access_project` | owner, or any member row |
| SQL | `guard_project_actor(project, actor, owner_only)` | owner, or (not owner-only) any member row |
| SQL | `lock_live_project_actor_access(project, actor)` | owner or any member row; only page-content RPCs still call it |
| RLS | `issues_*`, `pages_*`, `objectives_*`, `categories_*`, `issue_relations_*`, `issue_categories_*`, `views_*`, `comments_*`, `page_comments_*`, attachment storage insert | `can_access_project` (any member writes) |
| RLS | `projects_update/delete`, `project_members_insert/update` | owner only |
| TS | `getProjectAccess`, `hasProjectAccess`, `accessibleProjectIds`, `userInProject` | owner, or any member row; `isMember` was always true |
| TS | inline `access.isOwner` / `owner_id !== actor` | administration |

Most project writes use the service-role client and authorize in TypeScript
(about 80 call sites of `getProjectAccess`). MCP never uses RLS. Several tables
still accept direct authenticated writes under RLS (projects, members,
comments, page comments, relations, issue categories, views, attachment
storage), so the SQL helpers must enforce the same matrix.

### Member baseline (preserved exactly by the Member role)

A member could do every content operation an owner could do: issues and
sub-issues, plans, relations, categories, objectives, feedback moderation and
public team replies, pages and databases (schema, entries, history restore,
import, duplicate, favorite), comments, resources and uploads, shared views,
view and page publication links, trash and restore of content, smart triage,
cycles, Git/PR operations with their own forge identity, Numo and MCP with the
same tools. A member could leave the project. A member could read routines
and their outcomes, integration summaries (including webhook URLs), share
tokens and the feedback board token.

Owner-only before MIN-693: project settings (name, key, color, Smart Assign),
icon and orb, deletion/restore/purge of the project, invitations and member
removal, integrations and their webhooks, Git link, project import and brief
apply, feedback board settings, routines (create, edit, enable, run, delete),
`propose_backlog`, pending-invitation emails, routine usage percentages and
the feedback SSO secret.

### Read-shaped writes

- `ensureCycles` (`lib/server/cycles.ts`) runs from `GET /api/me/board`,
  `/api/me/cycle`, `/api/me/summary`, MCP `minddy_get_cycle` and Numo
  `get_cycle`. It closes past cycles, rolls open issues forward, and fills the
  current cycle with every open issue assigned to the user, in every project,
  without a membership check. `enforce_issue_cycle` limits these writes to
  issues assigned to the cycle owner.
- `runCycleBlockerPull` assigns a blocker to the cycle owner; `runCycleCapture`
  places another user's issue in that user's cycle.
- `GET /api/projects/[id]/views` seeds baseline views (system bookkeeping).
- `touchPageWatcher` upserts the caller's own `page_viewers` row (presence).

### Routines, Numo and indirect execution

- Routines are owner-only to manage and always run as `routine.owner_id`, who
  pays. `ensure_numo_routine_occurrence` requires the routine owner to still be
  the project owner, and event processing cancels otherwise.
- `routine_events` stores no initiating actor. For comments, `source_id` is the
  comment id, so the author can be recovered.
- `@Numo` in a comment (issue, objective, page, feedback) or a reply under a
  Numo comment runs a Numo turn as the commenter, with the full tool set,
  billed to the commenter. Tools re-check access on every call
  (`execute-tool.ts`), and turns re-check at execution (`numo/turns.ts`).
- `@numo` in a forge PR comment runs as the project owner and is billed to the
  owner, gated only on the author being any member of a linked project.
- The coding agent and native subscription connections were removed by
  MIN-721; no launch, approval or worker stage remains.

### MCP, API and integrations

- OAuth 2.1 tokens resolve to a user and an attribution key only. Every MCP
  call re-evaluates `getProjectAccess` through `requireProject`; nothing is
  cached, so a role change applies on the next call without revoking tokens.
- Project integrations (`mdy_` keys, `/api/v1`) are their own identity, bound
  to one project and one kind. They are not human members and receive no role.
- Public boards, published pages and shared views are capability links,
  unaffected by roles. Creating or revoking a view/page link was open to any
  member.

### Billing and quotas

- Structural limits use the owner's plan: issues per project, guests per
  project (members plus live pending invitations, counted under a project
  lock), storage (through `project_storage_owners`). Project count uses the
  creator's plan and counts owned plus member projects.
- AI is paid by its actor (Numo, comment mentions, dictation, imports), by the
  routine owner (routines), or by the project owner (Smart Assign, feedback
  analysis, embeddings, unattributed Smart Fill). BYOK keys are the payer's.
- There is no per-seat billing.

### Propagation

- Every `project_members` INSERT/UPDATE/DELETE takes the project authority
  lock, rotates the project Realtime generation (`project_members_authority_rekey`
  has no column list), sends `rekey`, and broadcasts the row. Clients reconnect
  and invalidate `["members", id]` and `["projects"]`; in-flight bootstraps are
  cancelled.
- The local snapshot fingerprint includes the member role.
- Signed attachment URLs live 600 seconds (24 hours for published pages) and
  are not re-authorized when used.

## 2. Decisions

| Topic | Decision |
| --- | --- |
| Owner cardinality | Exactly one owner, still `projects.owner_id`. The owner can transfer ownership to an existing Member. |
| Transfer | Atomic RPC: the new owner's member row is removed, the former owner becomes a Member, pending invitations are re-attributed to the new owner, and the former owner's routines in the project are disabled (they stop paying; the new owner re-creates what they want). Storage moves to the new owner and the transfer fails if their quota cannot hold it. Issue and member limits follow the new owner's plan without retroactive enforcement. Subscriptions, payment methods, BYOK keys and Git identities never move. |
| Last owner | Cannot be lost: the owner cannot leave, be removed or be demoted; only a transfer changes it. Account deletion keeps today's behavior (owned projects are deleted with their files, as the deletion preview warns). |
| Roles | `member` (unchanged baseline) and `reader` on `project_members.role`, enforced by a CHECK. `owner` is never stored in `project_members`. |
| Can comment | `project_members.can_comment`, only meaningful for readers (always false for members). Off by default; reset to off whenever someone becomes a Reader, unless the same change sets it explicitly. |
| Comment scope | With the option, a reader can comment on issues, objectives, internal feedback threads and pages; reply; mention people; attach files inside their own comment; edit and delete their own comments. Not included: public team replies on the feedback board, PR comments and reactions, moderation of other people's comments, standalone resources. |
| Numo for readers | A reader's Numo turns (chat or `@Numo` in a comment they are allowed to post) use read-only tools only, billed to the reader. The reply comment is written as the reader's comment. |
| Routines and reader comments | A comment whose author is a reader does not arm `issue.comment_added` routines, so a reader cannot start owner-authority, owner-billed work. |
| Forge `@numo` | Only owners and Members (not readers) can trigger a PR mention. |
| Assignment | Readers are not assignable, not objective leads, not Smart Assign candidates, and not routine trigger people. Demotion to Reader unassigns their open issues and clears their objective leads in the same transaction, which also removes those issues from their cycle. |
| Mentions | Readers stay mentionable (they can read). |
| Plan slots | Readers count against guests-per-project like members, and so do pending reader invitations. No seat billing. |
| Invitations | The owner chooses the role and comment option when inviting and can change them while the invitation is pending. Acceptance applies the invitation's stored role, never a client value, and never overwrites an existing membership. |
| Reader-sensitive reads | Readers do not see integrations (webhook URLs, key prefixes), share tokens or the feedback board token, and cannot publish or revoke links. They keep the member read access to content, members, routines and routine outcomes. |
| Personal bookkeeping | Readers can hide a project, watch pages (presence), manage their notifications, scratchpad, personal views and personal cycle. Page favorites are shared project state and need write access. |
| Revocation timing | Server checks are live on every request, MCP call, Numo tool call and routine/Numo execution. Already delivered data and signed URLs (up to 10 minutes) are not recalled. |
| Audit | `project_permission_events` records role, comment-option and ownership changes with actor, target, old and new values and time, in the same transaction. |

## 3. Permission matrix

`C` = with the reader's "Can comment" option only.

| Action | Owner | Member | Reader |
| --- | --- | --- | --- |
| Read project content, members, routines, outcomes | yes | yes | yes |
| Create, edit, move, trash, restore issues, plans, relations, categories | yes | yes | no |
| Objectives, feedback moderation, promotion, links | yes | yes | no |
| Public team reply on the feedback board | yes | yes | no |
| Pages and databases (edit, import, history restore, duplicate, favorite) | yes | yes | no |
| Comment on issues, objectives, internal feedback, pages; edit/delete own | yes | yes | C |
| Attach files to own comment | yes | yes | C |
| Standalone resources and uploads | yes | yes | no |
| Shared views; publish or revoke view and page links | yes | yes | no |
| Personal views, page presence, hide project, notifications | yes | yes | yes |
| Cycles: plan their own assigned work | yes | yes | not assignable |
| Git/PR actions and PR comments | yes | yes | no |
| Numo and MCP | all tools | member tools | read tools (+ comment tools with C) |
| Integrations: read summaries | yes | yes | no |
| Settings, icon, import, brief, feedback board settings | yes | no | no |
| Integrations, Git link, routines (manage, run) | yes | no | no |
| Invite, change roles and comment option, remove members | yes | no | no |
| Transfer ownership, delete project | yes | no | no |
| Leave the project | no | yes | yes |

## 4. Enforcement points

- SQL: `project_role(project, user)`, `can_write_project(project)` and
  `can_comment_project(project)`; content write policies use
  `can_write_project`, comment policies use `can_comment_project`;
  `guard_project_actor` (non-owner mode) and `lock_live_project_actor_access`
  require write access.
- TypeScript: `ProjectAccess` carries `role`, `canWrite`, `canComment`;
  content cores check `canWrite`, comment cores `canComment`, administration
  `isOwner`. `userInProject` remains the read rule; `userCanBeAssigned` is the
  assignment rule.
- MCP: `lib/server/mcp/tool-capabilities.ts` declares the capability of
  every tool (`user`, `read`, `comment`, `write`, `admin`). Registration
  throws for an undeclared tool, and `requireProject` / `resolveProject`
  enforce the declared capability of the running tool (fail-closed to
  `admin` outside a declared tool).
- Numo: `lib/server/assistant/tool-capabilities.ts` declares every tool; one
  gate in `executeTool` enforces it, plus the trash, view and cycle branches.
  A reader's mention turns are offered only read (and, with the option,
  comment) tools.
- Routines: comment-triggered events from readers are skipped at processing.
- Cycles: rollover and fill skip projects where the user cannot write.
- Clients: `Project.my_role` / `my_can_comment` and `MembersResponse.myRole`
  drive UI gating; the server remains authoritative.

## 5. Migration, rollout and rollback

- Forward migration only. Existing rows are `role = 'member'`, so every
  current member keeps exactly their access; `can_comment` defaults to false.
  Owners are unchanged.
- Fresh installs and upgrades run the same migration. Invitations get
  `role = 'member'` by default.
- Activation: the Reader role and transfers are assignable only through the
  new owner-only endpoints, which ship together with the enforcing SQL, server,
  MCP, Numo and routine paths in one release. The schema, its CHECK and the
  SQL helpers are enforced in the database, so a reader cannot write through
  PostgREST even from an older client.
- Rollback: reverting the application while reader rows exist would let older
  servers treat readers as members. Before reverting, convert readers to
  removals or confirm with the owners; never revert the SQL helpers alone.

## 6. Verification evidence (2026-10-17)

- The migration was applied on the linked production database inside one
  transaction that always aborts (no commit; objects confirmed absent
  afterwards). Results: a member could write and comment; demotion to reader
  unassigned the member's 4 open issues; the reader could read but not write
  (`can_write_project` false, direct `issues` update denied, `pages` update
  matched 0 rows, `guard_project_actor` and `lock_live_project_actor_access`
  refused); granting the comment option enabled `can_comment_project` only;
  the reader could not promote themselves (direct update matched 0 rows,
  guarded RPC refused); transfer to a reader was refused, transfer to a member
  succeeded and made the former owner a member; a direct `owner_id` update
  outside the transfer stayed refused; acceptance of a missing invitation
  raised `invitation_not_found`.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:tooling`,
  `npm run check:encrypted-access`, `npm run check:encryption-schema`,
  `npm run check:documentation`, `npm run check:knowledge`,
  `npm run check:owned-english` and `git diff --check`.
- Not covered: a browser walkthrough of the new UI, concurrent-transition
  tests against an isolated database, and refreshed documentation
  screenshots (`project-members` is stale in all six locales).

## 7. Known client gaps

The server enforces every rule above. These client surfaces still show
controls to readers and rely on the server refusal: cross-project bulk
actions on the global board, page database cells and history restore,
starting a block comment from a text selection (page-level comments work),
command palette issue actions, standalone resources, PR panel actions, and
non-owner project settings sections.
