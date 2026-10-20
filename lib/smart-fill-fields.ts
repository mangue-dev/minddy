/**
 * Which Smart Fill properties the creation form shows (MIN-746).
 *
 * With Smart Fill on, priority, effort, categories and objective leave the
 * form: the server infers them. But the server only fills what is still empty
 * (`lib/server/create-issue.ts`), so a value set by hand wins. The form must
 * let that happen without switching Smart Fill off: a property shortcut opens
 * its picker, and a property that holds a value stays visible.
 */

export type SmartFillField = "priority" | "effort" | "category" | "objective";

export interface SmartFillFieldValues {
  priority: string;
  effort: string | null;
  categoryIds: readonly string[];
  objectiveId: string | null;
}

/** Whether the field holds something Smart Fill would not overwrite. `none`
 * is the form's default priority, not a choice — the server treats it the
 * same way. */
export function smartFillFieldHasValue(
  field: SmartFillField,
  values: SmartFillFieldValues,
): boolean {
  switch (field) {
    case "priority":
      return values.priority !== "none";
    case "effort":
      return values.effort !== null;
    case "category":
      return values.categoryIds.length > 0;
    case "objective":
      return values.objectiveId !== null;
  }
}

/** Shown when Smart Fill is off, while its picker is open (a shortcut or a
 * click opened it), or once it holds a value set by hand. */
export function smartFillFieldVisible(
  field: SmartFillField,
  {
    smartFill,
    openPicker,
    values,
  }: { smartFill: boolean; openPicker: string | null; values: SmartFillFieldValues },
): boolean {
  return !smartFill || openPicker === field || smartFillFieldHasValue(field, values);
}
