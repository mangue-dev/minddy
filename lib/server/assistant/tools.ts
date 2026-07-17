import "server-only";

import {
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_EFFORTS,
} from "@/lib/issue-validation";
import { NUMO_DEFAULT_STATUS_OPTIONS } from "@/lib/numo-default-status";
import { WEBHOOK_EVENTS, WEBHOOK_SCOPES } from "@/lib/server/webhooks";
import { CYCLE_INTENSITIES } from "@/lib/cycle-prefs";
import { FEEDBACK_POST_STATUSES } from "@/lib/feedback/types";
import { locales } from "@/i18n/config";

// ── Tool definitions (OpenAI function-calling format) ──────────────────
// Numo's tool surface over minddy: read + write issues (all fields, bulk),
// comments, categories, kanban views, objectives, triage decisions. No
// delete tools anywhere — cancellation goes through status changes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AssistantToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

const ISSUE_FIELD_PROPERTIES = {
  title: { type: "string", description: "Issue title." },
  description: {
    type: "string",
    description: "Issue description, markdown.",
  },
  plan: {
    type: ["string", "null"],
    description:
      "Implementation plan, markdown, separate from the description — a REAL engineering plan, like a coding agent's plan mode output: a short context (goal, approach), then ordered checkbox tasks each naming the ACTUAL code to touch (exact file paths, components, functions, migrations, routes), ending with a verification step (how to test). 'Add POST handler in app/api/foo/route.ts with zod validation' is a good task; 'do the backend' is not. Tasks are checkbox lines: '- [ ]' pending, '- [~]' in progress, '- [x]' completed, '- [-]' cancelled; prose is allowed between task blocks. ALWAYS send the FULL plan markdown (never a fragment) — task state changes are diffed and logged server-side. null clears the plan.",
  },
  status: {
    type: "string",
    enum: [...ISSUE_STATUSES],
    description:
      "Issue status. ONLY pass this when the user explicitly asked for a status change — never on your own initiative. 'triage' is the arrival zone (not on the kanban); 'duplicate' requires duplicate_of_id.",
  },
  priority: {
    type: "string",
    enum: [...ISSUE_PRIORITIES],
    description: "Issue priority.",
  },
  effort: {
    type: ["string", "null"],
    enum: [...ISSUE_EFFORTS, null],
    description: "Effort estimate (t-shirt size), or null to clear.",
  },
  assignee_id: {
    type: ["string", "null"],
    description:
      "user_id of the assignee (from list_members), or null to unassign.",
  },
  objective_id: {
    type: ["string", "null"],
    description:
      "Objective id (from list_objectives), or null to detach.",
  },
  parent_id: {
    type: ["string", "null"],
    description:
      "Parent issue id (sub-issues are max 1 level deep), or null to detach.",
  },
  due_date: {
    type: ["string", "null"],
    description: "Due date as an ISO 8601 timestamp, or null to clear.",
  },
} as const;

