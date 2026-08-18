/**
 * captures/ — configuration and authorized perimeter.
 *
 * This file is the SOURCE OF TRUTH for the writing scope. No writing
 * in base cannot go beyond what is declared here. Expanding the scope is
 * a deliberate decision: we must modify this file, and therefore see it pass
 * in a Git diff.
 */

/**
 * The demo account. Everything the capture scripts create belongs to it.
 * The reason serves as a safeguard: we refuse to delete a user whose
 * l'email ne correspond pas.
 */
export const DEMO_EMAIL = "captures-demo@minddy.app";
export const DEMO_EMAIL_PATTERN = /^captures-demo(\+[a-z0-9-]+)?@minddy\.app$/;

/**
 * How each table relates to the demo world.
 *
 * A line is only “ours” if ALL anchors declared here are
 * satisfied. A table without any anchoring is refused when declared: without
 * anchor, nothing would distinguish a demo line from a real line.
 *
 * writable — false = the table only serves as an anchor point (we
 * reads to validate the children), we never write there.
 * ownerColumn — column pointing to `auth.users` which attaches the row to the
 * demo account. Must be worth a demo family id.
 * projectColumn — column pointing to `projects`: must be for a demo project.
 *  userRefColumns — toute autre colonne pointant `auth.users` : si non nulle,
 * it must target a member of the demo family. This is what
 * which prevents a ticket from being assigned to a real user.
 * parents — indirect attachment: the value must be the id of a
 * ALREADY PROVEN demo row in parent table. It is
 * as well as tables without project_id or user_id (votes,
 * messages, events) remain locked within the perimeter.
 *
 * The declaration order is a dependency order: a parent is always
 * declared before its children, because `openDemoWorld` resolves identifiers
 * demo table by table, in that order.
 *
 * Practical consequence for scripts: a child cannot be inserted
 * only AFTER its parent has been applied (a `plan.apply()` refreshes the
 * world). Inserting a post and its votes in the same plan fails — and that's
 * voluntary, this is what makes verification possible.
 */
