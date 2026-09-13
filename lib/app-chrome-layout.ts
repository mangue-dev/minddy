export const APP_TOP_BAR_HEIGHT = 44;
/** Shared by content headers, the primary inset, and secondary sidebar headers. */
export const APP_CONTENT_HEADER_HEIGHT = 50;
export function appTopBarNavigationWidth(hidden: boolean, secondary: boolean): number {
  return !hidden && secondary ? 56 + 320 : 256;
}
