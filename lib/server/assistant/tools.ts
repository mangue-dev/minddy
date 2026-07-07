import "server-only";

import {
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_EFFORTS,
} from "@/lib/issue-validation";

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
  status: {
    type: "string",
    enum: [...ISSUE_STATUSES],
    description:
      "Issue status. 'triage' is the arrival zone (not on the kanban); 'duplicate' requires duplicate_of_id.",
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
        "List the project's members: user_id, name, role. assignee_id and lead_user_id take these user_id values.",
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
        "Create a saved kanban view. The kanban ALWAYS groups by status — a view only filters, sorts and optionally hides done issues. Filters take IDS (resolve names via list_members/list_categories/list_objectives first); null inside assignee/objective means 'unassigned'/'no objective'.",
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
        "Process an issue that sits in triage: accept it onto the board (→ backlog), decline it (→ canceled), or mark it as a duplicate of another issue. Optionally leaves a comment explaining the decision.",
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

// Every tool that operates on a project. In global mode these get a required
// `project_id` parameter injected (see buildGlobalTools).
export const PROJECT_SCOPED_TOOLS = new Set(
  ASSISTANT_TOOLS.map((t) => t.function.name).filter(
    (name) => name !== "ask_user"
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
