import { expandProjectSegment, expandRef } from "./ref-registry";

/** Persist only authenticated destinations and repeatable selection state. */
const ROUTES = new Set([
  "home", "all", "inbox", "routines", "pull-requests",
  "trash", "settings", "billing", "admin",
]);
/** Retired screens whose content moved elsewhere: restored tabs follow it. */
const MOVED_ROUTES: Readonly<Record<string, string>> = {
  // Personal statistics live in the profile since MIN-737.
  statistics: "settings",
};
const PROJECT_SECTIONS = new Set(["feedback", "objectives", "pages", "settings", "triage"]);
const SELECTION_PARAMS = new Set([
  "view", "objective", "family", "tab", "open", "post", "routine", "pr", "entry",
]);
export const APP_TAB_MAX_HREF = 2000;

/** Match the whole destination, including parameters persistence does not keep. */
export function sameAppTabDestination(left: string, right: string): boolean {
  const canonical = (href: string) => {
    if (!normalizeAppTabLocation(href)) return null;
    const url = new URL(href, "https://minddy.invalid");
    url.searchParams.sort();
    return url.pathname.replace(/\/$/, "") + url.search + url.hash;
  };
  const destination = canonical(left);
  return destination !== null && destination === canonical(right);
}

export function normalizeAppTabLocation(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") ||
      // eslint-disable-next-line no-control-regex -- Reject control characters in stored destinations.
      raw.length > APP_TAB_MAX_HREF || /[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw, "https://minddy.invalid"); } catch { return null; }
  if (url.origin !== "https://minddy.invalid") return null;
  const trimmed = url.pathname.replace(/\/$/, "");
  const moved = MOVED_ROUTES[trimmed.slice(1)];
  const path = moved ? `/${moved}` : trimmed;
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

type RefExpander = (ref: string | null) => string | null;
const rawRef: RefExpander = (ref) => ref;

/**
 * The route with its record references expanded to ids: a short code becomes
 * the id this client has loaded for it, and null until then.
 */
export function appTabRoute(href: string): AppTabRoute {
  return parseAppTabRoute(href, expandRef);
}

/** The route as written, for the server, which resolves short codes itself. */
export function rawAppTabRoute(href: string): AppTabRoute {
  return parseAppTabRoute(href, rawRef);
}

export interface AppTabRoute {
  section: string;
  projectId: string | null;
  /** The objective the tab shows: the board's `objective` param (its
   *  tickets), or the Objectives page's `open` selection (its details).
   *  Either way the tab names it. */
  objectiveId: string | null;
  /** The `family` selection param — a board scoped to one parent and its
   *  direct children; the tab names the parent. */
  familyId: string | null;
  /** The `view` selection param — a board view id, or the `cycle` sentinel
   *  when the global board shows its cycle mode. */
  view: string | null;
  /** A specific wiki page (…/pages/{pageId}) the tab is pinned on. */
  pageId: string | null;
  /** `pull-requests?pr=` — a selected pull request. */
  prId: string | null;
  /** `routines?routine=` — a selected routine. */
  routineId: string | null;
  /** `admin?tab=` — the admin dashboard tab the app tab is on. */
  adminTab: string | null;
}

function parseAppTabRoute(href: string, expand: RefExpander): AppTabRoute {
  const normalized = normalizeAppTabLocation(href) ?? "/home";
  const [path, query] = normalized.split(/[?#]/);
  const parts = path.slice(1).split("/");
  const params = new URLSearchParams(query);
  if (parts[0] !== "projects") {
    return { section: parts[0], projectId: null, objectiveId: null, familyId: null, view: expand(params.get("view")), pageId: null, prId: expand(params.get("pr")), routineId: expand(params.get("routine")), adminTab: parts[0] === "admin" ? params.get("tab") : null };
  }
  return {
    section: parts[2] ?? "tickets",
    projectId: expand === rawRef ? parts[1] : expandProjectSegment(parts[1]),
    objectiveId: expand(params.get("objective") ?? (parts[2] === "objectives" ? params.get("open") : null)),
    familyId: expand(params.get("family")),
    view: expand(params.get("view")),
    // `trash` is the wiki's own section, not a page reference.
    pageId: parts[2] === "pages" && parts[3] ? (parts[3] === "trash" ? parts[3] : expand(parts[3])) : null,
    prId: expand(params.get("pr")),
    routineId: expand(params.get("routine")),
    adminTab: null,
  };
}