export const ASSISTANT_TOOLS: AssistantToolDef[] = [
  // ── Read tools ────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_issues",
      description:
        "List the project's issues (compact rows: id, identifier, title, status, priority, effort, assignee_id, objective_id, due_date, parent_id, category_ids). Filterable. Use this to resolve which issues the user means before editing.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "array",
            items: { type: "string", enum: [...ISSUE_STATUSES] },
            description: "Only these statuses. Omit for all.",
          },
          assignee_id: {
            type: ["string", "null"],
            description:
              "Only issues assigned to this user_id; null = unassigned only.",
          },
          objective_id: {
            type: "string",
            description: "Only issues attached to this objective.",
          },
          category_id: {
            type: "string",
            description: "Only issues carrying this category.",
          },
          integration_id: {
            type: ["string", "null"],
            description:
              "Only issues created by this integration; null = only issues NOT created by an integration.",
          },
          include_done: {
            type: "boolean",
            description:
              "Include done/canceled/duplicate issues (default false).",
          },
          limit: {
            type: "number",
            description: "Max rows (default 50, max 200).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_issues",
      description:
        "Search the project's issues by text (matches title/description, and exact identifiers like 'MIND-42' or bare numbers).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text." },
          limit: { type: "number", description: "Max rows (default 20)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_issue",
      description:
        "Get one issue in full: all fields, categories, comments (with author names), attachment metadata (file name/type/size, on the issue and per comment), sub-issues, and the duplicate target if any. Pass issue_id when known, or number (the N of KEY-N).",
      parameters: {
        type: "object",
        properties: {
          issue_id: { type: "string", description: "Issue id (uuid)." },
          number: {
            type: "number",
            description: "Issue number (the N in KEY-N).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_members",
      description:
        "List the project's members: user_id, name, role. assignee_id and lead_user_id take these user_id values. For owners the result also carries pending_invitations (id, email) — the ids cancel_invitation takes.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_objectives",
      description:
        "List the project's objectives (issue groups): id, name, status, lead_user_id, target_date.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_categories",
      description:
        "List the project's categories (labels): id, name, color.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_integrations",
      description:
        "List the project's integrations (external tools creating issues through the API): id, name, revoked_at. Issues created by one carry its integration_id; the view filter filters.integration takes these ids.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_views",
      description:
        "List the saved kanban views: id, name, kind, shared, filters, sort, display. kind 'my' is the user's system view ('Mes tickets'): its name and its assignee filter (locked to [\"@me\"], the dynamic 'assigned to me' value) can never change, and it cannot be deleted — other filters/sort/display remain editable.",
      parameters: { type: "object", properties: {} },
    },
  },
  // ── Write tools ───────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_issue",
      description:
        "Create an issue. IMPORTANT: unless the user explicitly asked for a specific status, DO NOT pass status — the issue then lands in 'triage' for human validation. Fill every other field you can: ALWAYS pass an estimated priority and effort (inferred from the description when not stated), and the matching category_ids. Resolve assignee/objective/category ids via the list_* tools first.",
      parameters: {
        type: "object",
        properties: {
          ...ISSUE_FIELD_PROPERTIES,
          category_ids: {
            type: "array",
            items: { type: "string" },
            description: "Category ids to attach (from list_categories).",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_issues",
      description:
        "Update one or several issues (1–50) with the same field changes. Use for single edits too. Only pass the fields to change. Setting status to 'duplicate' requires fields.duplicate_of_id.",
      parameters: {
        type: "object",
        properties: {
          issue_ids: {
            type: "array",
            items: { type: "string" },
            description: "Ids of the issues to update (1–50).",
          },
          fields: {
            type: "object",
            properties: {
              ...ISSUE_FIELD_PROPERTIES,
              duplicate_of_id: {
                type: ["string", "null"],
                description:
                  "Canonical issue id when setting status='duplicate'.",
              },
            },
            description: "The field changes applied to every listed issue.",
          },
        },
        required: ["issue_ids", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_issue_categories",
      description:
        "Replace the full set of categories (labels) on an issue. Pass ALL category ids the issue should end up with.",
      parameters: {
        type: "object",
        properties: {
          issue_id: { type: "string", description: "Issue id." },
          category_ids: {
            type: "array",
            items: { type: "string" },
            description: "The complete new set of category ids.",
          },
        },
        required: ["issue_id", "category_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_comment",
      description: "Add a comment (markdown) on an issue.",
      parameters: {
        type: "object",
        properties: {
          issue_id: { type: "string", description: "Issue id." },
          body: { type: "string", description: "Comment body, markdown." },
        },
        required: ["issue_id", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_view",
      description:
        "Create a saved kanban view. In project mode it is shared with the whole project; in global mode it is your personal CROSS-PROJECT view (spanning every project). The kanban ALWAYS groups by status — a view only filters, sorts and optionally hides done issues. Filters take IDS (resolve names via list_members/list_categories/list_objectives/list_integrations, or list_global_filter_options in global mode, first); null inside assignee/objective/integration means 'unassigned'/'no objective'/'not from an integration'; '@me' inside assignee means 'assigned to the viewing user' (dynamic).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "View name." },
          filters: {
            type: "object",
            properties: {
              status: {
                type: "array",
                items: { type: "string", enum: [...ISSUE_STATUSES] },
              },
              priority: {
                type: "array",
                items: { type: "string", enum: [...ISSUE_PRIORITIES] },
              },
              effort: {
                type: "array",
                items: { type: "string", enum: [...ISSUE_EFFORTS] },
              },
              assignee: {
                type: "array",
                items: { type: ["string", "null"] },
                description:
                  "user_ids; null = unassigned; '@me' = assigned to the viewing user (dynamic).",
              },
              objective: {
                type: "array",
                items: { type: ["string", "null"] },
                description: "objective ids; null = no objective.",
              },
              category: {
                type: "array",
                items: { type: "string" },
                description: "category ids.",
              },
              integration: {
                type: "array",
                items: { type: ["string", "null"] },
                description:
                  "integration ids (from list_integrations); null = not created by an integration.",
              },
            },
            description: "Filter config. Omit a key to not filter on it.",
          },
          sort: {
            type: "string",
            enum: ["manual", "priority", "created", "updated", "due"],
            description: "Sort order (default manual).",
          },
          display: {
            type: "object",
            properties: { hideDone: { type: "boolean" } },
            description: "Display options.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_view",
      description:
        "Update a saved kanban view (name, filters, sort, display). Same filter shape and ID rules as create_view. Get view ids via list_views. On the kind='my' system view the name and the assignee filter are locked (assignee stays [\"@me\"]); everything else is editable.",
      parameters: {
        type: "object",
        properties: {
          view_id: { type: "string", description: "View id." },
          name: { type: "string" },
          filters: { type: "object", description: "Same shape as create_view." },
          sort: {
            type: "string",
            enum: ["manual", "priority", "created", "updated", "due"],
          },
          display: {
            type: "object",
            properties: { hideDone: { type: "boolean" } },
          },
        },
        required: ["view_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_objective",
      description:
        "Create an objective (a group of issues with a common goal). Attach issues afterwards with update_issues { objective_id }.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Objective name." },
          description: { type: "string", description: "Markdown." },
          status: {
            type: "string",
            enum: ["planned", "in_progress", "done", "canceled"],
            description: "Default planned.",
          },
          lead_user_id: {
            type: ["string", "null"],
            description: "user_id of the lead (from list_members).",
          },
          target_date: {
            type: ["string", "null"],
            description: "ISO 8601 target date.",
          },
          color: { type: "string", description: "Hex color like #7c5cff." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_objective",
      description: "Update an objective's fields. Get ids via list_objectives.",
      parameters: {
        type: "object",
        properties: {
          objective_id: { type: "string", description: "Objective id." },
          name: { type: "string" },
          description: { type: "string" },
          status: {
            type: "string",
            enum: ["planned", "in_progress", "done", "canceled"],
          },
          lead_user_id: { type: ["string", "null"] },
          target_date: { type: ["string", "null"] },
          color: { type: "string" },
        },
        required: ["objective_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_category",
      description:
        "Create a category (label) in the project. Check list_categories first to avoid duplicates.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Category name." },
          color: { type: "string", description: "Hex color like #7c5cff." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "triage_decision",
      description:
        "Process an issue that sits in triage: accept it onto the board (→ backlog), decline it (→ canceled), or mark it as a duplicate of another issue. Optionally leaves a comment explaining the decision. ONLY call this when the user explicitly asked for that triage decision — never accept or decline triage issues on your own initiative.",
      parameters: {
        type: "object",
        properties: {
          issue_id: {
            type: "string",
            description: "The triage issue's id.",
          },
          decision: {
            type: "string",
            enum: ["accept", "decline", "duplicate"],
          },
          duplicate_of_id: {
            type: "string",
            description:
              "Required when decision='duplicate': the canonical issue's id.",
          },
          comment: {
            type: "string",
            description: "Optional comment explaining the decision.",
          },
        },
        required: ["issue_id", "decision"],
      },
    },
  },
  // ── Feedback board (user requests collected on the project's board / API) ─
  {
    type: "function",
    function: {
      name: "list_feedback",
      description:
        "List the project's feedback posts (user requests from the feedback board / API / internal entry): id, title, status, vote_count, is_public, whether a tracking issue is linked, source. Sorted by votes. Use it to find the feedback the user means before acting. Excludes merged duplicates.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "array",
            items: { type: "string", enum: [...FEEDBACK_POST_STATUSES] },
            description:
              "Only these public statuses (open, planned, in_progress, shipped, declined). Omit for all.",
          },
          limit: { type: "number", description: "Max rows (default 50, max 200)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_feedback",
      description:
        "Get one feedback post in full: title, body (the user's request), the raw submitted text, public status, vote_count, author (real identity), the linked issue if any, and its internal comment thread. In a feedback comment thread, omit feedback_post_id to read the post the comment is on.",
      parameters: {
        type: "object",
        properties: {
          feedback_post_id: {
            type: "string",
            description:
              "Feedback post id. Omit to target the current post (feedback comment mode only).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "promote_feedback_to_issue",
      description:
        "Turn a feedback post into a NEW backlog issue and link them: the issue carries the request + its vote count, and the post's public status then follows that issue automatically. Use when no issue tracks this feedback yet. Fails if the post is already linked or is a merged duplicate. Omit feedback_post_id to target the current post (feedback comment mode).",
      parameters: {
        type: "object",
        properties: {
          feedback_post_id: {
            type: "string",
            description: "Feedback post id. Omit to target the current post.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_feedback_to_issue",
      description:
        "Link a feedback post to an EXISTING issue (the work is already tracked). The post's public status immediately reflects the issue and follows its transitions. Resolve the issue first with search_issues / list_issues. Fails if the post is already linked or merged. Omit feedback_post_id to target the current post (feedback comment mode).",
      parameters: {
        type: "object",
        properties: {
          feedback_post_id: {
            type: "string",
            description: "Feedback post id. Omit to target the current post.",
          },
          issue_id: { type: "string", description: "The existing issue's id." },
        },
        required: ["issue_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unlink_feedback",
      description:
        "Detach the issue currently linked to a feedback post (the post keeps its last public status). Omit feedback_post_id to target the current post (feedback comment mode).",
      parameters: {
        type: "object",
        properties: {
          feedback_post_id: {
            type: "string",
            description: "Feedback post id. Omit to target the current post.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "respond_to_feedback",
      description:
        "Publish (or update) the official TEAM RESPONSE on a feedback post — the single reply shown PUBLICLY to everyone who submitted it, signed on behalf of the team. This is PUBLIC-facing: only do it when explicitly asked. Pass an empty string to remove the response. Omit feedback_post_id to target the current post (feedback comment mode).",
      parameters: {
        type: "object",
        properties: {
          feedback_post_id: {
            type: "string",
            description: "Feedback post id. Omit to target the current post.",
          },
          response: {
            type: "string",
            description:
              "The public team response (markdown/plain text). Empty string clears it.",
          },
        },
        required: ["response"],
      },
    },
  },
  // ── Project settings (owner only) ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "update_project",
      description:
        "Update the project's own settings: its name, its key (the KEY-N issue prefix, 2–5 uppercase letters) and/or its accent color. OWNER ONLY — fails for a non-owner. Changing the key rewrites how every issue is referenced (MIND-42 → NEW-42): confirm with the user before doing it. Only pass the fields to change.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "New project name." },
          key: {
            type: "string",
            description:
              "New project key — 2 to 5 letters (A–Z). Uppercased automatically. Must be unique for the owner.",
          },
          color: {
            type: ["string", "null"],
            description: "Accent color as a hex string like #7c5cff, or null to clear.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "invite_member",
      description:
        "Invite someone to the project by email. OWNER ONLY. The email must belong to an existing minddy account; the person gets a pending in-app invitation they accept from their Home. No email is sent.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "The invitee's account email." },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_member",
      description:
        "Remove a member from the project. OWNER ONLY (a non-owner may only remove themselves — i.e. leave). The project owner cannot be removed. Destructive — confirm with the user first. Pass the member's user_id (from list_members).",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "user_id of the member to remove (from list_members).",
          },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_invitation",
      description:
        "Cancel a still-pending project invitation. OWNER ONLY. Pass the invitation's id (from list_members, which lists pending invitations).",
      parameters: {
        type: "object",
        properties: {
          invitation_id: {
            type: "string",
            description: "Id of the pending invitation to cancel.",
          },
        },
        required: ["invitation_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_category",
      description:
        "Rename and/or recolor an existing category (label). Get the id via list_categories. Only pass the fields to change. (Categories cannot be deleted.)",
      parameters: {
        type: "object",
        properties: {
          category_id: { type: "string", description: "Category id (from list_categories)." },
          name: { type: "string", description: "New category name." },
          color: { type: "string", description: "New hex color like #7c5cff." },
        },
        required: ["category_id"],
      },
    },
  },
  // ── Integrations (owner only) ─────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_integration",
      description:
        "Create a named integration (a Feedback API key an external app uses to submit issues). OWNER ONLY. The plaintext API key is returned ONCE in the result — surface it to the user immediately and tell them it won't be shown again.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "A name identifying the integration (max 60 chars).",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_integration_webhook",
      description:
        "Configure an integration's outgoing webhook: the URL minddy POSTs issue events to, which events to follow, and the scope. OWNER ONLY. Get the id via list_integrations. Pass webhook_url null to disable the webhook (keeping its event/scope config).",
      parameters: {
        type: "object",
        properties: {
          integration_id: {
            type: "string",
            description: "Integration id (from list_integrations).",
          },
          webhook_url: {
            type: ["string", "null"],
            description:
              "https/http URL to POST events to, or null to disable the webhook.",
          },
          webhook_events: {
            type: "array",
            items: { type: "string", enum: [...WEBHOOK_EVENTS] },
            description: "Which issue events to send.",
          },
          webhook_scope: {
            type: "string",
            enum: [...WEBHOOK_SCOPES],
            description:
              "'integration' = only events on issues this integration created; 'all' = all project issues.",
          },
        },
        required: ["integration_id", "webhook_events", "webhook_scope"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "revoke_integration",
      description:
        "Revoke an integration's API key so it can no longer submit issues. OWNER ONLY. This is irreversible (the key stops working); confirm with the user first. Get the id via list_integrations.",
      parameters: {
        type: "object",
        properties: {
          integration_id: {
            type: "string",
            description: "Integration id (from list_integrations).",
          },
        },
        required: ["integration_id"],
      },
    },
  },
  // ── Account settings (the current user's own account) ─────────────────
  {
    type: "function",
    function: {
      name: "get_account_settings",
      description:
        "Read the current user's own account settings: display name, email (read-only), interface language, the status Numo-created issues land in, the auto-assign (on create / on start) and prompt-copy-auto-start preferences, and the cycle preferences (enabled, duration, start day, intensity, auto-capture). Call this before update_account_settings so you use exact current values.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_account_settings",
      description:
        "Update the current user's OWN account settings. Only pass the fields to change. Applies to the requesting user only — never another account. (Theme is a device-local setting and cannot be changed here.)",
      parameters: {
        type: "object",
        properties: {
          display_name: {
            type: "string",
            description: "New display name (cannot be empty).",
          },
          locale: {
            type: "string",
            enum: [...locales],
            description: "Interface language.",
          },
          numo_default_status: {
            type: "string",
            enum: [...NUMO_DEFAULT_STATUS_OPTIONS],
            description: "The status issues Numo creates land in by default.",
          },
          auto_assign_created: {
            type: "boolean",
            description: "Auto-assign newly created issues to the user.",
          },
          auto_assign_on_start: {
            type: "boolean",
            description:
              "When an unassigned issue moves to in_progress, self-assign it to the user.",
          },
          prompt_copy_auto_start: {
            type: "boolean",
            description:
              "When copying an issue's prompt, move that issue to in_progress.",
          },
          cycles_enabled: {
            type: "boolean",
            description:
              "Enable the personal cross-project cycle (the user's week/fortnight).",
          },
          cycle_duration_weeks: {
            type: "number",
            enum: [1, 2],
            description: "Cycle length: 1 week or 2 weeks.",
          },
          cycle_start_dow: {
            type: "number",
            description: "ISO day the cycle starts on: 1 = Monday … 7 = Sunday.",
          },
          cycle_intensity: {
            type: "string",
            enum: [...CYCLE_INTENSITIES],
            description:
              "Personal pace preference — sets the cycle's capacity target.",
          },
          cycle_upcoming_count: {
            type: "number",
            description: "How many upcoming cycles to keep created ahead (1–4).",
          },
          cycle_auto_capture_started: {
            type: "boolean",
            description:
              "Capture an uncycled assigned issue into the current cycle when it starts.",
          },
          cycle_auto_capture_completed: {
            type: "boolean",
            description:
              "Capture an uncycled assigned issue into the current cycle when it completes.",
          },
        },
      },
    },
  },
  // ── Cycles (the current user's personal cross-project cycle — MIN-32) ──
  {
    type: "function",
    function: {
      name: "get_cycle",
      description:
        "Read the current user's cycle: their PERSONAL, CROSS-PROJECT week/fortnight ('what am I working on right now'), identified by its dates. Returns the cycle (dates, intensity, capacity target and filled points), the issues in it, and the best next candidates from their assigned pool (reco-scored). Points are an internal capacity unit — when talking to the user, speak in effort sizes or percentages, never raw points. Requires the user to have cycles enabled (Account → Cycles).",
      parameters: {
        type: "object",
        properties: {
          which: {
            type: "string",
            enum: ["current", "next", "previous"],
            description: "Which cycle to read. Default: current.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fill_cycle",
      description:
        "Top up the user's CURRENT cycle with the deterministic engine: it picks from the issues assigned to them (no cycle yet, open status), by priority + unblocked (blocks relations are respected) + smallest first, until the capacity target is reached. The optional weights let you steer it from a phrase ('priorise les fixs UI' → keyword/category boosts; 'focus project X' → project boost) — they bias the scoring, they NEVER force a pick. Resolve category/project ids first via list_categories/list_projects. Weights default to 1; boosts are additive score points (10–100 = mild–strong).",
      parameters: {
        type: "object",
        properties: {
          priority_weight: {
            type: "number",
            description: "Multiplier on the issue-priority component (default 1).",
          },
          unblocked_weight: {
            type: "number",
            description: "Multiplier on the not-blocked bonus (default 1).",
          },
          small_first_weight: {
            type: "number",
            description: "Multiplier on the smallest-first component (default 1).",
          },
          project_boosts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                project_id: { type: "string" },
                weight: { type: "number" },
              },
              required: ["project_id", "weight"],
            },
            description: "Additive boost per project id.",
          },
          category_boosts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category_id: { type: "string" },
                weight: { type: "number" },
              },
              required: ["category_id", "weight"],
            },
            description: "Additive boost per category id.",
          },
          keyword_boosts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                keyword: { type: "string" },
                weight: { type: "number" },
              },
              required: ["keyword", "weight"],
            },
            description: "Additive boost when the issue title contains the keyword.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_issues_to_cycle",
      description:
        "Add issues (1–50, by id) to the user's CURRENT cycle. Adding ASSIGNS each issue to the user as a side-effect; it NEVER changes the status (the cycle is orthogonal to status). Reassigning an issue to someone else later silently drops it from the cycle.",
      parameters: {
        type: "object",
        properties: {
          issue_ids: {
            type: "array",
            items: { type: "string" },
            description: "Issue ids (from list_issues / get_cycle candidates).",
          },
        },
        required: ["issue_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_issues_from_cycle",
      description:
        "Remove issues (1–50, by id) from the user's CURRENT cycle. Assignment and status are untouched — the issues simply leave the cycle.",
      parameters: {
        type: "object",
        properties: {
          issue_ids: {
            type: "array",
            items: { type: "string" },
            description: "Issue ids currently in the cycle (see get_cycle).",
          },
        },
        required: ["issue_ids"],
      },
    },
  },
  // ── Interaction ──────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user a clarifying question when the ambiguity would materially affect the result. The conversation pauses until they answer.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The question to ask.",
          },
          suggestions: {
            type: "array",
            items: { type: "string" },
            description: "Optional quick-reply suggestions (2–4).",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_agent_models",
      description:
        "List the AI models available to the minddy code agent for THIS user, resolved by their active provider — their own BYOK provider (OpenAI, Anthropic, Google, OpenRouter or a generic OpenAI-compatible endpoint), or the minddy platform quota on OpenRouter when they have no key. Returns the active provider, the user's effective default model, and matching model ids. Call it (1) to resolve the EXACT model id before forcing one in launch_code_agent when the user names a model loosely ('use GPT-5', 'run it on Claude Sonnet'), and (2) to answer 'which models can I use for the agent?'. Always pass `query` to narrow — the catalog (OpenRouter especially) can hold hundreds of models.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Case-insensitive substring to filter models by id or name (e.g. 'gpt', 'claude', 'sonnet', 'deepseek', 'gemini'). Omit only to sample the top of the catalog.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "launch_code_agent",
      description:
        "Send a message to the minddy cloud code agent on an issue. The agent works CONVERSATIONALLY in a sandbox on the project's linked GitHub repository, anchored to the issue: it does what the message asks (implement, fix, explore, explain, review), pushes its code changes to the issue's working branch, and opens a pull request only when asked or when it judges the work ready for review — a PR is NOT automatic, so never promise one. If an agent is already working on the issue, the message reaches it as steering; otherwise a new session starts (inheriting the issue's existing branch/PR). Requires a linked GitHub repo. Pass `model` ONLY when the user explicitly names a model to use — resolve the exact id with list_agent_models first so it matches their active provider (a model absent from that provider will fail); otherwise omit `model` and their default applies.",
      parameters: {
        type: "object",
        properties: {
          issue_id: {
            type: "string",
            description: "id of the issue to work on (resolve it via list_issues/search_issues first).",
          },
          prompt: {
            type: "string",
            description: "Optional extra instructions for the agent, beyond the issue itself.",
          },
          model: {
            type: "string",
            description: "Optional exact model id to force (only when the user explicitly requests a specific model).",
          },
        },
        required: ["issue_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_pull_request",
      description:
        "Read the pull request the code agent opened for an issue: its title, description, state, branch, the per-file diffs (patches, capped), and the review comments anchored to specific lines of code (with their file:line anchor and the diff snippet they were written against). Use it to explain what a PR changes, review it, or answer questions about its content or the review feedback on it. Requires the issue to have an agent-opened PR.",
      parameters: {
        type: "object",
        properties: {
          issue_id: {
            type: "string",
            description:
              "id of the issue whose pull request to read (resolve via list_issues/search_issues, or use the issue in context).",
          },
        },
        required: ["issue_id"],
      },
    },
  },
];

// Tools that operate on the requesting user's own account, not on a project —
// they must NOT receive a project_id (neither in global mode nor otherwise).
// The cycle is personal & cross-project (MIN-32), so its tools live here too.
export const ACCOUNT_TOOLS = new Set([
  "get_account_settings",
  "update_account_settings",
  "list_agent_models",
  "get_cycle",
  "fill_cycle",
  "add_issues_to_cycle",
  "remove_issues_from_cycle",
]);

// Tools that never take a project (ask_user + the account-level tools).
const NON_PROJECT_TOOLS = new Set(["ask_user", ...ACCOUNT_TOOLS]);

// Every tool that operates on a project. In global mode these get a required
// `project_id` parameter injected (see buildGlobalTools).
export const PROJECT_SCOPED_TOOLS = new Set(
  ASSISTANT_TOOLS.map((t) => t.function.name).filter(
    (name) => !NON_PROJECT_TOOLS.has(name)
  )
);

// View tools that, in global mode, operate on the user's CROSS-PROJECT global
// view (project_id null, personal) rather than a project's — so they take NO
// injected project_id there. In project mode they stay project-scoped as usual.
export const GLOBAL_VIEW_TOOLS = new Set(["create_view", "update_view"]);

export function buildGlobalTools(): AssistantToolDef[] {
  const listProjectsTool: AssistantToolDef = {
    type: "function",
    function: {
      name: "list_projects",
      description:
        "List all projects the user has access to, with their id, name, and key.",
      parameters: { type: "object", properties: {} },
    },
  };

  // Global-mode discovery for the cross-project view's category/objective/
  // integration filters: same names collapsed across projects, each carrying
  // the full set of ids to put in filters.category/objective/integration.
  const listGlobalFilterOptionsTool: AssistantToolDef = {
    type: "function",
    function: {
      name: "list_global_filter_options",
      description:
        "List the category, objective and integration filter options across ALL the user's projects, grouped by name. Each entry gives { name, ids } — the ids to drop into a GLOBAL view's filters.category / filters.objective / filters.integration. Use this before filtering the cross-project global view by category, objective or integration.",
      parameters: { type: "object", properties: {} },
    },
  };

  const augmented = ASSISTANT_TOOLS.map((tool) => {
    // View tools edit the global view in global mode → no project_id injected.
    if (
      !PROJECT_SCOPED_TOOLS.has(tool.function.name) ||
      GLOBAL_VIEW_TOOLS.has(tool.function.name)
    ) {
      return tool;
    }

    const params = tool.function.parameters;

    return {
      ...tool,
      function: {
        ...tool.function,
        parameters: {
          ...params,
          properties: {
            project_id: {
              type: "string",
              description:
                "The project ID to operate on. Use list_projects to discover available projects.",
            },
            ...params.properties,
          },
          required: ["project_id", ...(params.required || [])],
        },
      },
    };
  });

  return [listProjectsTool, listGlobalFilterOptionsTool, ...augmented];
}

export const GLOBAL_ASSISTANT_TOOLS = buildGlobalTools();
