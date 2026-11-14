import "server-only";

import { randomUUID } from "node:crypto";
import { pickFreeCategoryColor } from "@/lib/category-colors";
import { DATABASE_PROPERTY_TYPES, isDatabaseMetadataType, type DatabasePropertyType } from "@/lib/page-databases";
import { DATABASE_CURRENCIES, isDatabaseCurrency, parseDatabaseNumber, type DatabaseNumberFormat } from "@/lib/page-database-number";
import { createPageForAgent, updateDatabaseForAgent } from "@/lib/server/page-tools";

/**
 * `create_page_database` (MIN-917): a database, its columns and its first
 * rows in ONE call, written by name. A small model asked for "a tracker of my
 * applications" reliably fills a dedicated tool whose every field is required;
 * it does not chain create_page { database: true } → update_page_database with
 * generated UUIDs → create_page per entry. This composes those same three
 * kernel calls, so permissions, encryption and activity stay theirs.
 */

const MAX_PROPERTIES = 30;
const MAX_ROWS = 50;
const MAX_OPTIONS = 100;

type NumberDisplay = { number_format?: DatabaseNumberFormat; currency?: string };
type PropertyInput = { name: string; type: DatabasePropertyType; options: string[] } & NumberDisplay;
type BuiltProperty = NumberDisplay & {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options?: Array<{ id: string; name: string; color: string }>;
};

export type CreatePageDatabaseResult =
  | { ok: true; data: Record<string, unknown>; success: boolean }
  | { ok: false; message: string };

const isType = (value: unknown): value is DatabasePropertyType =>
  typeof value === "string" && (DATABASE_PROPERTY_TYPES as readonly string[]).includes(value);

const key = (name: string) => name.trim().toLocaleLowerCase();

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** A select cell may arrive as one name, a multi-select one as a list or a comma-separated string. */
function optionNames(type: DatabasePropertyType, value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (type === "multi_select") {
    const list = Array.isArray(value) ? value : String(value).split(",");
    return list.map((item) => String(item).trim()).filter(Boolean);
  }
  const name = String(value).trim();
  return name ? [name] : [];
}

function parseProperties(raw: unknown): PropertyInput[] | string {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PROPERTIES) {
    return `properties must list 1 to ${MAX_PROPERTIES} columns.`;
  }
  const seen = new Set<string>();
  const out: PropertyInput[] = [];
  for (const item of raw) {
    const row = record(item);
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 80) : "";
    if (!name) return "Every property needs a name.";
    if (seen.has(key(name))) return `Two properties are named "${name}"; names must be unique.`;
    seen.add(key(name));
    if (!isType(row.type)) {
      return `Property "${name}" has an unknown type; use one of: ${DATABASE_PROPERTY_TYPES.join(", ")}.`;
    }
    const options = Array.isArray(row.options)
      ? row.options.filter((option): option is string => typeof option === "string")
      : [];
    // A format belongs to a number column; a plain number carries none.
    const display: NumberDisplay = {};
    if (row.type === "number" && row.number_format === "percent") display.number_format = "percent";
    if (row.type === "number" && row.number_format === "currency") {
      const currency = typeof row.currency === "string" ? row.currency.trim().toUpperCase() : "";
      if (!isDatabaseCurrency(currency)) {
        return `Property "${name}" needs a currency among: ${DATABASE_CURRENCIES.join(", ")}.`;
      }
      display.number_format = "currency";
      display.currency = currency;
    }
    out.push({ name, type: row.type, options, ...display });
  }
  return out;
}

/** Schema with fresh ids; the option names used by the rows join the declared ones. */
function buildSchema(properties: PropertyInput[], rows: Record<string, unknown>[]): BuiltProperty[] {
  return properties.map((property) => {
    const built: BuiltProperty = { id: randomUUID(), name: property.name, type: property.type,
      ...(property.number_format && { number_format: property.number_format }),
      ...(property.currency && { currency: property.currency }) };
    if (property.type !== "select" && property.type !== "multi_select") return built;
    const names = [...property.options];
    for (const row of rows) {
      const values = record(row.values);
      for (const [name, value] of Object.entries(values)) {
        if (key(name) === key(property.name)) names.push(...optionNames(property.type, value));
      }
    }
    const unique = new Map<string, string>();
    for (const name of names) {
      const trimmed = name.trim().slice(0, 80);
      if (trimmed && !unique.has(key(trimmed))) unique.set(key(trimmed), trimmed);
    }
    const colors: string[] = [];
    built.options = [...unique.values()].slice(0, MAX_OPTIONS).map((name) => {
      const color = pickFreeCategoryColor(colors);
      colors.push(color);
      return { id: randomUUID(), name, color };
    });
    return built;
  });
}

