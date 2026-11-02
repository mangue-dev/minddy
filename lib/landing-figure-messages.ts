/**
 * What the landing's animated figures translate on the client, beyond the
 * public site's own namespaces.
 *
 * The figures under `components/marketing/figures/` render the app's real
 * components (the issue card, its indicators, presence avatars), which read
 * app namespaces the public site does not ship (`lib/public-client-messages.ts`).
 * `FigureScope` adds exactly these to what the page already has, once for the
 * whole page. `public-client-messages.test.ts` scans every figure and fails
 * when one translates a namespace missing here.
 */
export const LANDING_FIGURE_NAMESPACES = [
  "Activity",
  "Agent",
  "Board",
  "Categories",
  "Creation",
  "Cycles",
  "Field",
  "IssueUI",
  "ObjectiveStatus",
  "Pages",
  "Priority",
  "Relations",
  "Status",
] as const;

export function landingFigureMessages<T extends Record<string, unknown>>(
  messages: T,
): Partial<T> {
  const scoped: Partial<T> = {};
  for (const namespace of LANDING_FIGURE_NAMESPACES) {
    const key = namespace as keyof T;
    if (key in messages) scoped[key] = messages[key];
  }
  return scoped;
}
