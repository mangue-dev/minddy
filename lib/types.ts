import type { IssueStatus, IssuePriority, IssueEffort } from "./issue-constants";
import type { ObjectiveStatus } from "./objective-constants";
import type { CycleIntensity } from "./cycle-prefs";
import type { RepoProviderId } from "./repo-providers";
import type { BillingPlanId } from "./billing-plans";

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
  /** Exactly one of issue_id / objective_id / feedback_post_id is the parent. */
  issue_id: string | null;
  objective_id: string | null;
  feedback_post_id?: string | null;
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
  /** Lifecycle of an @Numo comment reply: 'working' while generating (body and
      assistant_tool update live), then 'done' or 'error'. Null = normal comment. */
  assistant_status?: "working" | "done" | "error" | null;
  /** Tool currently executing while assistant_status='working' (shown live). */
  assistant_tool?: string | null;
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
  | "feedback_new";

/** A notification enriched for the Inbox UI. */
export interface MyNotification {
  id: string;
  type: NotificationType;
  read_at: string | null;
  created_at: string;
  issue_id: string | null;
  issue_number: number | null;
  issue_title: string | null;
  /** Set instead of the issue fields when the notification points at an objective. */
  objective_id: string | null;
  objective_name: string | null;
  /** Set instead of the issue/objective fields when it points at a feedback post. */
  feedback_post_id: string | null;
  feedback_title: string | null;
  project_id: string | null;
  project_key: string | null;
  actor_name: string | null;
  /** First characters of the comment that triggered a mention/comment row. */
  comment_excerpt: string | null;
}

