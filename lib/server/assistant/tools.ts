import "server-only";

import {
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_EFFORTS,
} from "@/lib/issue-validation";
import { NUMO_DEFAULT_STATUS_OPTIONS } from "@/lib/numo-default-status";
import { WEBHOOK_EVENTS, WEBHOOK_SCOPES } from "@/lib/server/webhooks";
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
        "Get one issue in full: all fields, categories, comments (with author names), sub-issues, and the duplicate target if any. Pass issue_id when known, or number (the N of KEY-N).",
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
        "List the project's integrations (external apps submitting feedback through the API): id, name, revoked_at. Issues created by one carry its integration_id; the view filter filters.integration takes these ids.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_views",
      description:
        "List the saved kanban views: id, name, onglet ('my' personal / 'all' shared), filters, sort, display.",
      parameters: {
        type: "object",
        properties: {
          onglet: {
            type: "string",
            enum: ["my", "all"],
            description: "Only this tab's views. Omit for both.",
          },
        },
      },
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
        "Create a saved kanban view. The kanban ALWAYS groups by status — a view only filters, sorts and optionally hides done issues. Filters take IDS (resolve names via list_members/list_categories/list_objectives/list_integrations first); null inside assignee/objective/integration means 'unassigned'/'no objective'/'not from an integration'.",
      parameters: {
        type: "object",
        properties: {
          onglet: {
            type: "string",
            enum: ["my", "all"],
            description:
              "'my' = personal view (My issues tab), 'all' = shared view (All issues tab).",
          },
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
                description: "user_ids; null = unassigned.",
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
        required: ["onglet", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_view",
      description:
        "Update a saved kanban view (name, filters, sort, display). Same filter shape and ID rules as create_view. Get view ids via list_views.",
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
        "Read the current user's own account settings: display name, email (read-only), interface language, the status Numo-created issues land in, and the auto-assign (on create / on start) and prompt-copy-auto-start preferences. Call this before update_account_settings so you use exact current values.",
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
        },
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
];

// Tools that operate on the requesting user's own account, not on a project —
// they must NOT receive a project_id (neither in global mode nor otherwise).
export const ACCOUNT_TOOLS = new Set([
  "get_account_settings",
  "update_account_settings",
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

  const augmented = ASSISTANT_TOOLS.map((tool) => {
    if (!PROJECT_SCOPED_TOOLS.has(tool.function.name)) return tool;

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

  return [listProjectsTool, ...augmented];
}

export const GLOBAL_ASSISTANT_TOOLS = buildGlobalTools();
