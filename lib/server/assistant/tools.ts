import "server-only";

import {
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_EFFORTS,
} from "@/lib/issue-validation";
import { PLAN_TASK_STATES } from "@/lib/plan";
import { RECURRENCE_CADENCES } from "@/lib/recurrence";
import { MAX_SCRATCHPAD_LENGTH } from "@/lib/scratchpad";
import { NUMO_DEFAULT_STATUS_OPTIONS } from "@/lib/numo-default-status";
import { ACCOUNT_THEMES } from "@/lib/account-theme";
import { WEBHOOK_EVENTS, WEBHOOK_SCOPES } from "@/lib/server/webhooks";
import { CYCLE_INTENSITIES } from "@/lib/cycle-prefs";
import { FEEDBACK_POST_STATUSES } from "@/lib/feedback/types";
import { AUTOMATION_PRESET_IDS } from "@/lib/automations";
import { REASONING_LEVELS } from "@/lib/agent-reasoning";
import {
  CREATE_ROUTINE_DESCRIPTION,
  CREATE_ROUTINE_PARAMETERS,
  LIST_ROUTINES_DESCRIPTION,
  UPDATE_ROUTINE_DESCRIPTION,
  UPDATE_ROUTINE_PARAMETERS,
} from "@/lib/server/routine-tool-schema";
import { OBJECTIVE_STATUS_VALUES } from "@/lib/objective-validation";
import { RELATION_TYPE_VALUES } from "@/lib/relation-validation";
import { TRASH_TYPES } from "@/lib/server/trash";
import { VIEW_SORTS } from "@/lib/server/views";
import { locales } from "@/i18n/config";

// ── Tool definitions (OpenAI function-calling format) ──────────────────
// Numo's tool surface over minddy: read + write issues (all fields, bulk),
// comments, categories, kanban views, objectives, triage decisions, and the
// trash (MIN-133) — deleting is a reversible move to the trash, never the
// hard delete the nightly sweep does thirty days later.

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

/** What a page body accepts, says where the model reads it — the same prose
 as on the MCP side (lib/server/mcp/page-tools.ts): this is the only way to use the
 syntax, and a subpage link cannot be guessed. */
/**
 * IMAGES and FILES of a page (MIN-280), said to the model in three
 * sentences because it cannot guess them and would destroy some without the
 * namely: `update_page` replaces the ENTIRE body, therefore one line of image that one
 * has not copied is a file detached from its document.
 *
 * The same prose on the three surfaces (MCP, Numo, code agent), like the
 * remains of the instructions for using the syntax.
 */
const PAGE_FILES_DESCRIPTION =
  "An image reads '![caption](url)' and a file '[name](url)' — those are REAL " +
  "files stored by minddy. Keep such lines exactly as you read them when you " +
  "rewrite a body: dropping one detaches the file from the page. You cannot " +
  "upload a file yourself, and you must never invent one of those urls.";

const PAGE_BODY_DESCRIPTION =
  "The page BODY in markdown. Supported: headings (## and ###, since a single " +
  "'# ' is the page title), bold/italic/inline code, links, bullet and numbered " +
  "lists, task lists ('- [ ]' / '- [x]'), quotes, fenced code blocks, horizontal " +
  "rules, <details><summary>…</summary>…</details> collapsibles, and " +
  "'[[page:<page_id>]]' on its own line to embed a link to another page. Anything " +
  "else degrades to plain text. " +
  PAGE_FILES_DESCRIPTION;

