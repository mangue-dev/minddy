export const APP_TOP_BAR_HEIGHT = 44;
/** Shared by content headers, the primary inset, and secondary sidebar headers. */
export const APP_CONTENT_HEADER_HEIGHT = 50;
/**
 * First-section width of the tab bar: it tracks the modular primary sidebar's
 * fixed width (MIN-546). Hidden navigation floats, so its section is free.
 */
export function appTopBarNavigationWidth(hidden: boolean): number | "auto" {
  if (hidden) return "auto";
  return 320;
}
