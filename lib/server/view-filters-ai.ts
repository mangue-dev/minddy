import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
} from "@/lib/issue-validation";
import type { DecisionOption, DecisionQuestion, DecisionSpec } from "@/lib/server/decisions/types";
import type { ViewFilters } from "@/lib/types";

/**
 * The view-filters use case of the decision layer (MIN-592): the filters
 * popover's AI input turns one free-text wish into a concrete `ViewFilters`
 * selection.
 *
 * The spec keeps the layer's cardinal rule — the engines may pick a wrong
 * OPTION, they can never INVENT one: every question is a multi_choice over
 * the options the caller's board can actually filter on (real member,
 * category, objective and project ids, the enum values verbatim), and the
 * "nothing" sentinels are the same semantics the filter schema uses (null).
 * The consumer (`filtersOfAnswers`) only copies echoed values into the
 * `ViewFilters` shape — anything else is dropped by construction.
 *
 * `useCase: "smart_triage"` reuses the one AI use case the boards already
 * bill under (Automations) — a view-filter pass is the same "read the board
 * and select" family. Renaming is a schema migration, not a win.
 */

/** The boards cap their option lists (categories, objectives…) to this many
 * rows — the same ceiling `buildSmartFillSpec` applies to its context. */
const MAX_OPTIONS_PER_QUESTION = 60;

/** The string standing in for a filter's null (unassigned / no objective /
    no project) inside a decision OPTION value — engines echo strings, and
    the wire format forbids the ":" separator, so null rides a word. */
export const VIEW_FILTER_NONE_VALUE = "null";

/** "@me" (lib/view-filter) — the dynamic "assigned to me" sentinel. */
const ME_ASSIGNEE = "@me";

/** One selectable row of a facet, exactly the shape the popover rows carry. */
export interface ViewFilterOption {
  /** The value echoed into the `ViewFilters` array (an id, an enum value,
      the "@me" sentinel — or VIEW_FILTER_NONE_VALUE for a filter null). */
  value: string;
  /** Human-readable name, shown to the engines as the option's meaning. */
  label: string;
}

export interface ViewFilterFacets {
  statuses: ViewFilterOption[];
  priorities: ViewFilterOption[];
  efforts: ViewFilterOption[];
  assignees: ViewFilterOption[];
  categories: ViewFilterOption[];
  objectives: ViewFilterOption[];
  /** Global board only — a project board is single-project. */
  projects: ViewFilterOption[];
}

const enumOptions = (
  values: readonly string[],
  labels: Record<string, string>
): ViewFilterOption[] => values.map((v) => ({ value: v, label: labels[v] ?? v }));

const STATUS_LABELS: Record<string, string> = {
  triage: "Triage",
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  canceled: "Canceled",
  duplicate: "Duplicate",
};
const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};
const EFFORT_LABELS: Record<string, string> = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  none: "No estimate",
};

/** Member names resolved through the cached auth lookup (lib/server/auth-users). */
async function memberNameMap(memberIds: string[]): Promise<Map<string, string>> {
  const users = await fetchAuthUsersById(getServiceClient(), memberIds);
  return new Map(
    [...users.values()].map((user) => [user.id, displayName(toNamed(user))])
  );
}

const assigneeOptions = (names: Map<string, string>, memberIds: string[]): ViewFilterOption[] => [
  { value: ME_ASSIGNEE, label: "Assigned to me" },
  { value: VIEW_FILTER_NONE_VALUE, label: "Unassigned" },
  ...memberIds.map((id) => ({ value: id, label: names.get(id) ?? "Member" })),
];

/** Collapse same-named options (a "Bug" category in several projects) into
    ONE row — the popover's groupFacetsByName on the global board. */
function foldByName(options: ViewFilterOption[]): ViewFilterOption[] {
  const byName = new Map<string, ViewFilterOption>();
  for (const o of options) {
    if (!byName.has(o.label)) byName.set(o.label, o);
  }
  return [...byName.values()];
}

export interface ViewFilterOptionsInput {
  /** The board's scope: a project id, or null for the global cross-project
      board (which adds the project facet). */
  projectId: string | null;
  userId: string;
}