// ── Statistiques utilisateur (MIN-12) ────────────────────────────────────────
export interface StatsTotals {
  created: number;
  completed: number;
  projects: number;
  /** Tâches cochées dans le carnet, cumulées : le carnet étant une note libre
   *  (on y coche puis on supprime), ce total vient du ledger, pas de la note. */
  tasksCompleted: number;
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
  /** Tout ce qui a été terminé ce jour-là = `issues` + `tasks`. */
  count: number;
  /** Tickets passés en Terminé ce jour-là. */
  issues: number;
  /** Tâches cochées dans le carnet ce jour-là. */
  tasks: number;
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

/** Élan récent : ce qui a été terminé sur 7 jours glissants, et la même mesure
 *  sur les 7 jours d'avant pour donner la tendance. */
export interface StatsWeek {
  /** Tickets terminés + tâches cochées sur les 7 derniers jours (aujourd'hui inclus). */
  completed: number;
  /** Part des tickets dans `completed`. */
  issues: number;
  /** Part des tâches du carnet dans `completed`. */
  tasks: number;
  /** Même total sur les 7 jours précédents — la base de comparaison. */
  previous: number;
}

/** Temps moyen de complétion pour un niveau d'effort (MIN-58). */
export interface StatsCycleEffort {
  effort: "xs" | "s" | "m" | "l" | "xl";
  /** Moyenne du « cycle time » (premier in_progress → done), en secondes. */
  avgSeconds: number;
  /** Nombre de tickets terminés dans cette moyenne. */
  sample: number;
}

/** Statistiques liées aux cycles (MIN-58), toutes scopées à l'utilisateur. */
export interface StatsCycles {
  /** Écart moyen complétion↔échéance, en jours ; négatif = en avance, positif =
   *  en retard. null s'il n'y a aucun ticket terminé avec une échéance. */
  avgCompletionOffsetDays: number | null;
  /** Nombre de tickets dans la moyenne de cadence. */
  completionOffsetSample: number;
  /** Nombre moyen de tickets par cycle démarré ; null si aucun cycle. */
  avgIssuesPerCycle: number | null;
  /** Nombre de cycles démarrés pris en compte. */
  cycleCount: number;
  /** Durée moyenne de complétion par effort (xs→xl), efforts sans échantillon
   *  omis. */
  byEffort: StatsCycleEffort[];
}

export interface UserStats {
  totals: StatsTotals;
  perProject: StatProjectBucket[];
  heatmap: StatsHeatmap;
  workload: StatsWorkload;
  week: StatsWeek;
  cycles: StatsCycles;
}

export interface IssueEvent {
  id: string;
  /** Exactly one of issue_id / objective_id is set (the event's parent). */
  issue_id: string | null;
  objective_id?: string | null;
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
  /** Icon imported from the live site's favicon (public storage URL); the UI
      falls back to the generated orb when null. */
  icon_url: string | null;
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateProjectInput {
  name: string;
  key: string;
  color?: string | null;
  smart_assign_enabled?: boolean;
  auto_assign_enabled?: boolean;
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
/** Slim integration reference the global board needs to offer an integration
    filter facet across every project (the full Integration row is owner-only
    detail — here we only need to name and match it). */
export interface IntegrationRef {
  id: string;
  name: string;
  project_id: string;
}

/**
 * Un ticket du cycle courant tel que le tableau de bord en a besoin (MIN-89) —
 * de quoi l'AFFICHER (identifiant, titre, statut) et l'ORDONNER (priorité,
 * effort, catégories pour le score reco). Ni description ni plan : la home ne
 * les rend jamais, et ce sont eux qui pèsent dans la charge utile du board.
 */
export interface HomeSummaryIssue {
  id: string;
  project_id: string;
  number: number;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  cycle_id: string | null;
  category_ids: string[];
}

/** Réponse de GET /api/me/summary — la charge utile du tableau de bord. */
export interface HomeSummaryResponse {
  /**
   * Compteurs agrégés, calculés en SQL : aucune ligne ne traverse le réseau.
   * `open` exclut triage ET les statuts clos ; `total` compte tout (l'onboarding
   * demande « as-tu déjà créé un ticket ? », pas « en as-tu un ouvert ? »).
   */
  counts: { open: number; inProgress: number; mine: number; total: number };
  cycles: BoardCycles;
  /** Tickets du cycle courant (vide quand il n'y a pas de cycle en cours). */
  cycleIssues: HomeSummaryIssue[];
  /** Relations touchant un ticket du cycle — l'ordre reco tient compte des blocages. */
  relations: IssueRelation[];
  /** Statut des tickets bloquants situés HORS du cycle, indexé par id. */
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

export interface SearchIndexResponse {
  issues: SearchIndexIssue[];
  objectives: SearchIndexObjective[];
  /** Members by project id — the ⌘; « assigné » picker needs the members of the
      *ticket's* project, which may not be the project the user is looking at. */
  members: Record<string, Member[]>;
  /** Categories by project id — « copier le prompt » lists category names. */
  categories: Record<string, Category[]>;
  /** True when the row cap kicked in (oldest-updated rows were dropped). */
  truncated: boolean;
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
  /** Count of issue-LEVEL attachments (comment attachments excluded). Only the
      board list endpoint populates it; undefined elsewhere. Used by « copier le
      prompt » to flag attachments in the XML without a per-card fetch. */
  attachment_count?: number;
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
  | "issue.created"
  | "issue.status_changed"
  | "issue.updated";
export type IntegrationWebhookScope = "integration" | "all";
/** Usage dédié d'une clé mdy_ : création d'issues ou dépôt de feedback. */
export type IntegrationKind = "issues" | "feedback";

export interface Integration {
  id: string;
  name: string;
  kind: IntegrationKind;
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
  /** Cross-project creation carries category NAMES, not IDs (a category ID is
      scoped to one project). The server matches them against the target
      project's categories by name and keeps the ones that exist. */
  category_names?: string[];
  attachments?: AttachmentInput[];
  /** Cross-project creation: files the browser uploaded under the SOURCE
      project's storage prefix. A storage object can't be referenced across
      projects, so the server COPIES each into the target project (after
      checking the actor can reach the source) and registers the copy. */
  copy_attachments?: AttachmentInput[];
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

// ── Intégration git (MIN-47) ────────────────────────────────────────────────

/** Projet minddy liant une connexion git (affiché lors du disconnect). */
export interface GitConnectionProjectRef {
  id: string;
  name: string;
}

/**
 * Une connexion git au niveau compte (git_connections), SANITISÉE : aucune
 * colonne de token n'est jamais exposée au client. `projects` = les projets qui
 * réutilisent cette connexion (pour prévenir « déconnecter délie ces projets »).
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

/** La liaison projet ↔ dépôt (project_git_links), telle que renvoyée à l'UI. */
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
  created_at: string;
}

/** Un dépôt candidat proposé dans le sélecteur (neutre GitHub/GitLab). */
export interface CandidateRepo {
  external_repo_id: string;
  owner: string | null;
  name: string;
  full_name: string;
  default_branch: string | null;
}

// ── Console d'administration (MIN-90) ────────────────────────────────────────
// Miroir exact de ce que renvoient `/api/admin/users` et `/api/admin/overview`.
// Ces écrans sont réservés aux admins (`lib/server/admin.ts`) : à la différence
// du reste de l'app, ils affichent l'email brut — c'est l'identifiant avec
// lequel un admin travaille (support, override, recherche).

/** Un compte, tel que la vue « Utilisateurs » du dashboard admin le montre. */
export interface AdminUserRow {
  userId: string;
  /** Nom d'affichage résolu (lib/display-name), jamais l'email brut. */
  name: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
  /** Dernière CONNEXION (ne bouge pas au rafraîchissement de jeton). */
  lastSignInAt: string | null;
  /** Dernier signe de vie, connexion ou trace d'activité — cf. la migration. */
  lastActivityAt: string | null;
  emailConfirmed: boolean;
  /**
   * Compte INTERNE (équipe, démo, bot) : il reste listé et administrable ici,
   * mais ne compte dans aucune statistique de la vue d'ensemble.
   */
  internal: boolean;
  /** Projets possédés + projets rejoints. */
  projects: number;
  projectsOwned: number;
  /** Tickets des projets auxquels il a accès. */
  issues: number;
  /** Tickets écrits de sa main. */
  issuesCreated: number;
  onboarding: {
    /** L'onboarding lui a été présenté au moins une fois. */
    started: boolean;
    completed: number;
    total: number;
    allComplete: boolean;
    dismissed: boolean;
    /** Étape en cours, null si tout est franchi. */
    currentStep: string | null;
  };
  billing: {
    planId: BillingPlanId;
    /** Miroir de BillingPlanSource (lib/server/billing-accounts, server-only). */
    source: "admin_override" | "stripe" | "default";
    override: BillingPlanId | null;
    overrideNote: string | null;
    stripePlanId: string | null;
    stripeStatus: string | null;
  };
  usage: {
    /** Budget mensuel inclus par son plan (USD de coût brut). */
    budgetUsd: number;
    /** Ce que le budget compte vraiment (fenêtre réelle + remise à zéro). */
    spentUsd: number;
    /** Dépense réelle du mois calendaire — intacte après une remise à zéro. */
    spentMonthUsd: number;
    calls: number;
    blocked: boolean;
    /** Filigrane de remise à zéro admin, s'il y en a un. */
    resetAt: string | null;
  };
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  /** Nombre de comptes correspondant à la recherche, avant pagination. */
  total: number;
}

/** Un jour de la série d'activité de la vue d'ensemble. */
export interface AdminOverviewDay {
  day: string;
  signups: number;
  active: number;
}

/**
 * Tout ce que porte cet objet EXCLUT les comptes internes — c'est le point de
 * la vue d'ensemble. `internalUsers` dit combien ont été mis de côté, pour
 * qu'un chiffre en baisse reste explicable.
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
  /** Comptes par plan effectif (override admin → Stripe → free). */
  plans: Array<{ planId: BillingPlanId; count: number }>;
  onboarding: {
    /** Comptes à qui l'onboarding a été présenté. */
    started: number;
    /** Parmi eux, ceux qui ont franchi les quatre étapes. */
    completed: number;
    /** Parmi eux, ceux qui l'ont explicitement passé. */
    dismissed: number;
  };
}

/**
 * Une journée de la page Finances (MIN-92). La série est DENSIFIÉE côté SQL :
 * une journée sans appel IA est une barre à zéro, pas un trou.
 */
export interface AdminFinanceDay {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  costUsd: number;
  /** `null` tant qu'aucun taux n'est connu — à distinguer de « zéro euro ». */
  costEur: number | null;
  /** Encaissements ÉTALÉS au prorata de leur période de service. */
  revenueEur: number;
  marginEur: number | null;
  usdEur: number | null;
  calls: number;
  runs: number;
}

/**
 * Le payload de `/api/admin/finance`. `days` porte la courbe (revenu lissé),
 * `month` porte les chiffres RÉELS non lissés des tuiles : les deux ne
 * s'additionnent pas, et c'est voulu.
 */
export interface AdminFinance {
  windowDays: number;
  days: AdminFinanceDay[];
  month: {
    /** Encaissé net de frais Stripe ET de remboursements, sur le mois courant. */
    netCollectedEur: number;
    stripeFeesEur: number;
    costUsd: number;
    costEur: number | null;
    marginEur: number | null;
  };
  /** Revenu récurrent théorique — indicateur, jamais la base de la marge. */
  mrrEur: number;
  payingAccounts: number;
  byPlan: Array<{ planId: BillingPlanId; count: number; mrrEur: number }>;
  /** Taux appliqué le plus récent, avec sa date (un cron muet devient visible). */
  fx: { day: string; usdEur: number } | null;
  /** Plafond mensuel de la clé OpenRouter. `null` si illisible. */
  cap: {
    limitUsd: number | null;
    usageUsd: number;
    remainingUsd: number | null;
    percent: number | null;
    /** Premier jour du mois suivant : la remise à zéro du plafond. */
    resetDay: string;
    projectedExhaustionDay: string | null;
  } | null;
  stripe: {
    configured: boolean;
    reachable: boolean;
    /** Clé `sk_test_` : l'API est la même, les montants ne sont pas réels. */
    testMode: boolean;
    /** Pagination du ledger interrompue par le garde-fou. */
    truncated: boolean;
    /** Au moins une ligne dans une devise autre que l'EUR a été ignorée. */
    ignoredCurrency: boolean;
  };
  /** Instant de la lecture Stripe — l'UI en tire « actualisé il y a X min ». */
  fetchedAt: string;
}
