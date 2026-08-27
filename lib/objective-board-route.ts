export const OBJECTIVE_BREADCRUMB_MAX_CHARACTERS = 10;

/** Return the objective filter only when the current route is a project board. */
export function objectiveIdFromBoardLocation(
  pathname: string,
  objectiveParam: string | null,
): string | null {
  if (!objectiveParam || !/^\/projects\/[^/]+\/?$/.test(pathname)) return null;
  return objectiveParam;
}

/** Keep the rendered objective crumb within ten Unicode characters. */
export function objectiveBreadcrumbLabel(name: string): string {
  const characters = Array.from(name);
  if (characters.length <= OBJECTIVE_BREADCRUMB_MAX_CHARACTERS) return name;
  return `${characters
    .slice(0, OBJECTIVE_BREADCRUMB_MAX_CHARACTERS - 1)
    .join("")}…`;
}
