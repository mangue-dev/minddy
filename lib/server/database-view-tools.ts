import "server-only";

import { z } from "zod";
import {
  DEFAULT_DATABASE_VIEW,
  MAX_DATABASE_VIEWS,
  MAX_DATABASE_VIEW_NAME,
  type DatabaseProperty,
  type DatabaseView,
  type SavedDatabaseView,
} from "@/lib/page-databases";
import {
  DATABASE_FILTER_OPERATORS,
  MAX_DATABASE_FILTER_CONDITIONS,
  MAX_DATABASE_FILTER_VALUE,
  databaseFilterNeedsValue,
  databaseFilterOperators,
  isDatabaseFilterValue,
  resolveDatabaseViewFilter,
  withDatabaseViewFilter,
  type DatabaseFilterCondition,
  type DatabaseFilterOperator,
  type DatabaseViewFilter,
} from "@/lib/page-database-filters";
import {
  createPageDatabaseView,
  deletePageDatabaseView,
  listPageDatabaseViews,
  updatePageDatabaseView,
} from "@/lib/server/page-database-views";
import { getPage, type PageErrorKey } from "@/lib/server/pages";
import type { PageToolCode, PageToolResult } from "@/lib/server/page-tools";

/**
 * The saved views of a page database, as an agent reads and writes them.
 *
 * Every write goes through `lib/server/page-database-views.ts`, the same
 * repository, validation and sealing as the view strip. This module only
 * translates the agent's flat arguments into a `DatabaseView`, checks the
 * property ids, operators and values against the database schema (the table
 * silently ignores a condition it cannot evaluate, which an agent would never
 * notice) and says refusals in stable codes and English messages, like
 * `lib/server/page-tools.ts`.
 */

/** A filter condition as the agent reads and writes it. */
export interface AgentDatabaseFilterCondition {
  property_id: string;
  operator: DatabaseFilterOperator;
  value?: string;
}

export interface AgentDatabaseFilter {
  match: "and" | "or";
  conditions: AgentDatabaseFilterCondition[];
}

/** A view as the agent reads it: flat, with the names it writes back. */
export interface AgentDatabaseView {
  view_id: string;
  name: string;
  position: number;
  sort: string;
  descending: boolean;
  filters: AgentDatabaseFilter;
  hidden_property_ids: string[];
}