export const TABLE_SCOPES = {
  // ── Socle ────────────────────────────────────────────────────────────────
  projects: {
    writable: true,
    ownerColumn: "owner_id",
    userRefColumns: ["owner_id"],
  },
  project_members: {
    writable: true,
    ownerColumn: "user_id",
    projectColumn: "project_id",
    userRefColumns: ["user_id", "added_by"],
  },
  issues: {
    writable: true,
    ownerColumn: "created_by",
    projectColumn: "project_id",
    userRefColumns: ["created_by", "assignee_id"],
  },
  // The six labels of a project. They came from a trigger which named them
  // in FRENCH whatever the user's language; it is now
  // `POST /api/projects` which sows them, translated (migration 20260904090000).
  // The seeds write in the database without going through the app, they place them themselves,
  // in English like the rest of the demo world (`_categories.mjs`), and
  // `013-categories-en.mjs` renamed those that already existed.
  categories: {
    writable: true,
    projectColumn: "project_id",
  },
  // Ticket ↔ category connection. No own column: the row is not
  // acceptable only if the ticket AND the category concerned are themselves proven
  // demo.
  issue_categories: {
    writable: true,
    parents: [
      { column: "issue_id", table: "issues" },
      { column: "category_id", table: "categories" },
    ],
  },

  // ── Plan du compte ───────────────────────────────────────────────────────
  // `admin_override_plan_id` is the lever provided by the diagram to offer a
  // plan without going through Stripe (“offer Pro to a tester”), and it is
  // PRIORITY on Stripe state (resolvePlanFromBillingAccount). We do not write
  // than this column: no Stripe line is created, no payment, no
  // subscription. The demo account needs Pro because the `free` plan
  // closes agents AND pull requests behind `AgentsPlanGate`.
  billing_accounts: {
    writable: true,
    ownerColumn: "user_id",
    userRefColumns: ["user_id"],
    idColumn: "user_id",
  },

  // ── Avatar ───────────────────────────────────────────────────────────────
  // The seed of the generated portrait (lib/avatar.ts). Writable because a board
  // photographed must show people who can be distinguished: the print being
  // random, two members can come across neighboring funds, and the only one
  // remedy provided by the product is to remove a new one.
  user_avatars: {
    writable: true,
    ownerColumn: "user_id",
    userRefColumns: ["user_id"],
    idColumn: "user_id",
  },

  // ── Cycle and notebook: personal, cross-project ───────────────────────────
  cycles: {
    writable: true,
    ownerColumn: "user_id",
    userRefColumns: ["user_id"],
  },
  user_scratchpad: {
    writable: true,
    ownerColumn: "user_id",
    userRefColumns: ["user_id"],
    idColumn: "user_id",
  },

  // ── Numo (l'assistant) ───────────────────────────────────────────────────
  conversations: {
    writable: true,
    ownerColumn: "user_id",
    projectColumn: "project_id",
    userRefColumns: ["user_id"],
  },
  assistant_messages: {
    writable: true,
    parents: [{ column: "conversation_id", table: "conversations" }],
  },

  // ── Agent de code ────────────────────────────────────────────────────────
  // No demo run should be `queued` nor `running`: the drain cron
  // claim the `queued`, and `requeueStuckRuns` re-queues any `running` of
  // more than 6 minutes — which WOULD actually RUN the agent (sandbox, calls
  // LLM invoiced, writing on a deposit). See lib/server/agent/runs.ts.
  agent_runs: {
    writable: true,
    projectColumn: "project_id",
    userRefColumns: ["created_by"],
    parents: [{ column: "issue_id", table: "issues" }],
  },
  agent_run_events: {
    writable: true,
    parents: [{ column: "run_id", table: "agent_runs" }],
  },

  // ── Feedback (public board + team view) ─────────────────────────────────
  // Any demo post must have non-zero `analyzed_at` AND `classified_at`:
  // the hourly AI pass (app/api/cron/feedback-analysis) only requires the
  // posts whose columns are null. Without that, the cron would call a model
  // on our demo data, and it would be charged.
  feedback_boards: {
    writable: true,
    projectColumn: "project_id",
  },
  feedback_users: {
    writable: true,
    projectColumn: "project_id",
  },
  feedback_posts: {
    writable: true,
    projectColumn: "project_id",
    userRefColumns: ["created_by_member"],
  },
  feedback_votes: {
    writable: true,
    parents: [
      { column: "post_id", table: "feedback_posts" },
      { column: "user_id", table: "feedback_users" },
    ],
  },
  feedback_post_categories: {
    writable: true,
    parents: [
      { column: "post_id", table: "feedback_posts" },
      { column: "category_id", table: "categories" },
    ],
  },

  // ── Pages (the wiki of a project) ───────────────────── ─────────────────────
  // Anchored by the project, like tickets. `parent_id` points to ANOTHER page
  // and is therefore not covered by `parents`: the table would be its own
  // parent, and the order of declaration (a parent before his child) cannot
  // satisfy himself. The guard is in the seed script, which generates
  // the identifiers of the pages it creates and refuses any `parent_id` that does not
  // is not part of it — a demo tree cannot therefore be grafted onto the page
  // of a real project.
  //
  // `search_text` is NOT calculated in base: `search_tsv` is generated at
  // from it, but it is the caller who fills it (there is no tiptap
  // in SQL, cf. migration 20261201090000). The seed poses it himself.
  pages: {
    writable: true,
    projectColumn: "project_id",
    userRefColumns: ["created_by", "updated_by", "deleted_by"],
  },
};

/** Tables where we have the right to write — strict subset of TABLE_SCOPES. */
export const WRITABLE_TABLES = Object.fromEntries(
  Object.entries(TABLE_SCOPES).filter(([, spec]) => spec.writable),
);

/**
 * Only callable RPC functions. `next_issue_number` increments the counter
 * of a project — we check before the call that the project is a demo project.
 */
export const ALLOWED_RPC = new Set(["next_issue_number"]);

/** Actual schema enums. Any value outside the list breaks a CHECK on the base side. */
export const ISSUE_STATUS = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
export const ISSUE_PRIORITY = ["none", "urgent", "high", "medium", "low"];
export const ISSUE_EFFORT = ["xs", "s", "m", "l", "xl"];

/** Points per effort — mirror of EFFORT_POINTS in lib/cycle.ts. */
export const EFFORT_POINTS = { xs: 1, s: 2, m: 3, l: 5, xl: 8 };

/** Statuses of a feedback post, and review statuses. */
export const FEEDBACK_STATUS = ["open", "planned", "in_progress", "shipped", "declined"];
export const FEEDBACK_REVIEW_STATE = ["pending", "published", "rejected"];

/** Agent run event types. */
export const AGENT_EVENT_TYPES = [
  "status", "thinking", "tool_call", "tool_result", "commit", "pr_opened",
  "error", "summary", "user_message", "plan_update", "files_changed", "question",
];

/** Capture settings. */
export const CAPTURE = {
  baseUrl: process.env.CAPTURE_BASE_URL || "http://localhost:3000",
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  /** Fixed instant: any relative date displayed is stable from one run to the next. */
  frozenNow: "2026-07-15T10:30:00.000Z",
};
