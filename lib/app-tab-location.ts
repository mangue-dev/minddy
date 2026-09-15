/** Persist only authenticated destinations and repeatable selection state. */
const ROUTES = new Set([
  "home", "all", "inbox", "numo", "agents", "routines", "pull-requests",
  "statistics", "trash", "settings", "billing", "admin",
]);
const PROJECT_SECTIONS = new Set(["feedback", "objectives", "pages", "settings", "triage"]);
const SELECTION_PARAMS = new Set([
  "view", "objective", "tab", "open", "post", "run", "routine", "pr", "conversation", "entry",
]);
export const APP_TAB_MAX_HREF = 2000;

export function normalizeAppTabLocation(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") ||
      // eslint-disable-next-line no-control-regex -- Reject control characters in stored destinations.
      raw.length > APP_TAB_MAX_HREF || /[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw, "https://minddy.invalid"); } catch { return null; }
  if (url.origin !== "https://minddy.invalid") return null;
  const path = url.pathname.replace(/\/$/, "");
  const segments = path.slice(1).split("/");
  if (segments.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))) return null;
  const [root, project, section] = segments;
  if (root === "projects") {
    if (!project || segments.length > 4 || (section && !PROJECT_SECTIONS.has(section))) return null;
    if (segments.length === 4 && section !== "pages") return null;
  } else if (!ROUTES.has(root) || segments.length !== 1) return null;
  const params = new URLSearchParams();
  for (const key of SELECTION_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value);
  }
  params.sort();
  // Document anchors are repeatable; other fragments are transient UI instructions.
  const hash = root === "projects" && section === "pages" ? url.hash : "";
  return path + (params.size ? `?${params}` : "") + hash;
}

export function appTabRoute(href: string): {
  section: string;
  projectId: string | null;
  /** The `objective` selection param — an objective's tickets load in the
   *  board URL, not on a dedicated page, so the tab names it. */
  objectiveId: string | null;
  /** A specific wiki page (…/pages/{pageId}) the tab is pinned on. */
  pageId: string | null;
  /** `pull-requests?pr=` — a selected pull request. */
  prId: string | null;
  /** `routines?routine=` — a selected routine. */
  routineId: string | null;
} {
  const normalized = normalizeAppTabLocation(href) ?? "/home";
  const [path, query] = normalized.split(/[?#]/);
  const parts = path.slice(1).split("/");
  const params = new URLSearchParams(query);
  if (parts[0] !== "projects") {
    return { section: parts[0], projectId: null, objectiveId: null, pageId: null, prId: params.get("pr"), routineId: params.get("routine") };
  }
  return {
    section: parts[2] ?? "tickets",
    projectId: parts[1],
    objectiveId: params.get("objective"),
    pageId: parts[2] === "pages" && parts[3] ? parts[3] : null,
    prId: params.get("pr"),
    routineId: params.get("routine"),
  };
}
