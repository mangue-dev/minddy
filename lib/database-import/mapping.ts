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
      new Set(values).size <= 100 &&
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
      const labels = [
        ...new Set(
          rows.flatMap((row) =>
            column.type === "multi_select"
              ? selectionLabels(row[index])
              : row[index].trim()
                ? [row[index].trim()]
                : [],
          ),
        ),
      ];
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
      return property.options!.find((option) => option.name === value.trim())!
        .id;
    case "multi_select":
      return selectionLabels(value).map(
        (label) =>
          property.options!.find((option) => option.name === label)!.id,
      );
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
