import type {
  IssueStatus,
  IssuePriority,
  IssueEffort,
} from "./issue-constants";
import type { ObjectiveStatus } from "./objective-constants";
import type { CycleIntensity } from "./cycle-prefs";
import type { RepoProviderId } from "./repo-providers";
import type { RecurrenceCadence } from "./recurrence";
import type { BillingPlanId } from "./billing-plans";
import type { AutomationOverride, AutomationRule } from "./automations";
import type { CommentVisibility } from "./feedback/types";

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

/**
 * A resource attached to an issue/objective (comment_id null) or to a
 * comment/reply — a FILE or a LINK (MIN-184). A file lives in the private
 * `attachments` Storage bucket and is served through
 * GET /api/attachments/file?path=… (302 → signed URL); a link carries its URL
 * and, when the site had one, its favicon inlined as a data URI.
 *
 * The table is still named `attachments`: the rename is one of the notion, not
 * of the storage.
 */
export interface Attachment {
  id: string;
  project_id: string;
  /** Exactly one of issue_id / objective_id / feedback_post_id is the parent. */
  issue_id: string | null;
  objective_id: string | null;
  feedback_post_id?: string | null;
  comment_id: string | null;
  kind: ResourceKind;
  /** Set for a file, null otherwise (attachments_kind_ck). */
  storage_path: string | null;
  /** Set for a link, null otherwise (attachments_kind_ck). */
  url?: string | null;
  /** Favicon of a link, `data:image/…;base64,…`; null when the site had none. */
  icon_data_url?: string | null;
  /** Set for a page resource, null otherwise (attachments_kind_ck, MIN-275). */
  page_id?: string | null;
  /**
   * The referenced page, RESOLVED at read time by the `resources` routes
   * (`page:pages(id, title, icon)`) — never stored, or renaming a page would
   * leave its old name on every ticket that cites it.
   *
   * `null` (or absent) means « not resolved »: the page is in the trash — the
   * `pages_select` policy hides it from the session client — or the read didn't
   * ask for the join. `file_name` then holds the snapshot taken when the
   * resource was added.
   */
  page?: { id: string; title: string; icon: string | null } | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: string | null;
  created_at: string;
}

export type ResourceKind = "file" | "link" | "page";

/** What the client sends after a direct-to-storage upload; the server
    validates the path prefix and creates the `attachments` row. */
