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
      const keys = [...new Set([...Object.keys(base), ...Object.keys(next)])] as
        (keyof DatabaseProperty)[];
      const changed = keys.filter((key) =>
        JSON.stringify(next[key]) !== JSON.stringify(base[key]));
      const patched: Record<string, unknown> = { ...property };
      for (const key of changed) {
        // A key the draft dropped (a number format) is dropped here too.
        if (next[key] === undefined) delete patched[key];
        else patched[key] = next[key];
      }
      return patched as unknown as DatabaseProperty;
    });
  // A new column takes its place in the draft: right after the column that
  // precedes it there, so undoing a deletion puts the column back where it was
  // (MIN-990). A column appended to the draft still lands after the last one.
  after.forEach((property, index) => {
    if (
      before.some((p) => p.id === property.id) ||
      result.some((p) => p.id === property.id)
    )
      return;
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const anchor = result.findIndex((p) => p.id === after[i].id);
      if (anchor !== -1) { at = anchor + 1; break; }
    }
    // Nothing before it in the draft: first, unless the draft was empty of
    // known columns, where it joins the end as before.
    if (at === 0 && index > 0) at = result.length;
    result.splice(at, 0, property);
  });
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