/** One row's values, by property id in the formats the database core takes. */
function rowValues(schema: BuiltProperty[], raw: unknown):
  { values: Record<string, unknown>; unknown: string[] } {
  const values: Record<string, unknown> = {};
  const unknown: string[] = [];
  for (const [name, value] of Object.entries(record(raw))) {
    const property = schema.find((item) => key(item.name) === key(name));
    if (!property) { unknown.push(name); continue; }
    if (value === null || value === undefined || isDatabaseMetadataType(property.type)) continue;
    const optionId = (option: string) =>
      property.options?.find((item) => key(item.name) === key(option))?.id;
    switch (property.type) {
      case "select": {
        const id = optionId(optionNames("select", value)[0] ?? "");
        if (id) values[property.id] = id;
        break;
      }
      case "multi_select":
        values[property.id] = optionNames("multi_select", value)
          .map(optionId).filter((id): id is string => Boolean(id));
        break;
      case "number": {
        // A written figure ("25 %", "1 200,50 €") reads as the cell editor reads it.
        const number = typeof value === "number" ? value : parseDatabaseNumber(String(value));
        if (typeof number === "number" && Number.isFinite(number)) values[property.id] = number;
        break;
      }
      case "checkbox":
        values[property.id] = value === true || value === "true";
        break;
      case "people":
        values[property.id] = (Array.isArray(value) ? value : [value]).map(String);
        break;
      default:
        values[property.id] = String(value);
    }
  }
  return { values, unknown };
}

export async function createPageDatabase(
  args: Record<string, unknown>,
  { projectId, actorId }: { projectId: string; actorId: string },
): Promise<CreatePageDatabaseResult> {
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) return { ok: false, message: "title is required." };
  const properties = parseProperties(args.properties);
  if (typeof properties === "string") return { ok: false, message: properties };
  const rows = Array.isArray(args.rows) ? args.rows.map(record) : [];
  if (rows.length > MAX_ROWS) {
    return { ok: false, message: `One call creates at most ${MAX_ROWS} rows; add the rest with create_page.` };
  }
  const titleName = typeof args.title_column === "string" && args.title_column.trim()
    ? args.title_column.trim().slice(0, 80)
    : null;
  if (titleName && properties.some((property) => key(property.name) === key(titleName))) {
    return { ok: false, message: `"${titleName}" is the title column; do not list it again in properties.` };
  }
  const schema = buildSchema(properties, rows);

  const created = await createPageForAgent({
    projectId,
    actorId,
    database: true,
    title,
    icon: typeof args.icon === "string" && args.icon ? args.icon : undefined,
    parentPageId: typeof args.parent_page_id === "string" && args.parent_page_id
      ? args.parent_page_id : null,
  });
  if (!created.ok) return { ok: false, message: created.message };
  const databaseId = created.data.page_id;

  const updated = await updateDatabaseForAgent({
    projectId,
    pageId: databaseId,
    actorId,
    input: {
      page_id: databaseId,
      operation: "schema",
      revision: created.data.database_revision ?? 0,
      schema,
      ...(titleName ? { titleName } : {}),
    },
  });
  if (!updated.ok) {
    return { ok: false, message: `The database page ${databaseId} was created, but its properties were refused: ${updated.message} Fix them with update_page_database on that page instead of creating another one.` };
  }

  const createdRows: Array<Record<string, unknown>> = [];
  const failed: Array<{ index: number; error: string }> = [];
  for (const [index, row] of rows.entries()) {
    const { values, unknown } = rowValues(schema, row.values);
    const entry = await createPageForAgent({
      projectId,
      actorId,
      parentPageId: databaseId,
      title: typeof row.title === "string" ? row.title : "",
      values,
    });
    if (!entry.ok) { failed.push({ index, error: entry.message }); continue; }
    createdRows.push({ index, page_id: entry.data.page_id, title: entry.data.title,
      ...(unknown.length > 0 ? { ignored_properties: unknown } : {}) });
  }

  return {
    ok: true,
    success: failed.length === 0,
    data: {
      ...updated.data,
      properties: schema.map((property) => ({
        id: property.id,
        name: property.name,
        type: property.type,
        ...(property.options ? { options: property.options.map(({ id, name }) => ({ id, name })) } : {}),
      })),
      rows: createdRows,
      failed,
      note: "Add more rows with create_page (parent_page_id = this database, values keyed by the property ids above); change columns with update_page_database.",
    },
  };
}
