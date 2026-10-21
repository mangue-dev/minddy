import { createUuid } from "@/lib/create-uuid";
import {
  isDatabaseSchema,
  isDatabaseValue,
  parseDatabaseNumber,
  type DatabaseProperty,
  type DatabaseValue,
} from "@/lib/page-databases";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import type { ImportColumn, ImportColumnType } from "./types";

const token = (value: string) => value.trim().toLocaleLowerCase();
const TRUE = new Set(["true", "yes", "checked", "1", "☑", "✅"]);
const FALSE = new Set(["false", "no", "unchecked", "0", "☐"]);
export function checkboxValue(value: string): boolean | undefined {
  return TRUE.has(token(value))
    ? true
    : FALSE.has(token(value))
      ? false
      : undefined;
}
/**
 * The identity of a select option: the rule `isDatabaseSchema` enforces, so
 * "Done" and "done" are one option (MIN-703). Option generation and cell
 * conversion both go through it; the first spelling met names the option.
 */
const optionKey = (name: string) => name.trim().toLowerCase();
function distinctOptions(labels: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const label of labels) {
    if (!byKey.has(optionKey(label))) byKey.set(optionKey(label), label);
  }
  return [...byKey.values()];
}
function optionId(property: DatabaseProperty, label: string): string {
  return property.options!.find((option) => optionKey(option.name) === optionKey(label))!.id;
}

export function selectionLabels(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;]/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}
export function inferColumns(
  headers: string[],
  rows: string[][],
): ImportColumn[] {
  let title = headers.findIndex((header) =>
    /^(name|title|nom|titre|task name|page)$/i.test(header.trim()),
  );
  if (title < 0) title = 0;
  return headers.map((name, index) => {
    const values = rows.map((row) => row[index]?.trim() ?? "").filter(Boolean);
    let type: ImportColumnType = "text";
    if (index === title) type = "title";
    else if (
      values.length &&
      values.every((value) => checkboxValue(value) !== undefined) &&
      values.some((value) => !/^[01]$/.test(value))
    )
      type = "checkbox";
    else if (
      values.length &&
      values.every((value) => parseDatabaseNumber(value) != null)
    )
      type = "number";
    else if (
      values.length &&
      values.every((value) => isDatabaseValue("date", value))
    )
      type = "date";
    else if (
      values.length &&
      values.every((value) => value.length <= 80) &&
      distinctOptions(values).length <= 100 &&
      /status|state|category|priority|type|statut|tag|label/i.test(name)
    )
      type = values.some((value) => /[,;]/.test(value))
        ? "multi_select"
        : "select";
    return { name, type };
  });
}

export function mappedColumns(
  columns: ImportColumn[],
  rows: string[][],
): DatabaseProperty[] {
  if (
    columns.filter((column) => column.type === "title").length !== 1 ||
    columns.length > 31 ||
    columns.some((column) => !column.name.trim() || column.name.length > 80)
  )
    throw new Error("importInvalidMapping");
  const schema = columns.flatMap((column, index) => {
    if (column.type === "title") return [];
    const property: DatabaseProperty = {
      id: createUuid(),
      name: column.name.trim(),
      type: column.type,
    };
    if (column.type === "select" || column.type === "multi_select") {
      const labels = distinctOptions(
        rows.flatMap((row) =>
          column.type === "multi_select"
            ? selectionLabels(row[index])
            : row[index].trim()
              ? [row[index].trim()]
              : [],
        ),
      );
      if (labels.length > 100 || labels.some((label) => label.length > 80))
        throw new Error("importInvalidMapping");
      property.options = labels.map((name, i) => ({
        id: createUuid(),
        name,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }));
    }
    return [property];
  });
  if (!isDatabaseSchema(schema)) throw new Error("importInvalidMapping");
  return schema;
}

/** Refuse lossy mappings: the preview can switch the entire column back to text. */
export function importCell(
  value: string,
  property: DatabaseProperty,
  people: ReadonlyMap<string, string>,
): DatabaseValue {
  if (!value.trim()) return null;
  switch (property.type) {
    case "number": {
      const number = parseDatabaseNumber(value.trim());
      if (number === undefined) throw new Error("importInvalidMapping");
      return number;
    }
    case "checkbox": {
      const checked = checkboxValue(value);
      if (checked === undefined) throw new Error("importInvalidMapping");
      return checked;
    }
    case "date":
      if (!isDatabaseValue("date", value.trim()))
        throw new Error("importInvalidMapping");
      return value.trim();
    case "select":
      return optionId(property, value);
    case "multi_select":
      return [...new Set(selectionLabels(value).map((label) => optionId(property, label)))];
    case "people": {
      const ids = selectionLabels(value).map((label) =>
        people.get(token(label)),
      );
      if (ids.some((id) => !id)) throw new Error("importUnmatchedPeople");
      return [...new Set(ids as string[])];
    }
    default:
      if (value.length > 2000) throw new Error("importLongText");
      return value;
  }
}