export interface AttachmentInput {
  kind?: "file";
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

/** The file half of a resource — the historical `AttachmentInput`, kept under
    that name for the composers that only take files (chat, PR composer). */
export type FileResourceInput = AttachmentInput;

/** What the client sends once /api/projects/[id]/link-preview has resolved the
    link's title and favicon for it. */
export interface LinkResourceInput {
  kind: "link";
  url: string;
  /** The link's display name — the page title, or its hostname. */
  file_name: string;
  icon_data_url?: string | null;
}

/**
 * What the client sends to cite a page of the project (MIN-275). Nothing to
 * upload and nothing to resolve over the network: the browser already knows the
 * page's id and title from the project's pages cache.
 */
export interface PageResourceInput {
  kind: "page";
  page_id: string;
  /** Snapshot of the page title at that moment — the display name is resolved
      live at read time, this is only the fallback. */
  file_name: string;
}

/** Any of the three forms of a resource, as the registration routes accept it. */
export type ResourceInput =
  FileResourceInput | LinkResourceInput | PageResourceInput;

export function isLinkResource(
  input: ResourceInput,
): input is LinkResourceInput {
  return input.kind === "link";
}

export function isPageResource(
  input: ResourceInput,
): input is PageResourceInput {
  return input.kind === "page";
}

export interface Comment {
  id: string;
  /** Exactly one of issue_id / objective_id / feedback_post_id is the parent. */
  issue_id: string | null;
  objective_id?: string | null;
  feedback_post_id?: string | null;
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
  /** GitHub provenance for a comment synchronized from a linked issue. */
  github?: {
    author_login: string | null;
    author_association: string | null;
    url: string | null;
    created_at: string | null;
    updated_at: string | null;
    deleted_at: string | null;
  } | null;
  /** Lifecycle of an @Numo comment reply: 'working' while generating (body and
      assistant_tool update live), then 'done' or 'error'. Null = normal comment. */
  assistant_status?: "working" | "done" | "error" | null;
  /** Tool currently executing while assistant_status='working' (shown live). */
  assistant_tool?: string | null;
  /** Feedback threads only (MIN-196): 'public' means the comment is READ ON THE
      BOARD. Everything else — issues, objectives, and every comment written
      before MIN-196 — is 'internal'. */
  visibility?: CommentVisibility;
  /** The board VISITOR who wrote a public comment, when it isn't the team's own
      voice. Their real name/email is resolved here, for the team only: the
      board itself never sees more than a pseudonym-seeded avatar. */
  feedback_user_id?: string | null;
  feedback_users?: {
    id: string;
    name: string | null;
    email: string | null;
    pseudonym: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export type NotificationType =
  | "assigned"
  | "mention"
  | "comment"
  /** The code agent finished a turn on an issue I launched it on. */
  | "agent_done"
  /** The code agent asked a question and waits for my answer. */
  | "agent_question"
  /** The code agent failed to start or died on an error. */
  | "agent_failed"
  /** A new feedback post arrived on the project's board. */
  | "feedback_new"
  /** Someone reviewed (approved / requested changes on) a PR the agent opened for me. */
  | "pr_reviewed"
  /** A PR the agent opened for me was merged on the forge. */
  | "pr_merged"
  /** A pull request has just opened on a repository linked to one of my projects —
 from Numo or a human, it is waiting for eyes in both cases. */
  | "pr_opened"
  /** An automation chain is waiting for a human green light (MIN-147). */
  | "automation_paused"
  /** An automation chain has stopped: budget, quota, check failed. */
  | "automation_stopped"
  /** A routine pass completed without pushing anything — the case where neither the PR
 nor the failure spoke, and the routine therefore said nothing at all. */
  | "routine_done"
  /** I was quoted in a wiki PAGE (MIN-278) — the same sentence as in a
 ticket comment, which she already warned about. */
  | "page_mention"
  /** The agent wrote in a page. To the only launcher of the run: a page rewritten
 in silence is the counterpart of the problem that MIN-277 has equipped. */
  | "page_agent_edit"
  /** Someone commented on a page I wrote, or a thread I participated in
 (MIN-282) — the exact counterpart of `comment` on a ticket. */
  | "page_comment";

/** A notification enriched for the Inbox UI. */
export interface MyNotification {
  id: string;
  type: NotificationType;
  read_at: string | null;
  created_at: string;
  issue_id: string | null;
  /** Targeted code conversation, including when it has no tickets. */
  agent_conversation_id: string | null;
  agent_conversation_title: string | null;
  issue_number: number | null;
  issue_title: string | null;
  /** Set instead of the issue fields when the notification points at an objective. */
  objective_id: string | null;
  objective_name: string | null;
  /** Set instead of the issue/objective fields when it points at a feedback post. */
  feedback_post_id: string | null;
  feedback_title: string | null;
  /** Set instead of all of the above when it points at a ROUTINE (MIN-185) —
      a scheduled run has no ticket; its executions live in the routine. */
  routine_id: string | null;
  routine_title: string | null;
  /** Set instead of all of the above when it points at a PULL REQUEST: it reads on the Pull requests page, which does not belong to any project. */
  pull_request_id: string | null;
  pull_request_number: number | null;
  pull_request_title: string | null;
  /** Set instead of all of the above when it points at a PAGE (MIN-278) — the
 project wiki; `block_id` refines the target to the block when it is known. */
  page_id: string | null;
  page_title: string | null;
  block_id: string | null;
  project_id: string | null;
  project_key: string | null;
  actor_name: string | null;
  /** The actor's generated mark (lib/avatar.ts). Null when the actor isn't a
      person — Numo, an MCP agent, Smart Assign — or when there is none at all. */
  actor_avatar_seed: string | null;
  /** The comment behind this row was written by Numo — the inbox shows its
      icon and names Numo as the actor, not the user the row is stored under. */
  from_numo: boolean;
  /** The action came through the MCP endpoint: the displayed actor is the AGENT
      below, never the account whose key it held. */
  via_mcp: boolean;
  /** Acting agent's id (`claude`, `cursor`…) when its key maps to a known one —
      gives the logo; else null and the raw key name stands in. */
  api_key_agent: string | null;
  api_key_name: string | null;
  /** The assignment was made by Smart Assign (no human actor). */
  via_smart_assign: boolean;
  /** The line comes from a project automation (MIN-147) — same reason as
 `via_smart_assign`: otherwise the inbox reads a null actor and says "Someone". */
  via_automation: boolean;
  /** First characters of the comment that triggered a mention/comment row. */
  comment_excerpt: string | null;
}

/**
 * A device subscribed to push notifications (MIN-183) — an entry by
 * browser, as the settings map shows.
 *
 * `p256dh` / `auth` are NOT there: these are the end encryption keys en
 * end, device secrets that never leave the server (see
 * lib/server/push/columns.ts). `endpoint` comes out — this is what the client
 * compares to his own to recognize “this device”.
 */
export interface PushDevice {
  id: string;
  endpoint: string;
  /** The protocol that joins this device: VAPID on the web, APNs in the macOS app. */
  transport: "web" | "apns";
  /** “Chrome on macOS” — calculated server-side (lib/device-label.ts). */
  device_label: string | null;
  /** The language of the device, fixed at the subscription: the telephone in French
 and the work laptop in English are two devices. */
  locale: string;
  /** Turned off without being unsubscribed: permission remains granted, one click turns it back on. */
  enabled: boolean;
  created_at: string;
  last_seen_at: string;
  last_push_at: string | null;
}

// ── User statistics (MIN-12) ──────────────────── ────────────────────
export interface StatsTotals {
  created: number;
  completed: number;
  projects: number;
  /** Tasks checked in the notebook, cumulative: the notebook being a free note
   * (we check it then we delete), this total comes from the ledger, not the note. */
  tasksCompleted: number;
}

export interface StatProjectBucket {
  id: string;
  name: string;
  color: string | null;
  iconUrl: string | null;
  orbSeed: string | null;
  completed: number;
}

export interface StatCategoryBucket {
  name: string;
  color: string;
  completed: number;
}

export interface StatObjectiveBucket {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
  completed: number;
}

export interface HeatmapDay {
  /** Local day (user timezone), format YYYY-MM-DD. */
  date: string;
  /** Whatever was completed that day = `issues` + `tasks`. */
  count: number;
  /** Tickets changed to Done that day. */
  issues: number;
  /** Tasks checked in the notebook that day. */
  tasks: number;
}

export interface StatsHeatmap {
  tz: string;
  /** First day of the schedule (a Sunday), YYYY-MM-DD. */
  start: string;
  /** Last day of the grid (today in `tz`), YYYY-MM-DD. */
  end: string;
  /** Max count over one day (intensity scale). */
  max: number;
  /** DENSE start→end series (one point per day, count 0 included). */
  days: HeatmapDay[];
}

export interface StatsWorkload {
  /** Open issues assigned to me (live). */
  assignedOpen: number;
  inProgress: number;
}

/** Recent momentum: what was completed over 7 rolling days, and the same measurement
 * over the 7 days before to give the trend. */
export interface StatsWeek {
  /** Completed tickets + checked tasks over the last 7 days (today included). */
  completed: number;
  /** Share of tickets in `completed`. */
  issues: number;
  /** Share of notebook tasks in `completed`. */
  tasks: number;
  /** Same total over the previous 7 days — the basis for comparison. */
  previous: number;
}

/** Median completion time for an effort level (MIN-58). */
export interface StatsCycleEffort {
  effort: "xs" | "s" | "m" | "l" | "xl";
  /** Median of the “cycle time” (first in_progress → done), in seconds: one
   * ticket left open three weeks shifts it by one rank, not three
   * weeks — which the average cannot do on a long tail. */
  medianSeconds: number;
  /** Number of tickets completed in this median. */
  sample: number;
}

/** Statistics related to cycles (MIN-58), all scoped to the user. */
export interface StatsCycles {
  /** Average completion↔deadline gap, in days; negative = early, positive =
   * late. null if there are no completed tickets with a deadline. */
  avgCompletionOffsetDays: number | null;
  /** Number of tickets in the average rate. */
  completionOffsetSample: number;
  /** Average number of tickets per cycle started; null if no cycle. */
  avgIssuesPerCycle: number | null;
  /** Number of started cycles taken into account. */
  cycleCount: number;
  /** Median completion time per effort (xs→xl), efforts without sample
   * omitted. */
  byEffort: StatsCycleEffort[];
}

export interface UserStats {
  totals: StatsTotals;
  /** Live, non-deleted issues represented by the named breakdowns below. */
  breakdownTotal: number;
  perProject: StatProjectBucket[];
  perCategory: StatCategoryBucket[];
  perObjective: StatObjectiveBucket[];
  heatmap: StatsHeatmap;
  workload: StatsWorkload;
  week: StatsWeek;
  cycles: StatsCycles;
}

export interface IssueEvent {
  id: string;
  /** Exactly one of issue_id / objective_id / feedback_post_id / page_id is set
      (the event's parent — issue_events_parent_ck). */
  issue_id: string | null;
  objective_id?: string | null;
  /** A wiki PAGE (MIN-278): created, modified, trashed. */
  page_id?: string | null;
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
  /** The model chose this assignee according to the assignment rules. False
 when Smart Assign has decided without AI (solo project, no written rule,
 call failed): the timeline does not say the same sentence. */
  smart_assign_ai?: boolean;
  /** Smart-fill (MIN-260) filled the ticket when it was created — the
 timeline shows “Smart-fill” as an actor, not the person who wrote the
 ticket: she did not set these properties. `to_value` carries the list
 of filled fields, separated by commas. */
  via_smart_fill?: boolean;
  /** The event was produced by a project automation (MIN-147) — the
 timeline shows the automation as the actor, not the user whose id
 technically serves as the author of the entry. */
  via_automation?: boolean;
  /** Provider ('github' | 'gitlab') when the event comes from the synchronization of
 from the linked repository (MIN-97) — the timeline displays the forge as actor,
 not the member whose id technically serves as author of the writing. */
  forge_sync?: string | null;
  created_at: string;
}

export interface CreateObjectiveInput {
  name: string;
  description?: string | null;
  status?: ObjectiveStatus;
  lead_user_id?: string | null;
  target_date?: string | null;
  color?: string | null;
  resources?: ResourceInput[];
  /** Cross-project creation: files the browser uploaded under the SOURCE
      project's storage prefix. Same rule as issues — a storage object can't be
      referenced across projects, so the server COPIES each into the target.
      Links need no copy and ride `resources`. */
  copy_resources?: ResourceInput[];
}

/** Field changes Numo applies to an objective from a voice transcript — the
 *  objective twin of {@link IssueDraftPatch}. In the create dialog it patches
 *  the client-side form; in the side panel the client saves it right away. */
export interface ObjectiveDraftPatch {
  name?: string;
  description?: string;
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
  /** Icon imported from the live site's favicon (public storage URL); the UI
      falls back to the generated orb when null. */
  icon_url: string | null;
  /** Seed of the orb generated, when the draw was restarted. `null` = never
 restarted, and the seed remains the id — always read via `projectOrbSeed()`. */
  orb_seed: string | null;
  /** Smart Assign: auto-assign unassigned issues past triage (opt-in, owner-set). */
  smart_assign_enabled: boolean;
  /** Automatically assign new issues to the project lead or available member. */
  auto_assign_enabled: boolean;
  /** Smart Assign rules, user_id → free text describing the member's preferred
      tasks (kept on the project — the owner has no project_members row). */
  smart_assign_rules: Record<string, string>;
  /** Numo reviews incoming feedback (categorize, junk, sensitive) before it is
      published. Off means feedback goes out as submitted. */
  feedback_review_enabled: boolean;
  /** When the review is on but the owner's AI budget is spent: publish without
      review instead of holding the feedback back. */
  feedback_review_skip_over_budget: boolean;
  /** Numo translates feedback written in a language other than that of
 the team, during the same review pass. */
  feedback_translate_enabled: boolean;
  /** Team language (ISO 639-1) — the one to which we translate. `null` =
 never entered: the review falls back to the default locale of the app. */
  feedback_team_language: string | null;
  /** Languages ​​that we read without help, left as they are. */
  feedback_no_translate_languages: string[];
  /** Project automations (MIN-147): the general switch of the chained Numo
 loop. Off = the rules remain written but nothing is triggered. */
  automations_enabled: boolean;
  /** `when … if … then …` rules, such as `parseAutomations` reads.
 Delivered by a preset, then editable. */
  automations: AutomationRule[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateProjectInput {
  /** Id imposed by the client (creation wizard) — see POST /api/projects. */
  id?: string;
  /** Seed of the orb restarted during the wizard, if it was (otherwise `null`
 and the id is used). */
  orb_seed?: string | null;
  name: string;
  key: string;
  color?: string | null;
  smart_assign_enabled?: boolean;
  auto_assign_enabled?: boolean;
  /** Language of the interface at the time of creation (MIN — translation of
 returns): it becomes the language of the project team. */
  locale?: string;
}

export interface ProjectUpdateInput {
  name?: string;
  key?: string;
  color?: string | null;
  smart_assign_enabled?: boolean;
  auto_assign_enabled?: boolean;
  smart_assign_rules?: Record<string, string>;
  feedback_review_enabled?: boolean;
  feedback_review_skip_over_budget?: boolean;
  feedback_translate_enabled?: boolean;
  feedback_team_language?: string | null;
  feedback_no_translate_languages?: string[];
  automations_enabled?: boolean;
  automations?: AutomationRule[];
}

export interface Member {
  user_id: string;
  email: string | null;
  full_name: string | null;
  /** Seed of the generated avatar (public.user_avatars), never an image URL. */
  avatar_seed: string;
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
/** Slim integration reference the global board needs to offer an integration
    filter facet across every project (the full Integration row is owner-only
    detail — here we only need to name and match it). */
export interface IntegrationRef {
  id: string;
  name: string;
  project_id: string;
}

/**
 * A ticket from the current cycle such as the dashboard needs (MIN-89) —
 * enough to DISPLAY it (identification, title, status) and ORDER it (priority,
 * effort, categories for the rec score). Neither description nor plan: the home never
 * never returns them, and they are the ones that weigh in the payload of the board.
 */
export interface HomeSummaryIssue {
  id: string;
  project_id: string;
  number: number;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  /** Displayed by the “Near Deadlines” section (MIN-96), which also uses
 — along with `effort` — to decide who enters. */
  due_date: string | null;
  cycle_id: string | null;
  category_ids: string[];
  /** How long the ticket has been waiting — displayed and sorted by the
 “To sort” section (MIN-104), which puts what has been waiting the longest at the top. */
  created_at: string;
  /** Last movement of the ticket. It is he, not `created_at`, that the
 card “Waiting for me” reads: a replay ticket has been waiting since
 was entered, not since it was written. */
  updated_at: string;
}

/**
 * A return not yet decided by the team, such as the “To be sorted” section of
 * the reception needs it (MIN-104): what to name it, weigh it (the votes) and date it
 *. Neither the submitted text nor the facets — that's the feedback page.
 */
export interface HomeSummaryFeedback {
  id: string;
  project_id: string;
  title: string;
  vote_count: number;
  created_at: string;
}

/**
 * A project where Smart Assign is running without really being set: it is active, it
 * has several members, and at least one of them (including the owner) does not have a
 * assignment rule. Without a rule, the pattern has nothing to match —
 * lib/server/smart-assign.ts then falls back to owner.
 */
export interface SmartAssignConfigWarning {
  projectId: string;
  projectName: string;
  /** Members without written rules. */
  missingCount: number;
  /** Team size, including owner — always > 1 here. */
  memberCount: number;
}

/** Response from GET /api/me/smart-assign-warnings. */
export interface SmartAssignWarningsResponse {
  warnings: SmartAssignConfigWarning[];
}

/**
 * What's waiting to be sorted in a project — the two halves of the
 * "To be sorted" queue in Home (MIN-104), counted separately because they are
 * exactly the two counters that the Sorting and Feedback tabs
 * will carry once we ENTER the project. The sidebar project line
 * displays their sum, and it has to be right.
 */
export interface ProjectTriageCount {
  /** Tickets en statut `triage`. */
  triage: number;
  /** Canonical returns still open or planned (`open` | `planned`). */
  feedback: number;
}

/**
 * Response from GET /api/me/triage-counts, indexed by project id. A project
 * whose queue is empty is ABSENT from the table rather than present at zero: the common case is "nothing to sort anywhere", and it then costs nothing.
 */
export interface TriageCountsResponse {
  counts: Record<string, ProjectTriageCount>;
}

/** Response from GET /api/me/summary — the dashboard payload. */
export interface HomeSummaryResponse {
  /**
   * Aggregated counter, calculated in SQL: no lines cross the network. All
   * statuses combined — onboarding asks “have you already created a ticket?” »,
   * not “do you have one open?” .
   */
  counts: { total: number };
  cycles: BoardCycles;
  /** Tickets in the current cycle (empty when there is no active cycle). */
  cycleIssues: HomeSummaryIssue[];
  /**
   * Open tickets whose deadline is approaching (MIN-96), already sorted from most urgent
   * to least urgent. The window depends on the effort — lib/due-soon.ts — and the
   * sort is done here because "days remaining" is counted in the user's timezone, which only the server knows (`tz` parameter).
   */
  dueSoon: HomeSummaryIssue[];
  /**
   * “To be sorted” file (MIN-104), first half: tickets in triage status,
   * all projects combined, the oldest first. Truncated — `triageTotal`
   * gives the actual count, hence the “+N others” in the section.
   */
  triage: HomeSummaryIssue[];
  triageTotal: number;
  /**
   * “To be sorted” queue, second half: returns that the team has not yet decided (`status = 'open'`), oldest first. Two lists rather
   * than a single scrum: the section reserves a floor of lines for returns,
   * otherwise a late sorting — always older — would bury them all.
   */
  newFeedback: HomeSummaryFeedback[];
  newFeedbackTotal: number;
  /** Relations touching a cycle ticket — the recommendation order accounts for blockers. */
  relations: IssueRelation[];
  /** Status of blocking tickets located OUTSIDE the cycle, indexed by id. */
  blockerStatuses: Record<string, IssueStatus>;
}

export interface GlobalBoardResponse {
  issues: Issue[];
  members: Record<string, Member[]>;
  categories: Record<string, Category[]>;
  objectives: Record<string, Objective[]>;
  /** Integrations across the user's accessible projects, keyed by project id —
      feeds the cross-project integration filter (issues carry integration_id). */
  integrations: Record<string, IntegrationRef[]>;
  /** Stored relation rows across the user's accessible projects (RLS-scoped):
      `blocks` feeds the cycle reco ordering, the full set feeds the cards'
      relation chips and the side panel. */
  relations: IssueRelation[];
  cycles: BoardCycles;
}

/* ── Command-palette search index (MIN-91) ─────────────────────────────────
   The palette searches every ticket and every objective of every project from
   any page. Sending full rows for that would mean shipping every description
   and every implementation plan (up to 64 Ko each) on a read nobody asked for,
   so the index carries only what a *row* needs: what to display, what to match
   on, and the few fields the ⌘; actions patch. Anything heavier (description,
   plan) is fetched per issue, on demand. */

/** One ticket as the palette lists it (GET /api/me/search-index). */
export interface SearchIndexIssue {
  id: string;
  project_id: string;
  number: number;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  assignee_id: string | null;
  objective_id: string | null;
  updated_at: string;
}

/** One objective as the palette lists it (GET /api/me/search-index). */
export interface SearchIndexObjective {
  id: string;
  project_id: string;
  name: string;
  status: ObjectiveStatus;
  color: string | null;
}

/**
 * A wiki page like the palette list (GET /api/me/search-index).
 *
 * The TITLE alone, never the body (MIN-276): send the documents of all my
 * projects in the browser to be able to filter them when typing would pay
 * the entire wiki every time you open a tab. The content is searched on the server side, offline — GET /api/me/pages/search.
 */
export interface SearchIndexPage {
  id: string;
  project_id: string;
  title: string;
  icon: string | null;
  updated_at: string;
}

/**
 * A page found by its CONTENT (GET /api/me/pages/search, MIN-276).
 *
 * `excerpt` is what distinguishes this result from an index row: the passage
 * of the responding body. On a search by content, the title alone doesn't tell
 * why the page comes up — and that's exactly half that was missing.
 */
export interface PageSearchHit {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  updated_at: string;
  excerpt: string;
  /** The Postgres score (`ts_rank_cd`) — the order of the server, to keep. */
  rank: number;
}

/**
 * What CITES a page (MIN-279) — a line in the "Cited by" panel.
 *
 * A single form for the three source genres, and for both ORIGINS:
 * the genre resource `page` (MIN-275) and the mention in a text. The
 * sign doesn't distinguish them — "who relies on this page?" » is a question ;
 * whether the answer is a pill or a sentence is not a question.
 */
export interface PageBacklink {
  kind: "issue" | "objective" | "page";
  id: string;
  /** “MIN-42” for a ticket; `null` for a goal or page. */
  identifier: string | null;
  /** The title of a ticket or page, the name of an objective. */
  title: string;
  /** The emoji of a page; `null` elsewhere. */
  icon: string | null;
  /** The color of a lens — it travels with it everywhere. */
  color: string | null;
  /** When the quote was asked: order within a genre. */
  at: string;
}

export interface SearchIndexResponse {
  issues: SearchIndexIssue[];
  objectives: SearchIndexObjective[];
  pages: SearchIndexPage[];
  /** Members by project id — the ⌘; “assigned” picker needs the members of the
   *ticket's* project, which may not be the project the user is looking at. */
  members: Record<string, Member[]>;
  /** Categories by project id — “copy prompt” lists category names. */
  categories: Record<string, Category[]>;
  /** True when the row cap kicked in (oldest-updated rows were dropped). */
  truncated: boolean;
}

/**
 * A pending invitation, as the API renders it. **Without
 * `invited_user_id`**, and that's the point: the column exists in base (it
 * attaches the invitation to an account, cf. `attachPendingInvitations`), but the
 * return to the client would say, for any address that we enter, if it a
 * a minddy account — an account enumeration oracle, open to any member of the
 * project. The server reads it, the client does not see it.
 */
export interface Invitation {
  id: string;
  project_id: string;
  invited_email: string;
  status: string;
  created_at: string;
}

export interface MembersResponse {
  members: Member[];
  invitations: Invitation[];
  isOwner: boolean;
}

/**
 * What a `?invite=<token>` allows to say on the login screen (MIN-197).
 * Resolved on the server side (`lib/server/invitation-token.ts`) and passed to the form.
 */
export interface InvitationPreview {
  projectName: string;
  /** Empty if the inviter's account has no name or readable email. */
  inviterName: string;
  invitedEmail: string;
}

/** A pending invitation as shown to the invitee on their Home banner. */
export interface MyInvitation {
  id: string;
  project_id: string;
  project_name: string;
  project_key: string;
  inviter_email: string | null;
  inviter_name: string | null;
  /** Seed of the generated avatar of the inviter (public.user_avatars). */
  inviter_avatar_seed: string | null;
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
  /** Repeat rate (MIN-136), null for an ordinary ticket. When it
 is set, `due_date` carries the NEXT occurrence: the ticket passed to
 `done` recreates its successor and transmits the cadence to it. */
  recurrence: RecurrenceCadence | null;
  /** Id of the first ticket in the series, inherited by each occurrence — enabling
 to find the history of a recurrence. None out of series. */
  recurrence_series_id: string | null;
  /** Force automations on THIS ticket (MIN-147). Null = it follows the
 project rules; otherwise it opts out, or plays another preset. */
  automation_override?: AutomationOverride | null;
  position: number;
  created_by: string | null;
  /** Set when the issue was created through a project integration (Feedback API). */
  integration_id?: string | null;
  /** Remote issue of which this ticket is the mirror (MIN-97) — placed together at
 the import from the linked repository, all null for a ticket born in minddy.
 `remote_number` = `number` GitHub / `iid` GitLab. */
  remote_provider?: RepoProviderId | null;
  remote_repo_id?: string | null;
  remote_number?: number | null;
  remote_url?: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** The personal cross-project cycle this issue belongs to (MIN-32), if any.
      Invariant (SQL trigger): a cycled issue is assigned to the cycle's owner. */
  cycle_id: string | null;
  category_ids: string[];
  /** Count of issue-LEVEL resources, files and links alike (the ones on
 comments excluded). Only the board list endpoint populates it; undefined
 elsewhere. Used by “copy prompt” to flag resources in the XML
 without a per-card fetch. */
  resource_count?: number;
}

/**
 * What a ticket CARD displays, and nothing more (MIN-342).
 *
 * `IssueCardBody` took an entire `Issue`. On internal surfaces it is
 * of no consequence — but a server component serializes in its HTML everything that
 * that it passes to a client component, and on `/share/[token]` this HTML is read
 * by an anonymous: `plan`, `created_by`, `position`, `cycle_id` left with,
 * to never be displayed.
 *
 * Hence this type: the card declares what it reads, a complete `Issue` remains assigned to it
 * (internal surfaces do not change by one character), and the
 * public surface constructs an explicit PROJECTION — `toPublicIssue` in
 * [lib/public-board-projection.ts](lib/public-board-projection.ts).
 */
export interface IssueCardIssue {
  id: string;
  project_id: string;
  number: number;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  assignee_id: string | null;
  objective_id: string | null;
  due_date: string | null;
  recurrence: RecurrenceCadence | null;
  category_ids: string[];
  /** Markdown of the plan. Optional, and that's the point: the card only gets progress ("3/5") from it, so a public showing omits it — and the document itself never leaves the server. */
  plan?: string | null;
  integration_id?: string | null;
  remote_provider?: RepoProviderId | null;
  remote_number?: number | null;
  remote_url?: string | null;
}

/** The objective as a map shows it: a tablet and a name. */
export type IssueCardObjective = Pick<Objective, "id" | "name" | "color">;

/** The category as a map shows it: a sticker and a name. */
export type IssueCardCategory = Pick<Category, "id" | "name" | "color">;

/**
 * An active recurrence of the project, such as the "Recurrences" page of the
 * parameters needs it (MIN-136): what to name it, say its cadence, its
 * next deadline and who carries it. A single living ticket per series carries
 * a `recurrence` — it is therefore indeed a line per recurrence.
 */
export interface RecurringIssue {
  id: string;
  number: number;
  title: string;
  status: IssueStatus;
  assignee_id: string | null;
  due_date: string | null;
  recurrence: RecurrenceCadence;
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
  /** A blocking relation whose blocker is closed (done/canceled/duplicate) no
      longer constrains: it's kept in the DB but surfaced as resolved rather than
      as an active blockage. Always false for `related`, and false whenever the
      resolver was called without issue statuses. */
  resolved: boolean;
}

export interface CreateIssueRelationInput {
  source_id: string;
  target_id: string;
  /** Relation type from `source_id`'s perspective. */
  type: IssueRelationType;
}

export type IntegrationWebhookEvent =
  "issue.created" | "issue.status_changed" | "issue.updated";
export type IntegrationWebhookScope = "integration" | "all";
/** Dedicated use of an mdy_ key: creation of issues or submission of feedback. */
export type IntegrationKind = "issues" | "feedback";

export interface Integration {
  id: string;
  name: string;
  kind: IntegrationKind;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  /** NULL = webhook disabled (events/scope kept for reactivation). */
  webhook_url: string | null;
  webhook_events: IntegrationWebhookEvent[];
  webhook_scope: IntegrationWebhookScope;
  webhook_last_status: string | null;
  webhook_last_at: string | null;
}

export interface CreateIssueInput {
  /** The id that the client has ALREADY given to its optimistic card (lib/optimistic-issue.ts).
 The line is born with: this is what allows the real-time bridge to recognize
 the broadcast of OUR creation and not to copy it next to the card.
 Absent (cancellation of a deletion, MCP, integrations) = the server pull
 the id itself. */
  id?: string;
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
  /** Repeat rate (MIN-136) — requires a `due_date`, which then has the first occurrence of
. */
  recurrence?: RecurrenceCadence | null;
  /**
   * Smart-fill (MIN-260): the server reads the title and description and fills
   * itself priority, effort, categories and objective BEFORE inserting the line
   * — what is placed by hand always wins. Sent by the sole modal of
   * creation, when the account toggle is armed and the author has not cut it for this ticket.
   *
   * It also changes the way the card arrives on the screen: no card
   * optimistic (it would be empty during filling), a toast instead.
   * See `createIssue` in [use-issues-query](use-issues-query.ts).
   */
  smart_fill?: boolean;
  category_ids?: string[];
  /** Cross-project creation carries category NAMES, not IDs (a category ID is
      scoped to one project). The server matches them against the target
      project's categories by name and keeps the ones that exist. */
  category_names?: string[];
  resources?: ResourceInput[];
  /** Cross-project creation: files the browser uploaded under the SOURCE
      project's storage prefix. A storage object can't be referenced across
      projects, so the server COPIES each into the target project (after
      checking the actor can reach the source) and registers the copy. Links
      need no copy and ride `resources`. */
  copy_resources?: ResourceInput[];
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
  /** Repeat rate (MIN-136). Setting a cadence requires a deadline;
 clearing the deadline cuts the recurrence. */
  recurrence?: RecurrenceCadence | null;
  position?: number;
  /** Setting a cycle assigns the issue to the cycle's owner as a side-effect
      (never bumps status); null removes it from its cycle. */
  cycle_id?: string | null;
  /** Force automations on this ticket (MIN-147); null = follows the project. */
  automation_override?: AutomationOverride | null;
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
  /** Remove recurring tickets from the table (MIN-136): the maintenance which
 comes back every week is not what we read there. */
  hideRecurring?: boolean;
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

/**
 * A SAVED VIEW — a screen retained from the command palette, not to
 * with `View` just above (the filters of a kanban). This
 * only knows an internal address, and it is strictly personal.
 */
export interface SavedView {
  id: string;
  user_id: string;
  name: string;
  /** Chemin absolu interne, query comprise (`/projects/x/objectives?open=y`). */
  href: string;
  created_at: string;
  updated_at: string;
}

/** Public-link sharing level of a view — "private" = no share row exists. */
export type ViewShareLevel = "private" | "password" | "public";

/** Owner-facing share state (what the share API returns; null = private).
    The token is the /share/<token> URL capability. */
export interface ViewShare {
  level: Exclude<ViewShareLevel, "private">;
  token: string;
}

/**
 * The publishing status of a wiki PAGE (MIN-283), as its owner
 * reads. Same token, same table as sharing a view — no longer the only
 * setting that has no meaning on a document: does the branch start with the
 * page.
 *
 * No indexing setting: a published page is ALWAYS `noindex`. The
 * link is the secret, as for a shared view.
 */
export interface PageShare {
  level: Exclude<ViewShareLevel, "private">;
  token: string;
  include_children: boolean;
}

// ── Git integration (MIN-47) ──────────────────────── ────────────────────────

/** Minddy project linking a git connection (displayed during disconnect). */
export interface GitConnectionProjectRef {
  id: string;
  name: string;
}

/**
 * An account-level git connection (git_connections), SANITIZED: no
 * token column is ever exposed to the client. `projects` = projects that
 * reuse this connection (to prevent "disconnecting unbinds these projects").
 */
export interface GitConnection {
  id: string;
  provider: RepoProviderId;
  account_login: string | null;
  account_type: string | null;
  installation_id: number | null;
  created_at: string;
  updated_at: string;
  projects: GitConnectionProjectRef[];
}

/**
 * A user's PERSONAL git account (git_user_identities), SANITIZED —
 * MIN-144. It is he who signs the human gestures on a pull request, where
 * `GitConnection` says “the App is installed on this account”. No column of
 * token is ever exposed to the client.
 */
export interface GitIdentity {
  id: string;
  provider: RepoProviderId;
  account_login: string | null;
  account_avatar_url: string | null;
  created_at: string;
  /**
   * Where does this account come from. `identity` = its own line, which disconnects here
   * (GitHub). `connection` = the OAuth connection of the account, which IS already
   * identity (GitLab): disconnecting it would unlink the project repositories, so
   * this is done in “Connected git accounts”, not here.
   */
  source: "identity" | "connection";
}

/** The project ↔ repository link (project_git_links), as returned to the UI. */
export interface ProjectGitLink {
  id: string;
  provider: RepoProviderId;
  connection_id: string;
  external_repo_id: string;
  repo_owner: string | null;
  repo_name: string | null;
  repo_full_name: string | null;
  default_branch: string | null;
  account_login: string | null;
  /** Unidirectional synchronization of depot exits → minddy (MIN-97). */
  issue_sync_enabled: boolean;
  /** Last successful backfill of open issues (null = never). */
  issue_sync_backfilled_at: string | null;
  created_at: string;
}

/**
 * State of an agent branch, from safest to delete to riskiest:
 * PR merged (work delivered), PR refused (work nowhere else), PR
 * open, no PR (fresh branch or session idle).
 */
export type AgentBranchState = "merged" | "closed" | "open" | "none";

/**
 * A branch that minddy pushed and which still lives on the repository (MIN-102):
 * `agent_runs` attests to its origin. `issue` is null for a run notebook, which
 * is not attached to any ticket; `prNumber`/`prUrl` are null without PR.
 */
export interface AgentBranch {
  branch: string;
  state: AgentBranchState;
  prNumber: number | null;
  prUrl: string | null;
  prCreatedAt: string | null;
  issue: { issueId: string; identifier: string; title: string } | null;
}

export interface AgentBranchesResponse {
  provider: RepoProviderId;
  repoFullName: string;
  branches: AgentBranch[];
  /** A paginated list of the forge has been cut: the overview is not exhaustive. */
  truncated: boolean;
}

/**
 * A project where cleaning up branches makes sense: I am the owner, a repository y
 * is linked, and agent runs have pushed branches there. Serves the command
 * palette, which offers the action from any page.
 */
export interface BranchCleanupTarget {
  project_id: string;
  provider: RepoProviderId;
  repo_full_name: string | null;
}

/** Exit of deleting ONE branch (`alreadyGone` = it had disappeared). */
export interface BranchDeletionResult {
  branch: string;
  ok: boolean;
  alreadyGone?: boolean;
  error?: string;
}

/** A candidate repository proposed in the selector (GitHub/GitLab neutral). */
export interface CandidateRepo {
  external_repo_id: string;
  owner: string | null;
  name: string;
  full_name: string;
  default_branch: string | null;
}

// ── Admin console (MIN-90) ────────────────────────────────────────────────────
// Exact mirror of what `/api/admin/users` and `/api/admin/overview` return.
// These screens are reserved for admins (`lib/server/admin.ts`): unlike
// from the rest of the app, they display the raw email — it's the identifier
// an admin works with (support, overrides, search).

/** An account, as shown in the “Users” view of the admin dashboard. */
export interface AdminUserRow {
  userId: string;
  /** Resolved display name (lib/display-name), never the raw email. */
  name: string;
  email: string | null;
  /** Seed of the generated avatar (public.user_avatars), never an image URL. */
  avatarSeed: string;
  createdAt: string;
  /** Last CONNECTION (does not move on token refresh). */
  lastSignInAt: string | null;
  /** Last sign of life, connection or trace of activity — cf. migration. */
  lastActivityAt: string | null;
  emailConfirmed: boolean;
  /**
   * INTERNAL account (team, demo, bot): it remains listed and administrable here,
   * but does not count in any overview statistics.
   */
  internal: boolean;
  /** Projects owned + projects joined. */
  projects: number;
  projectsOwned: number;
  /** Tickets for projects to which he has access. */
  issues: number;
  /** Tickets written in his hand. */
  issuesCreated: number;
  onboarding: {
    /** Onboarding was presented to him at least once. */
    started: boolean;
    completed: number;
    total: number;
    allComplete: boolean;
    dismissed: boolean;
    /** Step in progress, null if everything is completed. */
    currentStep: string | null;
  };
  billing: {
    planId: BillingPlanId;
    /** Mirror of BillingPlanSource (lib/server/billing-accounts, server-only). */
    source: "admin_override" | "stripe" | "default";
    override: BillingPlanId | null;
    overrideNote: string | null;
    /** End of the free plan (ISO) — null = unlimited, or no override. */
    overrideExpiresAt: string | null;
    stripePlanId: string | null;
    stripeStatus: string | null;
  };
  usage: {
    /** Monthly budget included by their plan (gross cost USD). */
    budgetUsd: number;
    /** What budget really matters (real window + reset). */
    spentUsd: number;
    /** Actual spending for the calendar month — intact after a reset. */
    spentMonthUsd: number;
    calls: number;
    blocked: boolean;
    /** The LAST admin reset, if there is one: it sets the
     * start of the counted window. The full period register reads
     * `GET /api/admin/agent-quota?userId=`. */
    resetAt: string | null;
  };
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  /** Number of accounts matching the search, before pagination. */
  total: number;
}

/** A reset of the usage budget, as the admin sees it. */
export interface AdminQuotaReset {
  id: string;
  at: string;
}

/**
 * `GET|POST|DELETE /api/admin/agent-quota` — the register of resets of
 * the current billing period, and what the budget counts AFTER the gesture
 * (removing a reset reopens the window: the amount goes up).
 */
export interface AdminQuotaResetsResponse {
  periodStart: string;
  /** From newest to oldest; the first is authentic. */
  resets: AdminQuotaReset[];
  usage: {
    spentUsd: number;
    blocked: boolean;
  };
}

/** One day in the overview activity series. */
export interface AdminOverviewDay {
  day: string;
  signups: number;
  active: number;
}

/**
 * Everything this object carries EXCLUDES internal accounts — that's the point of
 * the big picture. `internalUsers` says how many have been set aside, so that a falling figure remains explainable.
 */
export interface AdminOverview {
  totalUsers: number;
  internalUsers: number;
  newUsers7d: number;
  newUsers30d: number;
  activeToday: number;
  active7d: number;
  active30d: number;
  totalProjects: number;
  totalIssues: number;
  days: AdminOverviewDay[];
  /** Accounts by effective plan (admin override → Stripe → free). */
  plans: Array<{ planId: BillingPlanId; count: number }>;
  onboarding: {
    /** Accounts to which onboarding has been presented. */
    started: number;
    /** Among them, those who have completed the four stages. */
    completed: number;
    /** Among them, those who have explicitly passed it. */
    dismissed: number;
  };
}

/**
 * A day of the Finance page (MIN-92). The series is DENSIFIED on the SQL side:
 * a day without an AI call is a zero bar, not a hole.
 */
export interface AdminFinanceDay {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  costUsd: number;
  /** `null` as long as no rate is known — as distinguished from “zero euros”. */
  costEur: number | null;
  /** COMPLETE receipts, on the day they fall — never smoothed. */
  revenueEur: number;
  marginEur: number | null;
  usdEur: number | null;
  calls: number;
  runs: number;
}

/**
 * The payload of `/api/admin/finance`. `days` carries the curve (smoothed income),
 * `month` carries the REAL unsmoothed numbers of the tiles: the two do not
 * add up, and that is intended.
 */
export interface AdminFinance {
  windowDays: number;
  days: AdminFinanceDay[];
  month: {
    /** Collected net of Stripe fees AND reimbursements, in the current month. */
    netCollectedEur: number;
    stripeFeesEur: number;
    costUsd: number;
    costEur: number | null;
    marginEur: number | null;
  };
  /** Theoretical recurring revenue — indicator, never the basis of the margin. */
  mrrEur: number;
  payingAccounts: number;
  byPlan: Array<{ planId: BillingPlanId; count: number; mrrEur: number }>;
  /** Most recent applied rate, with its date (a silent cron becomes visible). */
  fx: { day: string; usdEur: number } | null;
  /** Monthly cap for the OpenRouter key. `null` if unreadable. */
  cap: {
    limitUsd: number | null;
    usageUsd: number;
    remainingUsd: number | null;
    percent: number | null;
    /** First day of the following month: reset of the ceiling. */
    resetDay: string;
    projectedExhaustionDay: string | null;
  } | null;
  stripe: {
    configured: boolean;
    reachable: boolean;
    /** `sk_test_` key: the API is the same, the amounts are not real. */
    testMode: boolean;
    /** Ledger paging interrupted by the guardrail. */
    truncated: boolean;
    /** At least one line in a currency other than EUR was ignored. */
    ignoredCurrency: boolean;
  };
  /** Instant of Stripe reading — the UI gets “refreshed X min ago”. */
  fetchedAt: string;
}
