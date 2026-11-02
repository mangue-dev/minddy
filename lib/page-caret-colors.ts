/**
 * The colors of collaborators' carets in a page (MIN-271), apart from the
 * editor extension so a surface that only draws a caret, such as a landing
 * figure, does not load the editor.
 */

/** Up to 10 distinct, legible hues; white labels pass contrast on each. */
const CARET_COLORS = [
  "#2563eb", "#db2777", "#047857", "#b45309", "#7c3aed",
  "#dc2626", "#0e7490", "#4f46e5", "#a21caf", "#15803d",
];

/** A stable color per account: the same person keeps it on every screen. */
export function caretColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return CARET_COLORS[Math.abs(hash) % CARET_COLORS.length];
}
