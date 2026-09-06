/** Basic page database properties. Property IDs survive renames and reordering. */
export const DATABASE_PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "created_at",
  "date",
  "people",
  "checkbox",
] as const;
export type DatabasePropertyType = (typeof DATABASE_PROPERTY_TYPES)[number];
export interface DatabaseProperty {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options?: DatabaseSelectOption[];
}
export interface DatabaseSelectOption {
  id: string;
  name: string;
  color: string;
}
export type DatabaseValue = string | string[] | number | boolean | null;
export const MAX_DATABASE_OPTIONS = 100;
export type DatabaseValues = Record<string, DatabaseValue>;
export const MAX_DATABASE_PROPERTIES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDatabaseSchema(value: unknown): value is DatabaseProperty[] {
  if (!Array.isArray(value) || value.length > MAX_DATABASE_PROPERTIES)
    return false;
  const ids = new Set<string>();
  return value.every((property) => {
    if (
      !property ||
      typeof property !== "object" ||
      !UUID.test(property.id) ||
      typeof property.name !== "string" ||
      !property.name.trim() ||
      property.name.length > 80 ||
      !DATABASE_PROPERTY_TYPES.includes(property.type) ||
      ids.has(property.id)
    )
      return false;
    if (property.options !== undefined) {
      if (
        !["select", "multi_select"].includes(property.type) ||
        !Array.isArray(property.options) ||
        property.options.length > MAX_DATABASE_OPTIONS
      )
        return false;
      const optionIds = new Set<string>();
      const names = new Set<string>();
      for (const option of property.options) {
        if (
          !option ||
          typeof option !== "object" ||
          !UUID.test(option.id) ||
          typeof option.name !== "string" ||
          !option.name.trim() ||
          option.name.length > 80 ||
          typeof option.color !== "string" ||
          !/^#[0-9a-f]{6}$/i.test(option.color) ||
          optionIds.has(option.id) ||
          names.has(option.name.trim().toLowerCase())
        )
          return false;
        optionIds.add(option.id);
        names.add(option.name.trim().toLowerCase());
      }
    }
    ids.add(property.id);
    return true;
  });
}

export function isDatabaseValue(
  type: DatabasePropertyType,
  value: unknown,
): value is DatabaseValue {
  if (type === "created_at") return false;
  if (value === null) return true;
  switch (type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "select":
      return typeof value === "string" && UUID.test(value);
    case "multi_select":
      return (
        Array.isArray(value) &&
        value.length <= MAX_DATABASE_OPTIONS &&
        value.every((id) => typeof id === "string" && UUID.test(id)) &&
        new Set(value).size === value.length
      );
    case "checkbox":
      return typeof value === "boolean";
    case "text":
      return typeof value === "string" && value.length <= 2000;
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    }
    case "people":
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every((id) => typeof id === "string" && UUID.test(id)) &&
        new Set(value).size === value.length
      );
  }
}

export function databaseValueText(
  value: DatabaseValue | undefined,
  names: ReadonlyMap<string, string>,
  property?: DatabaseProperty,
): string {
  if (value == null) return "";
  const name = (id: string) =>
    property?.options?.find((option) => option.id === id)?.name ??
    names.get(id) ??
    id;
  if (Array.isArray(value)) return value.map(name).join(", ");
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return name(value);
}

export function compareDatabaseValues(
  a: DatabaseValue | undefined,
  b: DatabaseValue | undefined,
  names: ReadonlyMap<string, string>,
  property?: DatabaseProperty,
): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return databaseValueText(a, names, property).localeCompare(
    databaseValueText(b, names, property),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

/** Metadata is derived from the entry, never stored as an editable value. */
export function databasePropertyValue(
  page: { created_at?: string; property_values?: DatabaseValues },
  property: DatabaseProperty,
): DatabaseValue {
  return property.type === "created_at"
    ? (page.created_at ?? null)
    : (page.property_values?.[property.id] ?? null);
}

export function isDatabasePropertyValue(
  property: DatabaseProperty,
  value: unknown,
): value is DatabaseValue {
  if (!isDatabaseValue(property.type, value)) return false;
  if (value === null || !["select", "multi_select"].includes(property.type))
    return true;
  const ids = new Set(property.options?.map((option) => option.id));
  return (Array.isArray(value) ? value : [value]).every(
    (id) => typeof id === "string" && ids.has(id),
  );
}

/** Accept decimal punctuation while keeping letters out of numeric editors. */
export function isDatabaseNumberDraft(value: string): boolean {
  return /^[+-]?(?:\d*(?:[.,]\d*)?)$/.test(value);
}

export function parseDatabaseNumber(value: string): number | null | undefined {
  if (!value.trim()) return null;
  if (!isDatabaseNumberDraft(value) || !/\d/.test(value)) return undefined;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}
