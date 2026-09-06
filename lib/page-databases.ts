/** Basic page database properties. Property IDs survive renames and reordering. */
export const DATABASE_PROPERTY_TYPES = [
  "text",
  "date",
  "people",
  "checkbox",
] as const;
export type DatabasePropertyType = (typeof DATABASE_PROPERTY_TYPES)[number];
export interface DatabaseProperty {
  id: string;
  name: string;
  type: DatabasePropertyType;
}
export type DatabaseValue = string | string[] | boolean | null;
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
    ids.add(property.id);
    return true;
  });
}

export function isDatabaseValue(
  type: DatabasePropertyType,
  value: unknown,
): value is DatabaseValue {
  if (value === null) return true;
  switch (type) {
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
): string {
  if (value == null) return "";
  if (Array.isArray(value))
    return value.map((id) => names.get(id) ?? id).join(", ");
  if (typeof value === "boolean") return value ? "1" : "0";
  return names.get(value) ?? value;
}

export function compareDatabaseValues(
  a: DatabaseValue | undefined,
  b: DatabaseValue | undefined,
  names: ReadonlyMap<string, string>,
): number {
  return databaseValueText(a, names).localeCompare(
    databaseValueText(b, names),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}
