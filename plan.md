# minddy — Framing plan

> Simplified issue tracking. A simple interface, only one way to do things.
> This document is the result of the framing session — it describes **how minddy should walk**,
> the resulting data model, and the v1 vs deferred scope.

---

## 1. Vision & positioning

minddy is a **deliberately opinionated and minimal** issue tracking tool, going against the grain of
flexibility of Linear/Jira. The guiding principle: **only one way to do everything**. No
extended config, no customizable workflows, no tailor-made statuses. The value is in the
sobriety and predictability.

Design reference (logic **and** interface): **AutoKap** (repo `screenshot-agent`). We clone its
architectural patterns and we reuse **mango-ui** for the entire UI shell.

---

## 2. Concepts & vocabulary

The word “project” designated two things – it is now clear:

| Term (UI) | What it is | Linear Analogy |
|---|---|---|
| **Project** | The **workspace**, the basic unit. The issues, members, categories are scoped there. Without a Project, the user cannot do anything. | Team / Workspace |
| **Objective** | A **group of issues** from a Project sharing a common goal (“Refactor UI”). A “big issue”. | Project |
| **Outcome** | The atomic work unit. | Issue |
| **tab** | The high nav level in a Project: *My issues*, *All issues*, *Objectives*. | Section view |
| **View** | A “tab” saved **in** an issues tab = a kanban with its filters + its sorting. | Saved view |
| **Triage** | An **arrival zone** of unprocessed proto-issues (not a status). Deferred (see §8). | Triage |

Code convention: keep technical names unambiguous (e.g. `project` = Project, `objective` = Objective)
to never confuse the two levels.

---

## 3. Technical stack

Clone of the AutoKap stack, on a **separate Supabase instance** (auth specific to minddy — one user
minddy is not shared with AutoKap).

- **Front**: Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · **mango-ui**
- **Data**: Supabase (Postgres) · **Supabase Auth** (email/password + OAuth Google/GitHub)
- **Multi-tenant**: Postgres RLS + `SECURITY DEFINER` (`can_access_project()`-style) functions, modeled
  on AutoKap (`project_members`, `project_invitations`, owner = `projects.user_id`)
- **Client data**: TanStack React Query + **Supabase Realtime** (optimistic mutations, live cache patch)
- **API**: route handlers under `app/api/*` (no server actions for mutations)
- **Specific minddy additions**: **dnd-kit** (kanban drag & drop)

AutoKap files to mirror: `web/lib/migrations/001_create_projects.sql`,
`016_create_project_collaboration.sql`, `026_create_project_invitations.sql`,
`web/lib/server/project-access.ts`, `web/app/api/projects/route.ts`.

---

## 4. The outcome in detail

Fields of an issue:

| Field | Type/values ​​| Notes |
|---|---|---|
| **Title** | text, required | |
| **Description** | rich-text (markdown) | `/` commands later |
| **Identifier** | `KEY-number` (e.g. `MIND-42`) | Project key + counter **per Project** |
| **Status** | **frozen**: `Backlog · Todo · In Progress · In Review · Done · Canceled` | = kanban columns. Not customizable. |
| **Assigned** | **only 1** member (or none) | clear responsibility |
| **Priority** | `None · Urgent · High · Medium · Low` | frozen |
| **Effort** | `XS · S · M · L · XL` | frozen (t-shirt) |
| **Categories** | multi-select | **customizable by Project** (create/edit/delete in its settings), shared by all its members |
| **Objective** | 0 or 1 | optional link |
| **Due date** | date, optional | available from v1 |
| **Parent** | `parent_id` (self-FK) | sub-exits, **only 1 level** |
| **Comments** | thread by issue, rich-text markdown | activated especially when the Project is shared |
| Meta | `created_by`, `created_at`, `updated_at`, `position` | `position` = manual order in a column |

**Sub-issues**: a sub-issue is a **issue in its own right** (specific identifier, status, assigned),
it appears on the kanban like the others. The parent displays the list of his children + a **bar
progress** (X/Y done). A sub-issue inherits by default the Objective of the parent (editable).
Deleting a parent **detaches** its children (does not delete them). Nesting limited to one level.

---

## 5. Navigation & Views

### Structure in an Open Project

```
Project ┌─ My issues       ← tab, only when the Project is shared · pre-filtered to assigned = me
        ├─ All issues      ← tab, always available · every issue in the Project
        ├─ Objectives      ← list of objectives
        ├─ Settings        ← categories, members, key, name
        └─ (Triage)        ← deferred, see §8
```

