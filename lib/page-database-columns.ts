import type { DatabaseProperty } from "./page-databases";

/** Move a column in the complete schema, including columns hidden by the view. */
export function reorderDatabaseColumns(
  schema: readonly DatabaseProperty[],
  movingId: string,
  targetId: string,
  before: boolean,
): DatabaseProperty[] {
  const moving = schema.find((property) => property.id === movingId);
  if (!moving || movingId === targetId) return [...schema];
  const remaining = schema.filter((property) => property.id !== movingId);
  const targetIndex = remaining.findIndex(
    (property) => property.id === targetId,
  );
  if (targetIndex < 0) return [...schema];
  remaining.splice(targetIndex + (before ? 0 : 1), 0, moving);
  return remaining;
}
