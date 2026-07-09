import type { IssueStatus, IssuePriority, IssueEffort } from "./issue-constants";
import type { ObjectiveStatus } from "./objective-constants";
import type { CycleIntensity } from "./cycle-prefs";

export interface Objective {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: ObjectiveStatus;
  lead_user_id: string | null;
  target_date: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

/** A file attached to an issue (comment_id null) or to a comment/reply.
    The file itself lives in the private `attachments` Storage bucket and is
    served through GET /api/attachments/file?path=… (302 → signed URL). */
export interface Attachment {
  id: string;
  project_id: string;
  issue_id: string;
  comment_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: string | null;
  created_at: string;
}

/** What the client sends after a direct-to-storage upload; the server
    validates the path prefix and creates the `attachments` row. */
export interface AttachmentInput {
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface Comment {
  id: string;
  issue_id: string;
  author_id: string | null;
  /** Root comment of the thread when this is a reply (depth ≤ 1). */
  parent_id: string | null;
  body: string;
  attachments?: Attachment[];
  /** True when posted through Numo — the timeline shows "Numo" as the author. */
  via_assistant?: boolean;
  /** True when posted through the MCP endpoint — the timeline shows the acting
      API key (agent), e.g. "Claude Code (mcp)", instead of the user. */
  via_mcp?: boolean;
  /** The MCP API key behind the comment; name/agent hydrated by the route. */
  api_key_id?: string | null;
  api_key_name?: string | null;
  api_key_agent?: string | null;
  /** Lifecycle of an @Numo comment reply: 'working' while generating (body and
      assistant_tool update live), then 'done' or 'error'. Null = normal comment. */
  assistant_status?: "working" | "done" | "error" | null;
  /** Tool currently executing while assistant_status='working' (shown live). */
  assistant_tool?: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationType = "assigned" | "mention" | "comment";

/** A notification enriched for the Inbox UI. */
export interface MyNotification {
  id: string;
  type: NotificationType;
  read_at: string | null;
  created_at: string;
  issue_id: string | null;
  issue_number: number | null;
  issue_title: string | null;
  project_id: string | null;
  project_key: string | null;
  actor_name: string | null;
}

// ── Statistiques utilisateur (MIN-12) ────────────────────────────────────────
export interface StatsTotals {
  created: number;
  completed: number;
  projects: number;
}

export interface StatProjectBucket {
  name: string | null;
  color: string | null;
  deleted: boolean;
  created: number;
  completed: number;
}

export interface HeatmapDay {
  /** Jour local (fuseau du user), format YYYY-MM-DD. */
  date: string;
  count: number;
}

export interface StatsHeatmap {
  tz: string;
  /** Premier jour de la grille (un dimanche), YYYY-MM-DD. */
  start: string;
  /** Dernier jour de la grille (aujourd'hui dans `tz`), YYYY-MM-DD. */
  end: string;
  /** Compte max sur un jour (échelle d'intensité). */
  max: number;
  /** Série DENSE start→end (un point par jour, count 0 inclus). */
  days: HeatmapDay[];
}

export interface StatsWorkload {
  /** Issues ouvertes qui me sont assignées (live). */
  assignedOpen: number;
  inProgress: number;
}

export interface UserStats {
  totals: StatsTotals;
  perProject: StatProjectBucket[];
  heatmap: StatsHeatmap;
  workload: StatsWorkload;
}

export interface IssueEvent {
  id: string;
  issue_id: string;
  actor_id: string | null;
  type: string;
  field: string | null;
  from_value: string | null;
  to_value: string | null;
  /** True when triggered through Numo — the timeline shows "Numo" as the actor. */
  via_assistant?: boolean;
  /** True when triggered through the MCP endpoint — the timeline shows the
      acting API key (agent), e.g. "Claude Code (mcp)", instead of the user. */
  via_mcp?: boolean;
  /** The MCP API key behind the event; name/agent hydrated by the route. */
  api_key_id?: string | null;
  api_key_name?: string | null;
  api_key_agent?: string | null;
  /** Set when the event comes from a project integration (Feedback API) — the
      timeline shows the integration's name as the actor. */
  integration_id?: string | null;
  integration_name?: string | null;
  /** True when the assignment was made by Smart Assign — the timeline shows
      "Smart Assign" as the actor. */
  via_smart_assign?: boolean;
  created_at: string;
}

export interface CreateObjectiveInput {
  name: string;
  description?: string | null;
  status?: ObjectiveStatus;
  lead_user_id?: string | null;
  target_date?: string | null;
  color?: string | null;
}

export interface ObjectiveUpdateInput {
  name?: string;
  description?: string | null;
  status?: ObjectiveStatus;
  lead_user_id?: string | null;
  target_date?: string | null;
  color?: string | null;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  key: string;
  color: string | null;
  /** Smart Assign: auto-assign unassigned issues past triage (opt-in, owner-set). */
  smart_assign_enabled: boolean;
  /** Smart Assign rules, user_id → free text describing the member's preferred
      tasks (kept on the project — the owner has no project_members row). */
  smart_assign_rules: Record<string, string>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateProjectInput {
  name: string;
  key: string;
  color?: string | null;
}

export interface ProjectUpdateInput {
  name?: string;
  key?: string;
  color?: string | null;
  smart_assign_enabled?: boolean;
  smart_assign_rules?: Record<string, string>;
}

export interface Member {
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: "owner" | "member";
  is_owner: boolean;
}

/**
 * Response of GET /api/me/board — everything the cross-project "My/All" kanban
 * needs to render as a *real* board (drag, inline pickers), keyed by project so
 * each card gets its own project's members/categories/objectives (see MIN-29):
 *   - issues:     every issue across all my accessible projects (RLS-scoped)
 *   - members:    projectId → the project's members (owner synthesized first)
 *   - categories: projectId → the project's categories
 *   - objectives: projectId → the project's objectives
 */
export interface GlobalBoardResponse {
  issues: Issue[];
  members: Record<string, Member[]>;
  categories: Record<string, Category[]>;
  objectives: Record<string, Objective[]>;
  /** Stored `blocks` edges across the user's accessible projects (RLS-scoped) —
      feeds the cycle reco ordering. */
  relations: IssueRelation[];
  cycles: BoardCycles;
}

export interface Invitation {
  id: string;
  project_id: string;
  invited_email: string;
  invited_user_id: string | null;
  status: string;
  created_at: string;
}

export interface MembersResponse {
  members: Member[];
  invitations: Invitation[];
  isOwner: boolean;
}

/** A pending invitation as shown to the invitee on their Home banner. */
export interface MyInvitation {
  id: string;
  project_id: string;
  project_name: string;
  project_key: string;
  inviter_email: string | null;
  inviter_name: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  project_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface CreateCategoryInput {
  name: string;
  color: string;
}

export interface CategoryUpdateInput {
  name?: string;
  color?: string;
}

export interface Issue {
  id: string;
  project_id: string;
  number: number;
  title: string;
  description: string | null;
  /** Implementation plan (markdown with task checkboxes — see lib/plan.ts). */
  plan: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  assignee_id: string | null;
  objective_id: string | null;
  parent_id: string | null;
  duplicate_of_id: string | null;
  due_date: string | null;
  position: number;
  created_by: string | null;
  /** Set when the issue was created through a project integration (Feedback API). */
  integration_id?: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** The personal cross-project cycle this issue belongs to (MIN-32), if any.
      Invariant (SQL trigger): a cycled issue is assigned to the cycle's owner. */
  cycle_id: string | null;
  category_ids: string[];
}

/** A cycle as the board consumes it (MIN-32): the user's personal
    cross-project week/fortnight. `end_date` is EXCLUSIVE; intensity and
    target_points are per-cycle snapshots (past cycles stay frozen). */
export interface CycleInfo {
  id: string;
  start_date: string;
  end_date: string;
  intensity: CycleIntensity;
  target_points: number;
  /** Points actually completed, snapshotted when the cycle closed; null while open. */
  completed_points: number | null;
}

/** The cycles slice of the global board payload. */
export interface BoardCycles {
  enabled: boolean;
  current: CycleInfo | null;
  upcoming: CycleInfo[];
  past: CycleInfo[];
}

export type { CycleIntensity };

/** Relation between two issues, from one issue's point of view (MIN-25).
    `blocked_by` is the inverse read of a stored `blocks` edge. */
export type IssueRelationType = "blocks" | "blocked_by" | "related";

/** A stored relation row as returned by the API (only `blocks`/`related` are
    persisted; `blocked_by` is derived per-issue on the client). */
export interface IssueRelation {
  id: string;
  source_id: string;
  target_id: string;
  type: "blocks" | "related";
}

/** A relation resolved from one issue's perspective, ready for the UI. */
export interface ResolvedRelation {
  /** Id of the stored relation row (used to remove it). */
  id: string;
  relation: IssueRelationType;
  /** The other issue in the pair. */
  otherId: string;
}

export interface CreateIssueRelationInput {
  source_id: string;
  target_id: string;
  /** Relation type from `source_id`'s perspective. */
  type: IssueRelationType;
}

export type IntegrationWebhookEvent =
  | "issue.created"
  | "issue.status_changed"
  | "issue.updated";
export type IntegrationWebhookScope = "integration" | "all";

export interface Integration {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  /** NULL = webhook désactivé (events/scope conservés pour réactivation). */
  webhook_url: string | null;
  webhook_events: IntegrationWebhookEvent[];
  webhook_scope: IntegrationWebhookScope;
  webhook_last_status: string | null;
  webhook_last_at: string | null;
}

export interface CreateIssueInput {
  title: string;
  description?: string | null;
  plan?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  effort?: IssueEffort | null;
  assignee_id?: string | null;
  objective_id?: string | null;
  parent_id?: string | null;
  due_date?: string | null;
  category_ids?: string[];
  attachments?: AttachmentInput[];
}

/** Field changes Numo applies to the create-issue form via voice dictation.
 *  A patch on the client-side draft — nothing touches the database. */
export interface IssueDraftPatch {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  effort?: IssueEffort | null;
  assignee_id?: string | null;
  objective_id?: string | null;
  due_date?: string | null;
  category_ids?: string[];
}

export interface IssueUpdateInput {
  title?: string;
  description?: string | null;
  plan?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  effort?: IssueEffort | null;
  assignee_id?: string | null;
  objective_id?: string | null;
  parent_id?: string | null;
  duplicate_of_id?: string | null;
  due_date?: string | null;
  position?: number;
  /** Setting a cycle assigns the issue to the cycle's owner as a side-effect
      (never bumps status); null removes it from its cycle. */
  cycle_id?: string | null;
}

export type ViewSort = "manual" | "priority" | "created" | "updated" | "due";
/** 'custom' = regular saved view; 'my' = the per-user system view ("Mes
    tickets"): seeded server-side, undeletable, name + assignee locked. */
export type ViewKind = "custom" | "my";

export interface ViewFilters {
  status?: IssueStatus[];
  priority?: IssuePriority[];
  assignee?: (string | null)[]; // null = unassigned, "@me" = current user (resolved at filter time)
  effort?: IssueEffort[];
  category?: string[];
  objective?: (string | null)[]; // null = no objective
  integration?: (string | null)[]; // null = not created by an integration
  project?: string[]; // global (cross-project) views only — a project board is single-project
}

export interface ViewDisplay {
  hideDone?: boolean;
}

/** The filter/sort/display triple a view applies (also the live "working" state). */
export interface ViewConfig {
  filters: ViewFilters;
  sort: ViewSort;
  display: ViewDisplay;
}

export interface View {
  id: string;
  project_id: string | null; // NULL = global (cross-project) view
  kind: ViewKind;
  user_id: string | null; // NULL = shared
  name: string;
  filters: ViewFilters;
  sort: ViewSort;
  display: ViewDisplay;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateViewInput {
  name: string;
  filters: ViewFilters;
  sort: ViewSort;
  display: ViewDisplay;
  /** Project scope only: own the view instead of sharing it (default shared). */
  personal?: boolean;
}

export interface ViewUpdateInput {
  name?: string;
  filters?: ViewFilters;
  sort?: ViewSort;
  display?: ViewDisplay;
}

/** Public-link sharing level of a view — "private" = no share row exists. */
export type ViewShareLevel = "private" | "password" | "public";

/** Owner-facing share state (what the share API returns; null = private).
    The token is the /share/<token> URL capability. */
export interface ViewShare {
  level: Exclude<ViewShareLevel, "private">;
  token: string;
}
