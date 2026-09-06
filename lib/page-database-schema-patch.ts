import type { DatabaseProperty, DatabaseValues } from "./page-databases";

/** Apply the edited fields of a schema draft without erasing newer local columns. */
export function patchDatabaseSchema(
  current: DatabaseProperty[],
  before: DatabaseProperty[],
  after: DatabaseProperty[],
): DatabaseProperty[] {
  const removed = new Set(
    before
      .filter((p) => !after.some((next) => next.id === p.id))
      .map((p) => p.id),
  );
  let result = current
    .filter((p) => !removed.has(p.id))
    .map((property) => {
      const base = before.find((p) => p.id === property.id);
      const next = after.find((p) => p.id === property.id);
      if (!base || !next) return property;
      const patch = Object.fromEntries(
        Object.keys(next)
          .filter(
            (key) =>
              JSON.stringify(next[key as keyof DatabaseProperty]) !==
              JSON.stringify(base[key as keyof DatabaseProperty]),
          )
          .map((key) => [key, next[key as keyof DatabaseProperty]]),
      );
      return { ...property, ...patch };
    });
  for (const property of after)
    if (
      !before.some((p) => p.id === property.id) &&
      !result.some((p) => p.id === property.id)
    )
      result.push(property);
  const retainedBefore = before
    .filter((p) => after.some((next) => next.id === p.id))
    .map((p) => p.id);
  const retainedAfter = after
    .filter((p) => before.some((base) => base.id === p.id))
    .map((p) => p.id);
  if (JSON.stringify(retainedBefore) !== JSON.stringify(retainedAfter)) {
    const ordered = after.flatMap(
      (p) => result.find((row) => row.id === p.id) ?? [],
    );
    let index = 0;
    result = result.map((p) =>
      after.some((next) => next.id === p.id) ? ordered[index++] : p,
    );
  }
  return result;
}

/** Mirror the server cleanup when columns or selectable options are removed. */
export function databaseSchemaValueChanges(
  before: DatabaseProperty[],
  after: DatabaseProperty[],
  values: DatabaseValues,
): DatabaseValues {
  const changes: DatabaseValues = {};
  for (const property of before) {
    if (!(property.id in values)) continue;
    const next = after.find((p) => p.id === property.id);
    const value = values[property.id];
    if (!next) changes[property.id] = null;
    else if (
      next.type === "select" &&
      typeof value === "string" &&
      !next.options?.some((o) => o.id === value)
    )
      changes[property.id] = null;
    else if (next.type === "multi_select" && Array.isArray(value)) {
      const kept = value.filter((id) => next.options?.some((o) => o.id === id));
      if (kept.length !== value.length) changes[property.id] = kept;
    }
  }
  return changes;
}
