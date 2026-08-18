/**
 * Which field of the inline form receives the cursor when opened.
 *
 * The useful rule is "the first field that remains to be filled in": on a
 * form with several fields whose first ones are already answered, we want
 * to land on the rest, not to return to back.
 *
 * The missing case is where there is NOTHING left to fill out — a completely pre-filled
 * form. It didn't exist until the only forms in the
 * produced were deliberately empty `select` ("no prefill: the
 * empty field receives autofocus, so the dropdown opens immediately").
 * Renaming a saved view made it appear: the field arrives with the
 * current name, so no field is “to be filled in”, so no one __
 * took the cursor — you had to click in it.
 *
 * A pre-filled form is not a finished form: it is a proposal.
 * We therefore land on the FIRST field, ready to be replaced (the caller
 * selects its content), and Enter validates the proposal as is.
 *
 * Extracted as a pure function because it is the rule that is tested, not the rendering.
 */

/** Does the field already have a response? */
function isFilled(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  return value != null;
}

/**
 * The index of the field to focus, or `-1` if there is no field.
 *
 * @param keys the field keys, in display order
 * @param values ​​the current values ​​of the form
 */
export function autoFocusFieldIndex(
  keys: readonly string[],
  values: Record<string, unknown>
): number {
  if (keys.length === 0) return -1;
  const unfilled = keys.findIndex((key) => !isFilled(values[key]));
  // Everything is filled → the first field, to be able to write over it.
  return unfilled === -1 ? 0 : unfilled;
}