### Views (tabs in an issues tab)

A **View** = a kanban saved with its **filters** + its **sorting**. Rules :

- **`All issues` → Views shared** by the entire Project (common team process). Any member
  can create/modify a Shared View (no fine-grained rights in v1).
- **`My issues` → Personal views** to each member (all implicitly filtered to assigned = me).
- Each tab starts on a **Non-deletable default view** (“All”).
- **Kanban ALWAYS groups by status.** A View only **filters** (status, priority,
  category, assigned, objective, effort) and **sort** — never group otherwise. Predictable UI.
- View display options: hide `Done` issues, show/hide sub-issues, etc.

### Scope

Everything is **scoped to the current Project** in v1. No global “My issues” view (cross-project) — considered
later at Home level.

---

## 6. Objectives

An Objective = a group of outcomes with a common goal.

| Field | Values ​​|
|---|---|
| **Name** | obligatory |
| **Description** | rich-text |
| **Status** | frozen: `Planned · In Progress · Done · Canceled` |
| **Lead** | 1 responsible member (optional) |
| **Target date** | optional |
| **Color / icon** | optional (visual identification) |
| **Progress** | **auto** = issues `Done` / total linked issues (bar) |

- **Objectives tab** = a **simple list** (name, status, progress, lead, number of outcomes). No
  Views/tabs system here.
- **Click an Objective** → opens the `All issues` **filtered** board for this objective. This board filtered
  has a **header banner**: name, status, progress, lead, target date + **Edit** button
  (dialog/SidePanel for name/description/lead/date/status/color).
- **Create an Objective** = a dialog.

---

## 7. Creation & interactions

- **Create an issue**: “New issue” button + shortcut **`C`** → **quick creation dialog**
  (title focus, status/priority/assigned/optional objective inline, creation by keyboard). The outcome can
  then open in **SidePanel** to detail it.
- **Detail of an issue**: opens in the **SidePanel** (`SidePanel` of mangue-ui), never in full page.
  Contains all meta fields + the **comments** thread + the list of **subissues** with
  progression. a **unified timeline** at the bottom: **activity log + comments** interleaved chronologically
  (see “Activity Log” below).
- **Drag & drop** (dnd-kit): dragging a card between columns changes its status; manual order in a
  column via `position`.
- **Real time**: the board updates live (Supabase Realtime).
- **Keyboard — moderate level**: ⌘K (search for issue by title/identification via `CommandMenu`) + some
key shortcuts (`C` create, `Escape` close, navigation arrows). No full keyboard-first in v1.

### Activity log (timeline)

Each issue keeps a **trace of all its events**, displayed as a timeline in the SidePanel,
**interlaced with comments** (Linear way).

- **Traced events**: creation, title change, description, status, priority, effort, assigned,
  objective, due date, category (addition/removal), parent, addition/removal of a sub-issue.
- **Storage** (`issue_events`): `type`, `field`, `from_value`, `to_value`, `actor_id`, `created_at`.
- **Generation**: server side in the mutation route handlers (diff before/after = single source
  writing; Postgres triggers as an alternative if we want to be exhaustive).
- **Description**: as it can be large, we only record the event
  “modified description” (without storing the full diff) in v1. The other fields store `from`/`to`.
  The full versioning/diff of the description remains deferred.

---

## 8. Triage (delayed)

Triage is an **arrival zone**: a triage item is a light **proto-issue** (title +
description, without status/assigned/priority) which becomes a real issue when a human **processes** it
(Accept → set status/priority/assigned/objective · Reject · Merge into duplicate).

**Scope decision**: an issue created by a member **arises directly on the board** (not via the
Triage). The only sources that feed the Triage are **Numo** (§9) — which comes later. **Triage
is therefore in fact a v2 concept.** We reserve its place in the data model (proto-issue) but we do not
built **no** capture logic or Triage tab in v1.

---

## 9. Collaboration

- **Roles**: **owner** (creator, = `projects.user_id`) + **member** (guest by email). Two roles
  only.
  - *member*: all daily work (create/edit/delete issues, objectives, categories, shared views).
  - *owner* only: rename/delete the Project, manage members/invitations, change the key.
- **Invitations**: by email, modeled on AutoKap (`project_invitations`: pending → accepted/rejected).
- **Inbox / notifications** — v1 triggers:
  1. An **outcome is assigned to me**
  2. I am **@mentioned** in a comment
  3. **New comment** on an issue that I carry (assigned to me or created by me)