const ISSUE_FIELD_PROPERTIES = {
  title: { type: "string", description: "Issue title." },
  description: {
    type: "string",
    description:
      "Issue description, markdown. Replaces it whole — to fix one sentence of a long description, edit_issue_text patches it in place instead.",
  },
  plan: {
    type: ["string", "null"],
    description:
      "Implementation plan, markdown, separate from the description. Ground every line in what you actually know (the issue, its comments, this conversation): you cannot see the repository, so never invent file paths, function or component names, or code snippets — the grounded technical plan is the code agent's job (launch_code_agent, mode 'plan'). On an issue that already HAS a plan, this field replaces it whole: to add a precision or an extra task use append_to_plan, to reword a passage use edit_issue_text, to tick a task off use update_plan_tasks, and rewrite only when the user explicitly asked for it — then read the current plan with get_issue first and send it back COMPLETE (task state changes are diffed and logged server-side). Tasks are checkbox lines: '- [ ]' pending, '- [~]' in progress, '- [x]' completed, '- [-]' cancelled; prose is allowed between task blocks. null clears the plan.",
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
  recurrence: {
    type: ["string", "null"],
    enum: [...RECURRENCE_CADENCES, null],
    description:
      "Recurrence cadence — the issue comes back at this rhythm ('every Monday', 'every 4th of the month', 'every year'). It NEEDS a due_date: pass one in the same call unless the issue already has one, otherwise the write is refused. That due date carries the FIRST occurrence and gives the rhythm its day (weekly + a Monday = every Monday, monthly + the 4th = every 4th); a date already past is moved forward to the next occurrence, so a recurring issue never starts overdue. It then runs on its own: setting the issue to 'done' creates the next occurrence in 'backlog' with the due date shifted by one cadence and moves the recurrence onto it — never create that next occurrence yourself. null stops the series (so do clearing the due_date and canceling the issue).",
  },
} as const;

const CREATE_ISSUE_FIELD_PROPERTIES = {
  ...ISSUE_FIELD_PROPERTIES,
  // Creation-only landing rule (mirrors the code agent's create_issue): WHERE
  // the issue lands is an account setting, not a model choice. execute-tool
  // falls back to the user's configured Numo default when this field is left
  // out, so omitting it is always safe; forcing one is reserved for an
  // explicit user ask at creation. The shared `status` above stays on
  // update_issues, where a user-asked change is the norm.
  status: {
    type: "string",
    enum: [...ISSUE_STATUSES],
    description:
      "Landing status. LEAVE IT OUT by default: minddy files new issues in the user's chosen Numo landing status — an account setting, not your call. Pass one ONLY when the user explicitly asked for that status at creation ('crée-la directement en done'); 'duplicate' additionally requires duplicate_of_id.",
  },
  smart_fill: {
    type: "boolean",
    description:
      "Let Smart-fill infer priority, effort, categories and objective from the title and description when creating this issue.",
  },
} as const;

// The saved-view filter schema, shared by create_view and update_view so both
// advertise exactly what sanitizeViewConfig accepts. `project` is absent here
// on purpose: it only means something on the cross-project global view (a
// project board is single-project), so buildGlobalTools adds it there.
const VIEW_FILTER_PROPERTIES = {
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
} as const;

// The one filter the global board has on top of a project board — same facet
// the user gets in the toolbar there. Added to the view tools in global mode.
const VIEW_PROJECT_FILTER_PROPERTY = {
  type: "array",
  items: { type: "string" },
  description:
    "project ids (from list_projects) — keep only the issues of those projects. Global (cross-project) view only.",
} as const;

export const ASSISTANT_TOOLS: AssistantToolDef[] = [
  // ── Read tools ────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_help",
      description:
        "Read minddy's product knowledge for a feature or topic. Use this before explaining a product feature, setup path, plan capability, or open-source/self-hosting detail.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string", description: "Knowledge topic id or natural-language query." } },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_issues",
      description:
        "List the project's issues (compact rows: id, identifier, title, status, priority, effort, assignee_id, objective_id, due_date, recurrence, parent_id, category_ids). Filterable. Use this to resolve which issues the user means before editing.",
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
        "Get one issue in full: all fields, categories, comments (with author names), its resources — files, links AND pages of the project's wiki (kind, then file name/type/size, url, or page_id + live title; on the issue and per comment) —, sub-issues, its relations to other issues (blocks / blocked_by / related, each with the other issue's identifier, title and status — read them before saying an issue is ready to start), the duplicate target if any, and linked_feedback: the user requests from the feedback board this issue implements (title, status, vote_count, comment_count). Those are the WHY behind the work, in the users' own words — when an issue carries one, read it with get_feedback before deciding what to build, especially if it has comments. Pass issue_id when known, or number (the N of KEY-N).",
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
        "List the project's objectives (issue groups): id, name, status, lead_user_id, target_date, plus their resources when they carry any — files, links AND pages of the project's wiki (kind, then file name/type/size, url, or page_id + live title). Attach one with add_resource.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_resource",
      description:
        "Attach a LINK or a PAGE of the project's wiki to an issue or to an objective — a doc, a design, a reference. It shows in the sidebar as the same pill as a file: a link with the site's favicon (minddy fetches the page's title itself, so send the url alone), a page with its emoji and its live title. Send url OR page_id, never both. Files can't be attached this way (you have none to send): a person adds those from the app.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "A LINK: its http(s) address. Exclusive with page_id.",
          },
          page_id: {
            type: "string",
            description:
              "A PAGE of this project's wiki: its id, from list_pages. Exclusive with url.",
          },
          issue_id: {
            type: "string",
            description: "Attach to this issue. Exclusive with objective_id.",
          },
          objective_id: {
            type: "string",
            description: "Attach to this objective. Exclusive with issue_id.",
          },
        },
        required: [],
      },
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
        "List the project's integrations (API keys external apps push through): id, name, kind ('issues' or 'feedback'), revoked_at, and `webhook` — null when none, else the url, events, scope and the status of the last delivery. Issues created by one carry its integration_id; the view filter filters.integration takes these ids. Plaintext keys are never listed — they exist only in the create_integration result.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_views",
      description:
        "List the saved kanban views of the current scope — the project's views in project mode, the user's personal cross-project views on the global board — with their id, name, kind, shared, filters, sort, display. Call it before update_view to read the filters currently set on a view. kind 'my' is the user's system view ('Mes tickets'): its name and its assignee filter (locked to [\"@me\"], the dynamic 'assigned to me' value) can never change, and it cannot be deleted — other filters/sort/display remain editable.",
      parameters: { type: "object", properties: {} },
    },
  },
  // ── Write tools ───────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_issue",
      description:
        "Create an issue. IMPORTANT: unless the user explicitly asked for a specific status, DO NOT pass status — minddy files new issues in the user's chosen Numo landing status (an account setting) on its own. Fill every other field you can: pass an estimated priority and effort (inferred from the description when not stated) unless smart_fill is true, and pass matching category_ids unless smart_fill is true. Resolve assignee/objective/category ids via the list_* tools first.",
      parameters: {
        type: "object",
        properties: {
          ...CREATE_ISSUE_FIELD_PROPERTIES,
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
      name: "propose_backlog",
      description:
        "Turn a project you have framed WITH the user into the backlog that starts it, in ONE pass: you hand over a brief, minddy cuts it into 3–6 objectives and 10–40 issues, and the PROPOSAL is displayed to the user, who unchecks what they don't want, fixes the titles and creates it themselves. This call WRITES NOTHING. OWNER ONLY — a non-owner cannot seed the project's backlog. Use it when the user wants to start a project from your conversation ('aide-moi à démarrer ce projet', a brand-new project with an empty board, a discussion that has converged on what to build), and NEVER as a way to create a few issues someone already listed — that's create_issue. Two conditions before calling it: (1) the project is actually framed — the goal, what it must do, the perimeter, the constraints, the choices already made; ask what you're missing first (see ask_user), a proposal built on two vague sentences wastes the user's review; (2) it replaces the batch — never chain create_issue calls to build a backlog, twenty calls cost twenty round-trips and all land in triage. The pass takes up to a minute or two. Your turn ENDS on this call — say in ONE short sentence what you are about to propose BEFORE calling it, because you get no word after: the user then reviews the proposal on screen and tells you what they created, so create, edit or comment on nothing in the meantime.",
      parameters: {
        type: "object",
        properties: {
          brief: {
            type: "string",
            description:
              "The brief: EVERYTHING the conversation established about the project, rewritten as a self-contained summary — the goal, what it must do, the perimeter, the technical choices and constraints, what is explicitly out of scope. A few structured paragraphs, in the user's language. The pass sees NOTHING but this text: what you leave out is missing from the backlog, and what you invent here becomes issues nobody asked for.",
          },
        },
        required: ["brief"],
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
      name: "append_to_plan",
      description:
        "Add to an issue's implementation plan WITHOUT touching what is already there — the way to record a precision the user just gave, an extra task or a note on a plan that already exists. The block lands at the end of the plan (above its questions section when it has one), or at the end of a named section with `section`. Creates the plan when the issue has none. Prefer this to update_issues { fields: { plan } }, which rewrites the whole plan and drops anything you don't resend.",
      parameters: {
        type: "object",
        properties: {
          issue_id: { type: "string", description: "Issue id." },
          markdown: {
            type: "string",
            description:
              "The block to ADD, markdown: checkbox task lines ('- [ ] …') and/or a short paragraph. Only what is new — everything already in the plan is kept as-is, so never repeat it here.",
          },
          section: {
            type: "string",
            description:
              "Title of an existing heading in the plan to append under (e.g. 'Questions' to park an open question). Omit to append at the end of the plan. Read the plan with get_issue first to know its headings — an unknown title is an error, not a new section.",
          },
        },
        required: ["issue_id", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_plan_tasks",
      description:
        "Flip the state of one or several tasks of an issue's implementation plan, leaving every other byte of the plan untouched. task_index comes from get_issue's plan_tasks (0-based, document order) — read it right before calling. This is how a task gets ticked off: never rewrite the whole plan for a state change.",
      parameters: {
        type: "object",
        properties: {
          issue_id: { type: "string", description: "Issue id." },
          tasks: {
            type: "array",
            description: "The task state changes to apply (1–50).",
            items: {
              type: "object",
              properties: {
                task_index: {
                  type: "integer",
                  description:
                    "0-based index of the task in get_issue's plan_tasks.",
                },
                state: {
                  type: "string",
                  enum: [...PLAN_TASK_STATES],
                  description: "The task's new state.",
                },
              },
              required: ["task_index", "state"],
            },
          },
        },
        required: ["issue_id", "tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_issue_text",
      description:
        "Rewrite ONE passage of an issue's plan or description IN PLACE, the way a code editor patches a file: old_string → new_string, copied verbatim from get_issue, and the match must be unique (include the surrounding lines, or set replace_all). Every other byte is left alone. This is how you REWORD something already written — a decision that changed, a section to rephrase, a wrong sentence in a description — without re-emitting the whole document through update_issues, which would cost you the entire text and silently drop anything you didn't resend. A stale old_string fails loudly instead. To ADD to a plan use append_to_plan; to tick a task off, update_plan_tasks.",
      parameters: {
        type: "object",
        properties: {
          issue_id: { type: "string", description: "Issue id." },
          field: {
            type: "string",
            enum: ["plan", "description"],
            description: "Which text of the issue to patch.",
          },
          old_string: {
            type: "string",
            description:
              "The exact passage to replace, copied VERBATIM from what get_issue returned — whitespace and line breaks included.",
          },
          new_string: {
            type: "string",
            description: "What replaces it. An empty string deletes the passage.",
          },
          replace_all: {
            type: "boolean",
            description:
              "Replace EVERY occurrence instead of requiring a unique match (default false) — for a term repeated throughout the text.",
          },
        },
        required: ["issue_id", "field", "old_string", "new_string"],
      },
    },
  },

  // ── Pages: the project wiki (MIN-273) ─────────────────────────────────
  //
  // The same set of six gestures as on the MCP, and for the same reason: a
  // ticket says what to do, a page says why it's like that. Both
  // surgical writings (append, edit) exist here too — without them,
  // correcting a sentence costs the entire document.
  {
    type: "function",
    function: {
      name: "list_pages",
      description:
        "The project's WIKI as a flat list of pages — id, title, icon, parent id, last update — without any body. It is the map, and the only place page ids come from. Pages hold the durable knowledge the issues assume (specs, decisions and their why, conventions, runbooks), so read them before answering a 'why is it like this?' question or writing issues from a document. When you are after a SUBJECT rather than the map, use search_pages instead — it reads the bodies too. parent_page_id carries the nesting (any depth); rebuild the tree yourself. Then read one with get_page.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_pages",
      description:
        "Full-text search across the wiki — page TITLES and page BODIES — ranked, each hit with the passage that matched and the path of its parent pages. Use it BEFORE list_pages whenever you have a subject rather than a page in mind: 'where did we write the decision about X', 'is there a convention for Y', 'what does the spec say about Z'. Listing the tree and reading pages one by one to answer that burns the whole wiki and still misses what is buried three levels down. A title match outranks a body match. The excerpt is a fragment, never the answer — open the page you picked with get_page.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'The words to look for, as typed in a search box. Quotes force a phrase ("smart assign"), a leading - excludes a word. Prefer the distinctive nouns of the subject over a whole question: every word must appear in the page for it to match.',
          },
          limit: {
            type: "number",
            description: "How many pages to return, 1–50 (default 20).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_page",
      description:
        "ONE page in full: title, icon, body in MARKDOWN, version, and its direct subpages. This is what you read before writing: copy passages from here verbatim for edit_page_text, and keep the version to replace the body safely with update_page. A '[[page:<id>]]' line is a LINK to a subpage, never its content — read that page too if you need it.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page id, from list_pages." },
        },
        required: ["page_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_page",
      description:
        "Create a page in the project's wiki, optionally UNDER an existing page. Write it FILLED — a title and a real body in one call, not an empty page to fill later. A page is for knowledge that outlives a ticket; work to do belongs in an issue (create_issue), not here. Prefer a subpage of the right parent over a new root page: a flat wiki stops being read.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Page title, plain text (no leading '#', no emoji — the emoji is the icon).",
          },
          markdown: {
            type: "string",
            description: PAGE_BODY_DESCRIPTION,
          },
          icon: {
            type: "string",
            description:
              "A single emoji shown next to the title in the sidebar. Omit for the default icon.",
          },
          parent_page_id: {
            type: "string",
            description:
              "Nest the new page under this one (from list_pages). Omit for a root page.",
          },
        },
        required: ["title", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_page",
      description:
        "Replace a page's body, title or icon. markdown REPLACES the whole body and drops anything you don't resend — so use it to write a page from scratch, never to change part of one: append_to_page adds a block at the end, edit_page_text rewrites one passage. When you do replace the body, pass the version from get_page: the write is then refused if a human or another agent wrote the page meanwhile, instead of silently overwriting them.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page id, from list_pages." },
          markdown: {
            type: "string",
            description:
              "The FULL new body in markdown — it replaces the current one entirely. Omit to change only the title or the icon.",
          },
          version: {
            type: "integer",
            description:
              "The version from get_page, to refuse the write if the page changed since. Always pass it with markdown.",
          },
          title: { type: "string", description: "New title, plain text." },
          icon: {
            type: ["string", "null"],
            description: "New emoji icon; null clears it.",
          },
        },
        required: ["page_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_to_page",
      description:
        "Add a DISTINCT new block at the END of a page WITHOUT touching what is already there, and without re-sending the document — a new section, a decision that just landed, a note. Prefer it to update_page, which rewrites the whole body. Do not use it to fill an existing outline or placeholder: replace that exact passage with edit_page_text, using finished reader-ready prose rather than a 'to add' list. Send ONLY what is new. Refused if someone wrote the page between your read and this call, so nothing of theirs is lost.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page id, from list_pages." },
          markdown: {
            type: "string",
            description:
              "The block to ADD, in markdown. Only what is new — everything already on the page is kept as-is, so never repeat it here.",
          },
        },
        required: ["page_id", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_page_text",
      description:
        "Rewrite ONE passage of a page IN PLACE, the way a code editor patches a file: old_string → new_string, copied VERBATIM from get_page, unique match (add the surrounding lines, or set replace_all). Every other byte is left alone. This is how a sentence gets corrected without re-emitting the page — and it is the safe way round: a full rewrite silently overwrites someone else's edit, a stale old_string fails loudly. To ADD text, append_to_page.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page id, from list_pages." },
          old_string: {
            type: "string",
            description:
              "The exact passage to replace, copied VERBATIM from the markdown get_page returned — whitespace and line breaks included.",
          },
          new_string: {
            type: "string",
            description: "What replaces it. An empty string deletes the passage.",
          },
          replace_all: {
            type: "boolean",
            description:
              "Replace EVERY occurrence instead of requiring a unique match (default false).",
          },
        },
        required: ["page_id", "old_string", "new_string"],
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
      name: "link_issues",
      description:
        "Create or remove a relation between two issues (MIN-25) — the same links the user adds from an issue's Relations section. From `issue_id`'s point of view: 'blocks' (it blocks the target), 'blocked_by' (it is blocked by the target), 'related' (a soft link). These are NOT sub-issues (that is parent_id) and NOT duplicates (that is status 'duplicate' + duplicate_of_id). Blocking relations are read by the cycle filler, which leaves a blocked issue out until its blocker closes. Pass remove: true to delete the relation instead. Idempotent both ways. Read an issue's current relations with get_issue.",
      parameters: {
        type: "object",
        properties: {
          issue_id: {
            type: "string",
            description: "The issue the relation is stated FROM (its perspective).",
          },
          relation: {
            type: "string",
            enum: [...RELATION_TYPE_VALUES],
            description: "The relation, from issue_id's perspective.",
          },
          target_issue_id: {
            type: "string",
            description: "The other issue. Must be in the same project.",
          },
          remove: {
            type: "boolean",
            description: "Remove that relation instead of adding it (default false).",
          },
        },
        required: ["issue_id", "relation", "target_issue_id"],
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
            properties: { ...VIEW_FILTER_PROPERTIES },
            description: "Filter config. Omit a key to not filter on it.",
          },
          sort: {
            type: "string",
            enum: [...VIEW_SORTS],
            description: "Sort order (default manual).",
          },
          display: {
            type: "object",
            properties: {
              hideDone: { type: "boolean" },
              hideRecurring: { type: "boolean" },
            },
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
        "Update a saved kanban view (name, filters, sort, display). Same filter shape and ID rules as create_view. Get view ids via list_views. `filters` REPLACES the whole filter config — read the view with list_views first and resend the keys you want to keep, otherwise you drop them. On the kind='my' system view the name and the assignee filter are locked (assignee stays [\"@me\"]); everything else is editable.",
      parameters: {
        type: "object",
        properties: {
          view_id: { type: "string", description: "View id." },
          name: { type: "string" },
          filters: {
            type: "object",
            properties: { ...VIEW_FILTER_PROPERTIES },
            description:
              "The COMPLETE new filter config (replaces the current one). Omit a key to not filter on it.",
          },
          sort: {
            type: "string",
            enum: [...VIEW_SORTS],
          },
          display: {
            type: "object",
            properties: {
              hideDone: { type: "boolean" },
              hideRecurring: { type: "boolean" },
            },
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
            enum: [...OBJECTIVE_STATUS_VALUES],
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
            enum: [...OBJECTIVE_STATUS_VALUES],
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
      name: "get_feedback_board",
      description:
        "Read the project's PUBLIC feedback board setup — call this before writing any code, link or button that points users at the board. Returns whether the board exists and is enabled, its public_url (the custom domain when the project has a VERIFIED one, otherwise the /f/<token> URL), the custom domain and its status, whether SSO pre-identification is configured, and the display options. ALWAYS take public_url from here verbatim — a board URL cannot be guessed or rebuilt from the project name.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "configure_feedback_board",
      description:
        "Publish or unpublish the project's public feedback board, set its display options (categories shown on posts, shared views and published pages shown as tabs), and/or get its SSO secret. OWNER ONLY. Read the current values with get_feedback_board first. enabled true creates the board if the project has none (collection through the API keeps working when it is off — only the public page 404s). generate_sso_secret true returns the HS256 secret used to pre-identify signed-in users on the board: it NEVER rotates an existing secret (that would break a live integration), it returns the current one or creates the first. The secret is a credential — surface it once, tell the user to put it in an env var (MINDDY_SSO_SECRET), never client-side.",
      parameters: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            description: "true publishes the board, false takes the public page down.",
          },
          generate_sso_secret: {
            type: "boolean",
            description:
              "true returns the board's SSO secret (creating it if the board has none).",
          },
          show_categories: {
            type: "boolean",
            description:
              "Show each post's categories on the public board. Needs an existing board.",
          },
          show_views: {
            type: "boolean",
            description:
              "Show the project's shared views as tabs on the public site, next to the board.",
          },
          allow_comments: {
            type: "boolean",
            description:
              "Let signed-in visitors reply publicly on a request. false leaves the existing thread readable but closes it to new comments; the team can still reply publicly. Needs an existing board.",
          },
          visible_view_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "Which shared views appear as tabs (view ids from list_views — a view must be shared to show up). REPLACES the whole list.",
          },
          show_pages: {
            type: "boolean",
            description:
              "Show the project's published wiki pages as tabs on the public site, next to the board.",
          },
          visible_page_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "Which published pages appear as tabs (page ids from list_pages — a page must be published to show up). REPLACES the whole list.",
          },
        },
      },
    },
  },
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
      name: "add_feedback_comment",
      description:
        "Post a SHORT, team-only internal comment on a feedback post for triage notes. It is never shown on the public board and is signed as Numo in the team timeline. Use two or three sentences or a few one-line bullets. The body is trimmed and capped at 65,536 characters by the comment service. Omit feedback_post_id to target the current feedback post.",
      parameters: {
        type: "object",
        properties: {
          feedback_post_id: {
            type: "string",
            description: "Feedback post id. Omit to target the current post.",
          },
          body: {
            type: "string",
            description:
              "Short markdown triage note: two or three sentences or a few one-line bullets.",
          },
        },
        required: ["body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "respond_to_feedback",
      description:
        "Reply PUBLICLY on a feedback post — the message is posted to the board's public thread, where everyone reading the request sees it, signed on behalf of the team (never with a member's name, nor yours). This is PUBLIC-facing and cannot be edited or taken back afterwards: only do it when explicitly asked, and post it once it says what the team means. For a short team-only triage note, use add_feedback_comment instead. Omit feedback_post_id to target the current post (feedback comment mode).",
      parameters: {
        type: "object",
        properties: {
          feedback_post_id: {
            type: "string",
            description: "Feedback post id. Omit to target the current post.",
          },
          response: {
            type: "string",
            description: "The public reply, shown on the board (plain text).",
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
        "Update the project's own settings — every switch of its Settings page: identity (name, key, accent color), auto-assign on create, Smart Assign and its per-member rules, the automations switch (the agent loop), AI review of incoming feedback, and feedback translation (enabled, team language, languages to skip). OWNER ONLY — fails for a non-owner. Changing the key rewrites how every issue is referenced (MIND-42 → NEW-42): confirm with the user before doing it. Only pass the fields to change. Smart Assign and automations are plan-gated: turning one ON can be refused for the owner's plan — relay that refusal, don't retry.",
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
          auto_assign_enabled: {
            type: "boolean",
            description:
              "Assign a newly created issue to whoever created it, for everyone on this project.",
          },
          smart_assign_enabled: {
            type: "boolean",
            description:
              "Smart Assign: let the AI propose an assignee for a new issue from the per-member rules below. Plan-gated on activation.",
          },
          smart_assign_rules: {
            type: "object",
            description:
              "Smart Assign rules, as a map user_id → one sentence describing what that person takes on (from list_members). REPLACES the whole map: resend the members you want to keep. An empty text drops a member's rule.",
          },
          automations_enabled: {
            type: "boolean",
            description:
              "Arm the automation loop on THIS project: the account's automation preset then runs the code agent by itself on status changes. Plan-gated on activation. The preset itself is an ACCOUNT setting (update_account_settings, automation_preset) — you cannot write per-project rules.",
          },
          feedback_review_enabled: {
            type: "boolean",
            description:
              "AI review of incoming feedback posts (categorization + moderation before they appear on the public board).",
          },
          feedback_review_skip_over_budget: {
            type: "boolean",
            description:
              "Skip that AI review when the account is over its usage budget, instead of letting it consume.",
          },
          feedback_translate_enabled: {
            type: "boolean",
            description: "Translate incoming feedback into the team's language when needed.",
          },
          feedback_team_language: {
            type: ["string", "null"],
            description: "The team's target language for feedback translation, or null to use the app default.",
          },
          feedback_no_translate_languages: {
            type: "array",
            items: { type: "string" },
            description: "Languages whose feedback should not be translated. Replaces the whole list.",
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
        "Rename and/or recolor an existing category (label). Get the id via list_categories. Only pass the fields to change. (You have no tool to delete a category — the user does that from the project's settings.)",
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
        "Create a named integration — an API key the user's own app uses to push into this project server-to-server. OWNER ONLY. Pick the kind from what they want to collect: 'feedback' for end-user requests (they land on the feedback board with votes and a public status), 'issues' to create issues directly in triage. The result carries a `usage` object with the exact endpoint, payload and error codes for that kind: relay it rather than describing the API from memory. On an 'issues' key, `usage.webhook` is the other direction — minddy calling their app back when issues move — which update_integration_webhook turns on; a 'feedback' key has none, since it creates no issue. The plaintext API key is returned ONCE — surface it immediately, tell them to store it server-side in an env var, and that it won't be shown again.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "A name identifying the integration (max 60 chars).",
          },
          kind: {
            type: "string",
            enum: ["issues", "feedback"],
            description:
              "What the key may do: 'feedback' submits user requests to the feedback board, 'issues' creates issues in triage. A key serves one endpoint family only. Defaults to 'issues'.",
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
        "Tune an integration's outgoing webhook — the signed JSON minddy POSTs to the user's app whenever a followed issue event happens, which is how their app learns a human triaged what it pushed. OWNER ONLY, and 'issues' keys ONLY — a 'feedback' key creates no issue, so it has no webhook and this is refused on one. This is the answer to 'how do I know when the status changes' — never suggest polling. WHERE it delivers is not yours to set: the destination is a permanent outbound channel for everything happening on the project, so the user chooses it themselves in Settings → Integrations. Send back the webhook_url already in place to change the events or the scope, or null to turn the webhook off (its event/scope config is kept). The result carries the full receiver contract (headers, HMAC verification, payload, delivery guarantees) — relay it, none of it is guessable, starting with the HMAC key, which is not the API key. Get the id and the current URL via list_integrations.",
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
              "The URL already configured (from list_integrations), or null to disable the webhook. A new or different one is refused — the user sets the destination in Settings → Integrations.",
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
        "Read the current user's own account settings: display name, email (read-only), interface language, display theme, the status Numo-created issues land in, the auto-assign (on create / on start) and prompt-copy-auto-start preferences, the cycle preferences (enabled, duration, start day, intensity, auto-capture), the Inbox notification toggles, the code agent's default model and reasoning level, and the automation preset. Call this before update_account_settings so you use exact current values.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_account_settings",
      description:
        "Update the current user's OWN account settings. Only pass the fields to change. Applies to the requesting user only — never another account. The display theme is saved on the account, so it applies to every device of the user.",
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
          theme: {
            type: ["string", "null"],
            enum: [...ACCOUNT_THEMES, null],
            description:
              "Display theme, saved on the account so every device of the user picks it up. null clears it: devices fall back to their own default.",
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
          smart_fill: {
            type: "boolean",
            description:
              "When creating an issue, let Smart-fill infer its priority, effort, categories and objective from the title and description.",
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
          notif_assigned: {
            type: "boolean",
            description: "Inbox: notify when an issue is assigned to the user.",
          },
          notif_mention: {
            type: "boolean",
            description: "Inbox: notify when the user is mentioned.",
          },
          notif_comment: {
            type: "boolean",
            description: "Inbox: notify on comments on what the user follows.",
          },
          notif_agent: {
            type: "boolean",
            description:
              "Inbox: notify on code-agent activity — a run finishes, asks a question or fails, and automation chains.",
          },
          notif_routine: {
            type: "boolean",
            description:
              "Inbox: notify when one of the user's scheduled routines finishes a run, opens a pull request or fails.",
          },
          notif_pull_request: {
            type: "boolean",
            description:
              "Inbox: notify on pull-request activity — one opens on a project the user belongs to, or theirs is reviewed or merged.",
          },
          notif_feedback: {
            type: "boolean",
            description: "Inbox: notify on feedback-board activity.",
          },
          notif_page: {
            type: "boolean",
            description:
              "Inbox: notify on wiki-page activity — the user is mentioned in a page, or the agent writes in one on their behalf.",
          },
          automation_preset: {
            type: ["string", "null"],
            enum: [...AUTOMATION_PRESET_IDS, null],
            description:
              "The automation loop applied to EVERY project this account owns (each project still has its own on/off switch — update_project, automations_enabled). null clears it: no loop at all, without touching each project.",
          },
          default_model: {
            type: ["string", "null"],
            description:
              "The code agent's default model id for this account. Resolve the exact id with list_agent_models first — a model absent from the active provider, or above the plan's usage ceiling, is refused. null falls back to minddy's own default.",
          },
          default_reasoning_level: {
            type: ["string", "null"],
            enum: [...REASONING_LEVELS, null],
            description:
              "How much the code agent reasons before acting, by default. null falls back to minddy's default.",
          },
        },
      },
    },
  },
  // ── Trash (MIN-133 — personal & cross-project, like the app's own) ────
  {
    type: "function",
    function: {
      name: "list_trash",
      description:
        "List what the user can still recover: the issues, objectives, feedback posts, routines and projects deleted from their projects, newest first, with who deleted them and when. Deleted items stay here for a limited number of days (the result carries `retention_days`) and then go for good. Routines only show up for projects the user OWNS — nobody else can restore one. Call it to answer 'what did I delete?' and to get the ids restore_from_trash takes.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [...TRASH_TYPES],
            description: "Only items of this kind. Omit for all.",
          },
          limit: { type: "number", description: "Max rows (default 50, max 200)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_to_trash",
      description:
        "Move an issue, objective, feedback post, routine or project to the trash — the app's own delete. It is REVERSIBLE (restore_from_trash brings it back exactly as it was, comments, attachments, sub-issues, links and a routine's past runs included) but it takes the item out of every board and list, so confirm with ask_user first. Deleting is NOT the same as canceling: 'canceled' is a status that stays on the board and says the work was dropped, the trash says the item should not have existed. Do what the user actually asked for. A project and a routine can only be trashed by the project's OWNER; trashing a project leaves its issues attached, so restoring it brings everything back. A trashed routine stops running — to merely pause one, use update_routine with enabled: false. Nothing cascades and nothing is detached.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [...TRASH_TYPES],
            description: "What kind of item to trash.",
          },
          id: {
            type: "string",
            description:
              "Id of the item (resolve it with list_issues / list_objectives / list_feedback / list_projects first).",
          },
        },
        required: ["type", "id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "restore_from_trash",
      description:
        "Bring an item back from the trash, exactly as it was — a routine comes back with its cadence, its instruction, its next occurrence and its past runs. Get the type and id from list_trash. Restoring an issue, objective, feedback or routine whose PROJECT is itself in the trash fails — restore the project first.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [...TRASH_TYPES],
            description: "The item's kind, as given by list_trash.",
          },
          id: { type: "string", description: "The item's id, from list_trash." },
        },
        required: ["type", "id"],
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
        "Add issues (1–50, by id) to the user's CURRENT cycle. Adding ASSIGNS each issue to the user as a side-effect; it NEVER changes the status (the cycle is orthogonal to status). An issue in TRIAGE is refused ('triageCannotJoinCycle'): triage is undecided work, a cycle is a commitment — move it out of triage first. Reassigning an issue to someone else later silently drops it from the cycle, and so does moving it back to triage.",
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
  // ── Scratchpad (the user's personal task notebook) ────────────────────
  {
    type: "function",
    function: {
      name: "get_scratchpad",
      description:
        "Read the user's TASK NOTEBOOK (scratchpad): their single personal, cross-project notes doc of quick things to do right now — not tied to any project, and not the backlog. Markdown with '##' section headings and the same checkbox tasks as an issue plan ('- [ ]' pending, '- [~]' in progress, '- [x]' done, '- [-]' dropped), prose allowed anywhere. Returns the raw markdown, the task progress, the flat task list with its 0-based index in document order (pass those indices to update_scratchpad_tasks) and its `depth` (0 at top level, 1 for a sub-task of the task above it, and so on with no limit — the list is flat, so `depth` is the only thing that says a task belongs to the one before it), the section titles (the values `section` takes in add_scratchpad_tasks), and `rev` — the version to pass back to a write so a concurrent edit by the user is never overwritten. ALWAYS call this before writing to the notebook.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_scratchpad_tasks",
      description:
        "Append one or more NEW tasks to the task notebook without rewriting it — the tool for 'note ça dans mon carnet' / 'add this to my notes'. Each task defaults to 'pending' (unchecked) and must be a single short line. By default they land at the END of the notebook; pass `section` (the exact text of an existing '##' heading, see get_scratchpad) to append at the end of that section instead — an unknown section is rejected. Use `depth` to nest: a task at depth 1 becomes a sub-task of the task right before it. Notebook items are quick personal to-dos: never create an issue for them unless the user asks.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: {
                  type: "string",
                  description: "The task text (single line).",
                },
                state: {
                  type: "string",
                  enum: [...PLAN_TASK_STATES],
                  description: "Initial state (default: pending).",
                },
                depth: {
                  type: "number",
                  description:
                    "Nesting depth: 0 (default) for a top-level task, 1 to make it a sub-task of the task right before it, and so on.",
                },
              },
              required: ["text"],
            },
            description: "The tasks to add, in order (1–50).",
          },
          section: {
            type: "string",
            description:
              "Exact text of a '##' section heading to append under. Omit to add at the end of the notebook.",
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_scratchpad_tasks",
      description:
        "Flip the state of one or more EXISTING notebook tasks WITHOUT rewriting the doc — the precise way to tick items off. Tasks are 0-indexed in document order (the `tasks` array of get_scratchpad); each keeps its text, only its checkbox marker changes. To add tasks use add_scratchpad_tasks; to edit a task's text or remove lines use set_scratchpad. Indices are validated all-or-nothing: a single out-of-range index rejects the whole call. Pass `expected_rev` (the `rev` of the get_scratchpad whose indices you are using) so a concurrent edit can't make you flip the wrong task.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                task_index: {
                  type: "number",
                  description: "0-based task index, in document order.",
                },
                state: {
                  type: "string",
                  enum: [...PLAN_TASK_STATES],
                },
              },
              required: ["task_index", "state"],
            },
            description: "The task-state changes to apply (1–50).",
          },
          expected_rev: {
            type: "number",
            description:
              "The `rev` from the get_scratchpad whose task indices you are using. If the notebook changed since, the indices may point elsewhere and the call is rejected — re-read for fresh indices and retry.",
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_scratchpad",
      description:
        `Replace the ENTIRE task notebook markdown — it overwrites the whole doc, so call get_scratchpad FIRST and preserve everything you are not changing. Use it only for what the surgical tools cannot do: editing a task's text, removing lines, adding/renaming/reordering '##' sections, writing prose. To tick tasks off use update_scratchpad_tasks; to add tasks use add_scratchpad_tasks. Checkbox convention: '- [ ]' to do, '- [~]' in progress, '- [x]' done, '- [-]' dropped. Max ${MAX_SCRATCHPAD_LENGTH} characters; an empty string clears the notebook (confirm with the user first — there is no undo and no history). ALWAYS pass expected_rev (the \`rev\` from your get_scratchpad): the write is rejected instead of clobbering the user's concurrent edits.`,
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "The full new notebook markdown (replaces everything currently there).",
          },
          expected_rev: {
            type: "number",
            description:
              "The `rev` from the get_scratchpad you based this on. If it no longer matches (the user edited meanwhile) the write is rejected — re-read, reapply, retry.",
          },
        },
        required: ["content"],
      },
    },
  },
  // ── Web ───────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web and get back a short factual answer with its sources (url, title, excerpt). Use it ONLY when the answer must come from OUTSIDE minddy and outside what you already know reliably: current events, a product's or library's up-to-date documentation, a release or version number, a price, a link the user asks you to look up, or anything they explicitly ask you to check online. NEVER use it for this workspace — issues, members, categories, views, objectives, settings, the notebook, the feedback board all have their own tools, and those are the only source of truth about minddy. One focused query per call: name the product, version or date that narrows it. Each search costs real money, so never search twice for the same thing, and never search to confirm something you already know.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The search query, in natural language (max 400 characters). Write it in the language the answer is most likely published in — usually English for technical topics.",
          },
        },
        required: ["query"],
      },
    },
  },
  // ── Interaction ──────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user one or more clarifying questions when the ambiguity would materially affect the result. The conversation pauses until they answer, and all questions are answered in ONE reply. Bundle RELATED questions blocking the same piece of work into a single call instead of asking them one at a time across several turns. The user may also skip the questions without answering — proceed with your best judgment then.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            description:
              "Questions to show the user (1–4). Prefer the fewest that unblock the work.",
            items: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description:
                    "The complete question to ask. Clear, specific, ONE short sentence ending with a question mark.",
                },
                header: {
                  type: "string",
                  description:
                    "Very short label displayed as a chip/tab (max 12 chars). Examples: 'Scope', 'Layout', 'Priorité'.",
                },
                multi_select: {
                  type: "boolean",
                  description:
                    "Set true when several answers can be combined (checkboxes). Omit/false for mutually exclusive choices (radio).",
                },
                options: {
                  type: "array",
                  description:
                    "2–4 distinct choices (mutually exclusive unless multi_select). Put the recommended option FIRST and suffix its label with ' (Recommended)'. Do NOT include an 'Other' option — the client adds a free-form one automatically. Omit ONLY for a genuinely open-ended question (the user then gets a free text field).",
                  items: {
                    type: "object",
                    properties: {
                      label: {
                        type: "string",
                        description:
                          "Concise display text for this choice (1–5 words).",
                      },
                      description: {
                        type: "string",
                        description:
                          "One short sentence explaining what this choice means or its impact/tradeoff.",
                      },
                    },
                    required: ["label"],
                  },
                },
              },
              required: ["question", "header"],
            },
          },
        },
        required: ["questions"],
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
        "Start a general conversation with the minddy cloud code agent in this project's repository. A ticket is optional context, not the identity of the conversation. Use `issue_id` for ticket-specific work; omit it for code exploration, explanations, maintenance or any other project-scoped request. `plan`, `implement` and `verify` require an issue; `custom` accepts any prompt. Every call starts its own conversation and branch. A pull request is not automatic. Pass `model` only when the user explicitly names one.",
      parameters: {
        type: "object",
        properties: {
          issue_id: {
            type: "string",
            description: "Optional issue context. Required only for plan, implement and verify.",
          },
          mode: {
            type: "string",
            enum: ["plan", "implement", "verify", "custom"],
            description:
              "Which job to send. The first three are written for you, word for word like the app's own buttons: 'plan' scopes the issue WITHOUT coding (writes the implementation plan, or reviews it task by task when one already exists) and leaves the issue's status alone; 'implement' does the work (the instructions adapt to the issue's plan and effort); 'verify' checks the implementation already done against the plan and the issue's comments, then fixes the bugs it can prove. 'custom' for anything else — then `prompt` IS the job, so write it.",
          },
          prompt: {
            type: "string",
            description:
              "The request for the agent, in the user's language. With a written mode (plan/implement/verify) it is appended as extra precision and can be omitted; with 'custom' it IS the job — say what to do.",
          },
          model: {
            type: "string",
            description: "Optional exact model id to force (only when the user explicitly requests a specific model).",
          },
          reasoning_level: {
            type: "string",
            enum: [...REASONING_LEVELS],
            description:
              "How much the agent reasons before acting, FOR THIS RUN ONLY. Pass it only when the user asks for it on this run ('réfléchis bien', 'vite fait') — otherwise omit it and their account default applies. To change that default, use update_account_settings (default_reasoning_level).",
          },
        },
        // `mode` is REQUIRED: on a small model, an optional field is not
        // simply not filled in — the choice of job would then always be 'custom'
        // by default, and the three native instructions would never be used.
        required: ["mode"],
      },
    },
  },
  // ── Routines (MIN-185) : un run d'agent qui revient tout seul ──────────
  {
    type: "function",
    function: {
      name: "create_routine",
      description: CREATE_ROUTINE_DESCRIPTION,
      // `project_id` is not declared here: in global mode, `buildGlobalTools`
      // inject it and make it REQUIRED for all project tools; in fashion
      // project, it comes from the conversation. Declaring it duplicate would
      // appear twice the same key in `required`.
      parameters: CREATE_ROUTINE_PARAMETERS,
    },
  },
  {
    type: "function",
    function: {
      name: "list_routines",
      description: LIST_ROUTINES_DESCRIPTION,
      parameters: {
        type: "object",
        properties: {
          routine_id: {
            type: "string",
            description:
              "Optional routine id from a previous compact list. Pass it to read that routine with its full instruction.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_routine",
      description: UPDATE_ROUTINE_DESCRIPTION,
      parameters: UPDATE_ROUTINE_PARAMETERS,
    },
  },
  {
    type: "function",
    function: {
      name: "read_pull_request",
      description:
        "Read the pull request attached to an issue: its title, description, state, branch, CI checks, the per-file diffs (patches, capped), and the review comments anchored to specific lines of code (with their file:line anchor and the diff snippet they were written against). Use it to explain what a PR changes or answer questions about its content or review feedback. To make changes to the PR, use launch_code_agent on the linked issue. Works for ANY pull request of the linked repository attached to the issue — one the code agent opened, one a human opened that matched by convention, or one attached with link_pull_request. When the issue carries several, it reads the live one (draft or open), otherwise the most recently updated.",
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
  {
    type: "function",
    function: {
      name: "link_pull_request",
      description:
        "Attach an existing pull request of the project's linked repository to an issue, when it did not attach on its own. A PR normally finds its issue by CONVENTION at ingestion — the issue identifier in the branch name, the title, or a closing line ('Fixes MIND-42') of the description — so use this only for a PR the user points at that shows up with NO issue. Identify it by number ('42', '#42', '!42' for a GitLab merge request) or by the forge URL the user pasted; on the pull requests page, 'cette PR' is the one in context. Attaching also ALIGNS the issue's status on the state of the PR: open → in_review, draft → in_progress, merged → done, closed → todo — say which. The link is DEFINITIVE and cannot be undone: a PR already attached to another issue is refused, and so is an issue that already carries a live (draft or open) PR. Ask the user before attaching when you had to guess either side.",
      parameters: {
        type: "object",
        properties: {
          issue_id: {
            type: "string",
            description:
              "id of the issue to attach the pull request to (resolve via list_issues/search_issues, or use the issue in context).",
          },
          pull_request: {
            type: "string",
            description:
              "The pull request: its number ('42'), '#42', '!42' for a GitLab merge request, or its full URL on the forge.",
          },
        },
        // BOTH are required: on a small model, an optional field is not
        // not filled, and a half-designated attachment makes no sense.
        required: ["issue_id", "pull_request"],
      },
    },
  },
];

// Tools that operate on the requesting user's own account, not on a project —
// they must NOT receive a project_id (neither in global mode nor otherwise).
// The cycle (MIN-32), the task notebook and the trash (MIN-133) are personal &
// cross-project, so their tools live here too — the trash spans every project
// the user can reach, and lib/server/trash.ts does its own access control.
export const ACCOUNT_TOOLS = new Set([
  "get_account_settings",
  "update_account_settings",
  "list_agent_models",
  "list_trash",
  "move_to_trash",
  "restore_from_trash",
  "get_cycle",
  "fill_cycle",
  "add_issues_to_cycle",
  "remove_issues_from_cycle",
  "get_scratchpad",
  "add_scratchpad_tasks",
  "update_scratchpad_tasks",
  "set_scratchpad",
]);

// Tools that never take a project (ask_user, the web, and the account-level
// tools). web_search looks OUTSIDE minddy — a project_id would be meaningless.
const NON_PROJECT_TOOLS = new Set(["ask_user", "web_search", "get_help", ...ACCOUNT_TOOLS]);

// Every tool that operates on a project. In global mode these get a required
// `project_id` parameter injected (see buildGlobalTools).
export const PROJECT_SCOPED_TOOLS = new Set(
  ASSISTANT_TOOLS.map((t) => t.function.name).filter(
    (name) => !NON_PROJECT_TOOLS.has(name)
  )
);

// View tools that, in global mode, operate on the user's CROSS-PROJECT global
// views (project_id null, personal) rather than a project's — so they take NO
// injected project_id there. In project mode they stay project-scoped as usual.
// list_views is in here so the three view tools share one scope rule: without
// it Numo could edit the global view but never read it back.
export const GLOBAL_VIEW_TOOLS = new Set([
  "list_views",
  "create_view",
  "update_view",
]);

/** Global mode adds the project facet to a view's filters — the same one the
    user gets in the toolbar on the global board, and the only filter the
    cross-project view has that a project view doesn't. */
function withProjectFilter(tool: AssistantToolDef): AssistantToolDef {
  const params = tool.function.parameters;
  const filters = params.properties.filters as {
    properties: Record<string, unknown>;
  };
  return {
    ...tool,
    function: {
      ...tool.function,
      description: `${tool.function.description} On the global view, filters.project (project ids from list_projects) narrows it to a subset of projects.`,
      parameters: {
        ...params,
        properties: {
          ...params.properties,
          filters: {
            ...filters,
            properties: {
              ...filters.properties,
              project: VIEW_PROJECT_FILTER_PROPERTY,
            },
          },
        },
      },
    },
  };
}

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
        "List the category, objective and integration filter options across ALL the user's projects, grouped by name. Each entry gives { name, ids } — the ids to drop into a GLOBAL view's filters.category / filters.objective / filters.integration. Use this before filtering the cross-project global view by category, objective or integration. For filters.project, take the ids from list_projects.",
      parameters: { type: "object", properties: {} },
    },
  };

  const augmented = ASSISTANT_TOOLS.map((tool) => {
    // View tools act on the global view in global mode → no project_id
    // injected, and the ones taking filters gain the project facet.
    if (GLOBAL_VIEW_TOOLS.has(tool.function.name)) {
      return tool.function.parameters.properties.filters
        ? withProjectFilter(tool)
        : tool;
    }
    if (!PROJECT_SCOPED_TOOLS.has(tool.function.name)) {
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