/**
 * Resolve EVERY filter option the caller's board can actually filter on —
 * real ids only, from the same tables and access rules the saved views
 * themselves honor. The global board folds its cross-project facets flat
 * (a same-named category in several projects is one row), exactly like the
 * popover's `groupFacetsByName`.
 */
export async function resolveViewFilterOptions(
  input: ViewFilterOptionsInput
): Promise<ViewFilterFacets> {
  const service = getServiceClient();
  const { userId, projectId } = input;

  const statuses = enumOptions(ISSUE_STATUSES, STATUS_LABELS);
  const priorities = enumOptions(ISSUE_PRIORITIES, PRIORITY_LABELS);
  const efforts = enumOptions(ISSUE_EFFORTS, EFFORT_LABELS);

  if (projectId) {
    // Single-project board: members and facets are the project's own.
    const [memberRows, categoryRows, objectiveRows] = await Promise.all([
      service.from("project_members").select("user_id").eq("project_id", projectId),
      service.from("categories").select("id, name").eq("project_id", projectId),
      service
        .from("objectives")
        .select("id, name")
        .eq("project_id", projectId)
        .is("deleted_at", null),
    ]);
    const memberIds = ((memberRows.data ?? []) as { user_id: string }[]).map((m) => m.user_id);
    return {
      statuses,
      priorities,
      efforts,
      assignees: assigneeOptions(await memberNameMap(memberIds), memberIds),
      categories: ((categoryRows.data ?? []) as { id: string; name: string }[]).map((c) => ({
        value: c.id,
        label: c.name,
      })),
      objectives: [
        { value: VIEW_FILTER_NONE_VALUE, label: "No objective" },
        ...((objectiveRows.data ?? []) as { id: string; name: string }[]).map((o) => ({
          value: o.id,
          label: o.name,
        })),
      ],
      projects: [],
    };
  }

  // Global (cross-project) board: the union of every project the user still
  // accesses — owner + memberships, the same electorate the Numo tools read.
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    service
      .from("projects")
      .select("id, name")
      .eq("owner_id", userId)
      .is("deleted_at", null),
    service.from("project_members").select("project_id").eq("user_id", userId),
  ]);
  const projectIds = [
    ...new Set([
      ...((owned ?? []) as { id: string }[]).map((p) => p.id),
      ...((memberships ?? []) as { project_id: string }[]).map((m) => m.project_id),
    ]),
  ];
  const { data: projects } = projectIds.length
    ? await service
        .from("projects")
        .select("id, name")
        .in("id", projectIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
    : { data: [] };

  const [memberRows, categoryRows, objectiveRows] = await Promise.all([
    projectIds.length
      ? service.from("project_members").select("user_id").in("project_id", projectIds)
      : Promise.resolve({ data: [] } as { data: unknown[] | null }),
    projectIds.length
      ? service.from("categories").select("id, name").in("project_id", projectIds)
      : Promise.resolve({ data: [] } as { data: unknown[] | null }),
    projectIds.length
      ? service
          .from("objectives")
          .select("id, name")
          .in("project_id", projectIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] } as { data: unknown[] | null }),
  ]);
  const memberIds = [
    ...new Set(((memberRows.data ?? []) as { user_id: string }[]).map((m) => m.user_id)),
  ];

  return {
    statuses,
    priorities,
    efforts,
    assignees: assigneeOptions(await memberNameMap(memberIds), memberIds),
    categories: foldByName(
      ((categoryRows.data ?? []) as { id: string; name: string }[]).map((c) => ({
        value: c.id,
        label: c.name,
      }))
    ),
    objectives: [
      { value: VIEW_FILTER_NONE_VALUE, label: "No objective" },
      ...foldByName(
        ((objectiveRows.data ?? []) as { id: string; name: string }[]).map((o) => ({
          value: o.id,
          label: o.name,
        }))
      ),
    ],
    projects: ((projects ?? []) as { id: string; name: string }[]).map((p) => ({
      value: p.id,
      label: p.name,
    })),
  };
}

/**
 * The decision spec: the wish as the state, one multi_choice question per
 * facet the board offers. The engines pick zero or more REAL options per
 * facet; an EMPTY answer means "do not filter on it" — never "filter
 * everything out".
 */