(Status changes do not notify **not** in v1.)

- **Home (excluding Project)**: copies the AutoKap `HomeSidebar` — list/switcher of **Projects** + button
  “new Project” + **Inbox** + account menu. Create a Project requests **name** + **key** (e.g. `MIND`);
  the rest (categories, members) is configured later. A user without any Project is invited to
  create one (it can't do anything else).

---

## 10. Numo (AI assistant) — roadmap

Numo is minddy's AI assistant: he will be able to **create, modify, search** for exits and **create
Objectives** in natural language. UI shell already available in mangue-ui (`NumoChat`). The exits
created by Numo will land in **Triage** for human validation before entering the board.
**Deferred post-v1** (probably via AI SDK + tool-calling on the same route handlers).

---

## 11. Data model (proposal)

Postgres tables (Supabase), all protected by RLS via `can_access_project(project_id)`:

```
projects
  id, owner_id (auth.users), name, key (unique/owner), color, created_at, updated_at, deleted_at

project_members
  project_id, user_id, role ('member'), added_by, created_at        PK(project_id, user_id)

project_invitations
  id, project_id, invited_email, invited_user_id, invited_by, status, created_at, responded_at

categories                       -- the "labels", scoped to the Project
  id, project_id, name, color, created_at

objectives
  id, project_id, name, description, status, lead_user_id, target_date, color,
  created_at, updated_at

issues
  id, project_id, number (counter/Project), title, description,
  status, priority, effort, assignee_id, objective_id, parent_id (self-FK),
  due_date, position, created_by, created_at, updated_at, completed_at

issue_categories                 -- N–N issues ↔ categories
  issue_id, category_id                                             PK(issue_id, category_id)

comments
  id, issue_id, author_id, body, created_at, updated_at

issue_events                     -- activity log (timeline)
  id, issue_id, actor_id, type, field, from_value, to_value, created_at

views                            -- Saved views
  id, project_id, tab ('my'|'all'), user_id (NULL if shared),
  name, filters (jsonb), sort, position, created_at

notifications                    -- Inbox
  id, user_id, project_id, type, issue_id, comment_id, actor_id, read_at, created_at
```

Outcome identifier: `projects.key` + `issues.number` (counter incremented by Project, AutoKap style).

---

## 12. Scope v1 vs deferred

| In v1 | Deferred (v2+) |
|---|---|
| Projects (workspace) + members + invitations | Viewer role / fine rights |
| Full issues + sub-issues + **activity log** | Full description versioning/diff |
| Kanban DnD by status + manual order | Triage (capture) + Numo |
| My/All tabs + Views (shared/personal) | Global cross-project “My issues” view |
| Objectives + auto progress | Attachments (issues/comments) |
| Comments + @mentions | Billing/Striping |
| Inbox (assignment, mention, comment) | Governance of Shared Views |
| ⌘K search + moderated shortcuts | Full keyboard-first |
| Real time (Realtime) | External integrations |

---

## 13. Build roadmap (proposal)

1. **Foundations**: scaffolding already in place → auth Supabase, shell (`AppShell`/`Sidebar`/`Header`),
   ThemeProvider, React Query/Realtime providers.
2. **Projects**: CRUD Project + key + Home/switcher + creation + basic RLS + members/invitations.
3. **Issues (core)**: table + CRUD + identifiers + SidePanel detail + quick creation dialog.
4. **Kanban**: board by status + dnd-kit + manual order + real time.
5. **Views & tabs**: My/All issues + Views (shared/personal) + filters/sorting/display.
6. **Categories**: management in the Project parameters + multi-select on the outcome.
7. **Objectives**: CRUD + progression + list + filtered board + banner.
8. **Sub-issues**: parent_id + display + parent progress.
9. **Comments, activity & Inbox**: thread by issue + **activity log (timeline)** + @mentions + notifications.
10. **Finishes**: ⌘K, shortcuts, empty states, polish.
> Post-v1: Triage + Numo, then activity feed, attachments, billing, global view.

---

## 14. Detail decisions

- **Project Key**: **unique per account** (owner) — auto-suggested from the name, editable, 2–5 letters.
  Another account can reuse the same key (no global uniqueness).
- **Governance of Shared Views**: **open to all members** in v1 (to be restricted later if necessary).
- **Comment format**: **rich-text markdown**, same editor as the description.
- **Numo Scope**: **left open** — the surface of tools + guardrails will be decided at
  the implementation (post-v1). Intention: create/modify/search for outcomes, create goals;
  its exits land in Triage.