export interface AgentDatabaseViews {
  page_id: string;
  views: AgentDatabaseView[];
  /** The view a create or update produced, also present in `views`. */
  view?: AgentDatabaseView;
  /** Present when the database has no saved view yet. */
  note?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = z.string().regex(UUID);

export const DATABASE_VIEWS_TOOL_SCHEMA = z.object({
  page_id: z.string(),
  operation: z.enum(["create", "update", "delete", "reorder"]),
  view_id: id.optional(),
  name: z.string().min(1).max(MAX_DATABASE_VIEW_NAME).optional(),
  sort: z.string().optional(),
  descending: z.boolean().optional(),
  filters: z.object({
    match: z.enum(["and", "or"]).optional(),
    conditions: z.array(z.object({
      property_id: z.string(),
      operator: z.enum(DATABASE_FILTER_OPERATORS),
      value: z.string().max(MAX_DATABASE_FILTER_VALUE).optional(),
    })).max(MAX_DATABASE_FILTER_CONDITIONS),
  }).nullable().optional(),
  hidden_property_ids: z.array(id).max(30).optional(),
  order: z.array(id).max(MAX_DATABASE_VIEWS).optional(),
});
type ViewsInput = z.infer<typeof DATABASE_VIEWS_TOOL_SCHEMA>;

const jsonSchema = z.toJSONSchema(DATABASE_VIEWS_TOOL_SCHEMA);
export const DATABASE_VIEWS_TOOL_PARAMETERS: {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} = {
  type: "object",
  properties: jsonSchema.properties ?? {},
  required: jsonSchema.required ?? [],
};

/** The tool names a surface gives the database and view tools. */
export interface DatabaseViewToolNames {
  getPage: string;
  updateDatabase: string;
  listViews: string;
  updateViews: string;
  /** The issue board's view tools, when the surface has them. */
  boardViews?: { list: string; create: string; update: string };
}

export const NUMO_DATABASE_VIEW_TOOL_NAMES: DatabaseViewToolNames = {
  getPage: "get_page",
  updateDatabase: "update_page_database",
  listViews: "list_page_database_views",
  updateViews: "update_page_database_views",
  boardViews: { list: "list_views", create: "create_view", update: "update_view" },
};

export const MCP_DATABASE_VIEW_TOOL_NAMES: DatabaseViewToolNames = {
  getPage: "minddy_get_page",
  updateDatabase: "minddy_update_page_database",
  listViews: "minddy_list_page_database_views",
  updateViews: "minddy_update_page_database_views",
};

/** The model contract of the two view tools, shared by Numo and the MCP. */
export function databaseViewsToolDescriptions(names: DatabaseViewToolNames):
  { list: string; update: string } {
  const board = names.boardViews;
  return {
    list:
      "The saved VIEWS of a database page, in the order of its view strip: each has view_id, name, position, sort, descending, filters ({ match: \"and\"|\"or\", conditions: [{ property_id, operator, value }] }) and hidden_property_ids. Views are shared by every project member. When the conversation is about a database page, \"a view\" / \"une vue\" means one of THESE, never an issue board view. An empty list means the database still shows its default view (by position, no filter, every column). " +
      `Read this before ${names.updateViews}.` +
      (board ? ` These are NOT the issue views of ${board.list}.` : ""),
    update:
      `Create, reconfigure, delete or reorder the saved VIEWS of a database page — never its schema or entries (${names.updateDatabase}), never the issue board views${board ? ` (${board.create}/${board.update})` : ""}. ` +
      "When the conversation is about a database page, this is the tool for \"create a view\" / \"crée une vue\", filtering, sorting or hiding columns. " +
      `Read ${names.getPage} for the property ids and option ids, and ${names.listViews} for the view ids, first. ` +
      "operation=create needs name and takes any view field; omitted fields get the default (sort position ascending, no filter, no hidden column); the view is added at the end of the strip. operation=update needs view_id and changes ONLY the fields you pass (name, sort, descending, filters, hidden_property_ids). filters and hidden_property_ids each REPLACE the whole current value: resend the conditions and ids you want to keep. operation=delete needs view_id; the last view cannot be deleted. operation=reorder needs order: EVERY view_id of the database exactly once, in the new strip order. sort is \"position\" (manual order), \"title\" or a property id. filters = { match: \"and\" (every condition, the default) or \"or\" (any condition), conditions: up to 10 { property_id, operator, value } }; null or no conditions removes the filter. Operators by property type: text contains, not_contains, eq, neq (case-insensitive); number eq, neq, gt, lt (value a decimal); select eq, neq (value an option ID, never its name); multi_select contains, not_contains (option ID); people contains, not_contains (member user id); date and created_at eq (same day), gt (after), lt (before) with value YYYY-MM-DD; checkbox eq with \"true\" or \"false\"; every type except checkbox also takes empty and not_empty, without a value. " +
      `Column ORDER is not part of a view: it is the order of the database_schema array, changed with ${names.updateDatabase} operation=schema. The result lists every view after the write.`,
  };
}

const NO_VIEW_NOTE =
  "This database has no saved view yet: it shows the default view (sorted by " +
  "position, no filter, every column). Create one to save a configuration.";

/** What a value means for each property type, for refusals. */
const VALUE_HINT: Record<DatabaseProperty["type"], string> = {
  text: "a non-empty text",
  number: "a decimal number such as \"12.5\"",
  select: "an option id of this property from database_schema",
  multi_select: "an option id of this property from database_schema",
  people: "a member user id",
  date: "a day as YYYY-MM-DD",
  created_at: "a day as YYYY-MM-DD",
  checkbox: "\"true\" (checked) or \"false\" (unchecked)",
};

const fail = <T>(code: PageToolCode, message: string): PageToolResult<T> =>
  ({ ok: false, code, message });
const invalid = <T>(message: string) => fail<T>("invalid_params", message);

/** The view repository's refusals, worded for views rather than cells. */
function refuse<T>(errorKey: PageErrorKey,
  names: DatabaseViewToolNames = NUMO_DATABASE_VIEW_TOOL_NAMES): PageToolResult<T> {
  switch (errorKey) {
    case "pageNotFound":
    case "projectNotFound":
      return fail("page_not_found",
        `No database with this page_id in this project. Read it with ${names.getPage}: is_database must be true.`);
    case "readOnlyProject":
      return fail("forbidden", "Refused: you can only read this project.");
    case "pageDatabaseStale":
      return fail("page_stale",
        "Someone changed this view at the same time. Read the views again and retry.");
    case "pageDatabaseInvalid":
      return invalid("Invalid view: check its name, sort, filter and hidden columns.");
    default:
      return fail("database_error", "Database error.");
  }
}

function flatten(saved: SavedDatabaseView, schema: DatabaseProperty[]): AgentDatabaseView {
  const filters = resolveDatabaseViewFilter(saved.view, schema);
  return {
    view_id: saved.id,
    name: saved.name,
    position: saved.position,
    sort: saved.view.sort,
    descending: saved.view.descending,
    filters: {
      match: filters.match,
      conditions: filters.conditions.map((condition) => ({
        property_id: condition.propertyId,
        operator: condition.operator,
        ...(condition.value !== undefined && { value: condition.value }),
      })),
    },
    hidden_property_ids: saved.view.hidden,
  };
}

function listed(pageId: string, views: SavedDatabaseView[], schema: DatabaseProperty[],
  view?: SavedDatabaseView): AgentDatabaseViews {
  return {
    page_id: pageId,
    views: views.map((saved) => flatten(saved, schema)),
    ...(view && { view: flatten(view, schema) }),
    ...(!views.length && { note: NO_VIEW_NOTE }),
  };
}

/** The views of a database, in the order of its view strip. */
export async function listDatabaseViewsForAgent({ projectId, pageId, actorId,
  names = NUMO_DATABASE_VIEW_TOOL_NAMES }: {
  projectId: string; pageId: string; actorId: string;
  /** The surface's tool names, quoted in refusals. */
  names?: DatabaseViewToolNames;
}): Promise<PageToolResult<AgentDatabaseViews>> {
  // The schema converts the single filter of views saved before conditions.
  const schema = await databaseSchema(projectId, pageId, actorId, names);
  if (!schema.ok) return schema;
  const result = await listPageDatabaseViews(projectId, pageId, actorId);
  return result.ok ? { ok: true, data: listed(pageId, result.page, schema.data) }
    : refuse(result.errorKey, names);
}

/** The database's properties; also proves the page is a database of the project. */
async function databaseSchema(projectId: string, pageId: string, actorId: string,
  names: DatabaseViewToolNames):
  Promise<PageToolResult<DatabaseProperty[]>> {
  if (!UUID.test(pageId)) return refuse("pageNotFound", names);
  const page = await getPage(pageId, actorId, { projectId });
  if (!page.ok) return refuse(page.errorKey, names);
  if (page.page.project_id !== projectId || page.page.database_schema == null)
    return refuse("pageNotFound", names);
  return { ok: true, data: page.page.database_schema };
}

/** The agent's filter, every condition checked against the schema. */
function agentFilter(input: NonNullable<ViewsInput["filters"]>,
  known: Map<string, DatabaseProperty>): PageToolResult<DatabaseViewFilter> {
  const conditions: DatabaseFilterCondition[] = [];
  for (const [index, condition] of input.conditions.entries()) {
    const at = `filters.conditions[${index}]`;
    const property = known.get(condition.property_id);
    if (!property)
      return invalid(`${at}.property_id must be a property id from database_schema.`);
    const allowed = databaseFilterOperators(property.type);
    if (!allowed.includes(condition.operator))
      return invalid(`${at}.operator "${condition.operator}" does not apply to the ${property.type} property "${property.name}"; use one of: ${allowed.join(", ")}.`);
    const needsValue = databaseFilterNeedsValue(condition.operator);
    if (needsValue && !isDatabaseFilterValue(property, condition.value))
      return invalid(`${at}.value must be ${VALUE_HINT[property.type]} for operator "${condition.operator}" on "${property.name}".`);
    conditions.push({ id: crypto.randomUUID(), propertyId: property.id,
      operator: condition.operator, ...(needsValue && { value: condition.value }) });
  }
  return { ok: true, data: { match: input.match ?? "and", conditions } };
}

/** Apply the requested fields on `base`; `filters` replaces the whole filter. */
function mergeView(base: DatabaseView, input: ViewsInput, schema: DatabaseProperty[]):
  PageToolResult<DatabaseView> {
  const known = new Map(schema.map((property) => [property.id, property]));
  let next: DatabaseView = { ...base, hidden: [...base.hidden],
    filters: resolveDatabaseViewFilter(base, schema) };
  if (input.sort !== undefined) {
    if (input.sort !== "position" && input.sort !== "title" && !known.has(input.sort))
      return invalid("sort must be \"position\", \"title\" or a property id from database_schema.");
    next.sort = input.sort;
  }
  if (input.descending !== undefined) next.descending = input.descending;
  if (input.filters !== undefined) {
    const filters = input.filters === null ? { ok: true as const, data: { match: "and" as const,
      conditions: [] } } : agentFilter(input.filters, known);
    if (!filters.ok) return filters;
    next = withDatabaseViewFilter(next, filters.data, schema);
  }
  if (input.hidden_property_ids !== undefined) {
    const unknown = input.hidden_property_ids.filter((hidden) => !known.has(hidden));
    if (unknown.length)
      return invalid(`hidden_property_ids must be property ids from database_schema: ${unknown.join(", ")}.`);
    next.hidden = [...new Set(input.hidden_property_ids)];
  }
  return { ok: true, data: next };
}

/** Create, reconfigure, delete or reorder the saved views of a database. */
export async function updateDatabaseViewsForAgent({ projectId, pageId, actorId, input,
  names = NUMO_DATABASE_VIEW_TOOL_NAMES }: {
  projectId: string; pageId: string; actorId: string; input: unknown;
  /** The surface's tool names, quoted in refusals. */
  names?: DatabaseViewToolNames;
}): Promise<PageToolResult<AgentDatabaseViews>> {
  const parsed = DATABASE_VIEWS_TOOL_SCHEMA.safeParse(input);
  if (!parsed.success)
    return invalid(`Invalid arguments: ${parsed.error.issues.map((issue) =>
      `${issue.path.join(".") || "input"} ${issue.message}`).join("; ")}.`);
  const args = parsed.data;
  const schema = await databaseSchema(projectId, pageId, actorId, names);
  if (!schema.ok) return schema;
  const current = await listPageDatabaseViews(projectId, pageId, actorId);
  if (!current.ok) return refuse(current.errorKey, names);
  const views = current.page;
  const target = args.view_id ? views.find((view) => view.id === args.view_id) : undefined;
  if ((args.operation === "update" || args.operation === "delete") && !target)
    return invalid(`view_id must be one of this database's views (${names.listViews}).`);
  const reread = async (view?: SavedDatabaseView): Promise<PageToolResult<AgentDatabaseViews>> => {
    const after = await listPageDatabaseViews(projectId, pageId, actorId);
    return after.ok ? { ok: true, data: listed(pageId, after.page, schema.data, view) }
      : refuse(after.errorKey, names);
  };

  switch (args.operation) {
    case "create": {
      if (!args.name) return invalid("A new view needs a name.");
      if (views.length >= MAX_DATABASE_VIEWS)
        return invalid(`A database keeps at most ${MAX_DATABASE_VIEWS} views; delete one first.`);
      const view = mergeView(DEFAULT_DATABASE_VIEW, args, schema.data);
      if (!view.ok) return view;
      const created = await createPageDatabaseView(projectId, pageId, actorId,
        { name: args.name, view: view.data });
      return created.ok ? reread(created.page) : refuse(created.errorKey, names);
    }
    case "update": {
      const view = mergeView(target!.view, args, schema.data);
      if (!view.ok) return view;
      const updated = await updatePageDatabaseView(projectId, pageId, target!.id, actorId,
        { ...(args.name !== undefined && { name: args.name }), view: view.data });
      return updated.ok ? reread(updated.page) : refuse(updated.errorKey, names);
    }
    case "delete": {
      if (views.length <= 1)
        return invalid("A database keeps at least one saved view: rename or reconfigure it instead.");
      const deleted = await deletePageDatabaseView(projectId, pageId, target!.id, actorId);
      return deleted.ok ? reread() : refuse(deleted.errorKey, names);
    }
    case "reorder": {
      const order = args.order ?? [];
      const ids = new Set(views.map((view) => view.id));
      if (order.length !== ids.size || new Set(order).size !== order.length ||
          !order.every((viewId) => ids.has(viewId)))
        return invalid("order must list every view_id of this database exactly once, in the new order.");
      // One write per moved view: the repository has no batch move, and the
      // positions 1..n keep the strip order whatever the previous gaps were.
      for (const [index, viewId] of order.entries()) {
        if (views.find((view) => view.id === viewId)?.position === index + 1) continue;
        const moved = await updatePageDatabaseView(projectId, pageId, viewId, actorId,
          { position: index + 1 });
        if (!moved.ok) return refuse(moved.errorKey, names);
      }
      return reread();
    }
  }
}