export function buildViewFiltersSpec(input: {
  /** The user's free-text wish, verbatim. */
  wish: string;
  /** The board's scope, for the state's framing. */
  projectId: string | null;
  facets: ViewFilterFacets;
}): DecisionSpec {
  const { wish, projectId, facets } = input;

  const questions: DecisionQuestion[] = [];
  const askMulti = (
    key: keyof ViewFilters & string,
    label: string,
    options: ViewFilterOption[]
  ) => {
    const capped = options.slice(0, MAX_OPTIONS_PER_QUESTION);
    if (capped.length === 0) return; // nothing to select from — no question
    questions.push({
      key,
      kind: "multi_choice",
      label,
      options: capped.map(
        (o): DecisionOption => ({
          value: o.value,
          label: o.label,
          ...(o.value === VIEW_FILTER_NONE_VALUE
            ? { description: `Select to keep the issues with no ${key}.` }
            : {}),
        })
      ),
      maxSelections: capped.length,
    });
  };

  askMulti("status", "Which statuses should the view KEEP?", facets.statuses);
  askMulti("priority", "Which priorities should the view KEEP?", facets.priorities);
  askMulti("effort", "Which effort estimates should the view KEEP?", facets.efforts);
  askMulti("assignee", "Which assignees should the view KEEP?", facets.assignees);
  askMulti("category", "Which categories should the view KEEP?", facets.categories);
  askMulti("objective", "Which objectives should the view KEEP?", facets.objectives);
  if (projectId === null) {
    askMulti("project", "Which projects should the view KEEP?", facets.projects);
  }

  return {
    useCase: "smart_triage",
    state: {
      request: wish.slice(0, 500),
      scope: projectId === null ? "cross-project global board" : "single project board",
    },
    questions,
    llm: {
      toolName: "select_view_filters",
      parameters: viewFiltersLlmParameters(questions),
      systemPrompt:
        "You select the filters of a kanban board view from the user's request. " +
        "Every question is one filter facet; pick the options the request asks to KEEP. " +
        "Pick nothing for a facet the request does not mention — an unmentioned facet must stay unfiltered. " +
        "Never invent a value: answer only with the option values offered.",
      userMessage: `Request: ${wish.slice(0, 500)}`,
    },
  };
}

/** The LLM fallback's tool schema, rebuilt from the SAME questions — one
    array per question key, values restricted to the offered options. */
function viewFiltersLlmParameters(
  questions: DecisionQuestion[]
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const question of questions) {
    if (question.kind !== "multi_choice") continue;
    properties[question.key] = {
      type: "array",
      description: question.label,
      items: { type: "string", enum: question.options.map((o) => o.value) },
    };
    required.push(question.key);
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

/** A multi-choice answer as the set of echoed option values. */
function answerValues(answer: unknown): string[] {
  if (!answer || typeof answer !== "object") return [];
  const value = (answer as { value?: unknown }).value;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Fold the answers into a `ViewFilters` — ONLY echoed values survive, and
 * every value is checked against the options the spec offered, so a stray
 * engine hallucination can never reach the stored config. The "nothing"
 * sentinels translate back to filter nulls; an EMPTY facet means "do not
 * filter on it".
 */
export function filtersOfAnswers(
  spec: DecisionSpec,
  answers: Record<string, unknown>
): ViewFilters {
  const filters: ViewFilters = {};
  for (const question of spec.questions) {
    if (question.kind !== "multi_choice") continue;
    const valid = new Set(question.options.map((o) => o.value));
    const picked = answerValues(answers[question.key]).filter((v) => valid.has(v));
    if (picked.length === 0) continue; // unmentioned facet — leave unfiltered
    const values = picked.map((v) => (v === VIEW_FILTER_NONE_VALUE ? null : v));
    switch (question.key) {
      case "status":
        filters.status = values as ViewFilters["status"];
        break;
      case "priority":
        filters.priority = values as ViewFilters["priority"];
        break;
      case "effort":
        filters.effort = values as ViewFilters["effort"];
        break;
      case "assignee":
        filters.assignee = values as ViewFilters["assignee"];
        break;
      case "category":
        filters.category = values as ViewFilters["category"];
        break;
      case "objective":
        filters.objective = values as ViewFilters["objective"];
        break;
      case "project":
        filters.project = values as ViewFilters["project"];
        break;
    }
  }
  return filters;
}
