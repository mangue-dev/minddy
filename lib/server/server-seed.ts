import "server-only";

import { NextRequest } from "next/server";
import { headers as requestHeaders, cookies as requestCookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase-server";
import { verifiedSessionUserId } from "@/lib/server/api-auth";
import { resolveProjectSegment, resolveRouteRef } from "@/lib/server/route-refs";
import { defaultFeedbackListReadPath } from "@/lib/feedback-selection-hint";
import { PROJECT_SETTINGS_DEFAULT_TAB } from "@/lib/settings-sections";
import { parseTimeZoneCookie, TIME_ZONE_COOKIE } from "@/lib/time-zone-cookie";
import { DEFERRED_BOARD_ISSUES_PATH, globalBoardReadPath } from "@/lib/global-board-reads";
import { SERVER_SEED_PATH_HEADER, type ServerSeedPlan, type ServerSeedResponse } from "@/lib/server-seed";

/**
 * Server half of the reads sent with the page (MIN-880, lib/server-seed.ts).
 *
 * The proxy marks a real document load of an app route with
 * {@link SERVER_SEED_PATH_HEADER}. Only then does the app layout name the API
 * reads this page will make on startup and run each one through its own
 * route handler, with the request's cookies, as the browser would. Every read
 * keeps its route's authentication, live session and MFA checks,
 * authorization, decryption and error handling, and the response is the one
 * the browser would have received. Soft navigations, prefetches and refreshes
 * carry no header and render nothing here.
 *
 * Nothing is cached: each response is rendered into this document only, for
 * the account whose cookies made the request.
 */

export { SERVER_SEED_PATH_HEADER };

// Shell routes take no context; project routes read `params.id` (and `pageId`).
type Handler = (request: NextRequest, context: { params: Promise<{ id: string; pageId: string }> }) => Promise<Response> | Response;
type RouteModule = { GET?: Handler };

/**
 * The seedable reads: exact API paths, matched to the module of their route.
 * Literal imports, loaded only for the reads a page names.
 */
const ROUTES: { pattern: RegExp; load: () => Promise<RouteModule> }[] = [
  { pattern: /^\/api\/projects$/, load: () => import("@/app/api/projects/route") },
  { pattern: /^\/api\/projects\/invitations$/, load: () => import("@/app/api/projects/invitations/route") },
  { pattern: /^\/api\/me\/app-tabs$/, load: () => import("@/app/api/me/app-tabs/route") },
  { pattern: /^\/api\/me\/views$/, load: () => import("@/app/api/me/views/route") },
  { pattern: /^\/api\/pull-requests$/, load: () => import("@/app/api/pull-requests/route") },
  { pattern: /^\/api\/me\/board$/, load: () => import("@/app/api/me/board/route") },
  { pattern: /^\/api\/me\/issues$/, load: () => import("@/app/api/me/issues/route") },
  { pattern: /^\/api\/me\/cycle$/, load: () => import("@/app/api/me/cycle/route") },
  { pattern: /^\/api\/me\/triage-counts$/, load: () => import("@/app/api/me/triage-counts/route") },
  { pattern: /^\/api\/me\/avatar$/, load: () => import("@/app/api/me/avatar/route") },
  { pattern: /^\/api\/me\/admin$/, load: () => import("@/app/api/me/admin/route") },
  { pattern: /^\/api\/account\/hidden-projects$/, load: () => import("@/app/api/account/hidden-projects/route") },
  { pattern: /^\/api\/notifications$/, load: () => import("@/app/api/notifications/route") },
  { pattern: /^\/api\/project-drafts$/, load: () => import("@/app/api/project-drafts/route") },
  { pattern: /^\/api\/pull-requests\/count$/, load: () => import("@/app/api/pull-requests/count/route") },
  { pattern: /^\/api\/billing$/, load: () => import("@/app/api/billing/route") },
  { pattern: /^\/api\/billing\/usage$/, load: () => import("@/app/api/billing/usage/route") },
  { pattern: /^\/api\/routines$/, load: () => import("@/app/api/routines/route") },
  { pattern: /^\/api\/agent\/models$/, load: () => import("@/app/api/agent/models/route") },
  { pattern: /^\/api\/admin\/capabilities$/, load: () => import("@/app/api/admin/capabilities/route") },
  { pattern: /^\/api\/admin\/overview$/, load: () => import("@/app/api/admin/overview/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/issues$/, load: () => import("@/app/api/projects/[id]/issues/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/members$/, load: () => import("@/app/api/projects/[id]/members/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/objectives$/, load: () => import("@/app/api/projects/[id]/objectives/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/categories$/, load: () => import("@/app/api/projects/[id]/categories/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/issue-relations$/, load: () => import("@/app/api/projects/[id]/issue-relations/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/integrations$/, load: () => import("@/app/api/projects/[id]/integrations/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/views$/, load: () => import("@/app/api/projects/[id]/views/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/feedback$/, load: () => import("@/app/api/projects/[id]/feedback/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/feedback\/counts$/, load: () => import("@/app/api/projects/[id]/feedback/counts/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/pull-request-stats$/, load: () => import("@/app/api/projects/[id]/pull-request-stats/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/pages$/, load: () => import("@/app/api/projects/[id]/pages/route") },
  { pattern: /^\/api\/projects\/(?<id>[0-9a-f-]{36})\/pages\/(?<pageId>[0-9a-f-]{36})$/, load: () => import("@/app/api/projects/[id]/pages/[pageId]/route") },
];

function seedRoute(pathname: string) {
  for (const { pattern, load } of ROUTES) {
    const match = pathname.match(pattern);
    if (match) return { match, load };
  }
  return null;
}

/** Whether `path` names a read the document can carry. */
export function hasServerSeedRoute(path: string): boolean {
  return seedRoute(new URL(path, "https://minddy.invalid").pathname) !== null;
}

/** A response body larger than this is left to the browser's own request. */
const MAX_SEED_BODY_CHARS = 3 * 1024 * 1024;
/** A read slower than this is left to the browser, which would start it later anyway. */
const SEED_DEADLINE_MS = 6_000;

/** What every app page reads at startup through the shell (sidebar, tabs, counters). */
const SHELL_READS = [
  "/api/me/app-tabs",
  "/api/projects",
  "/api/account/hidden-projects",
  "/api/projects/invitations",
  "/api/notifications",
  "/api/me/triage-counts",
  "/api/pull-requests/count",
  "/api/billing",
  "/api/billing/usage",
  "/api/me/avatar",
  "/api/me/admin",
  "/api/project-drafts",
  "/api/pull-requests?state=open&limit=100",
];

/**
 * What each project page reads before its first content, by section of
 * `/projects/[id]/…`. The board's are its prerequisites
 * (lib/retained-board-read-state.ts); the others were mapped from cold loads.
 */
const PROJECT_SECTION_READS: Record<string, string[]> = {
  "": ["issues", "members", "categories", "objectives", "integrations", "issue-relations", "views"],
  objectives: ["objectives", "issues", "members", "issue-relations", "pages"],
  feedback: ["objectives", "issues", "categories", "members", "issue-relations"],
  triage: ["issues", "members", "categories", "objectives", "integrations", "issue-relations", "pages"],
  // The general tab's statistics.
  settings: ["issues", "members", "categories", "objectives", "issue-relations", "pull-request-stats"],
  pages: ["pages"],
};

/** The reads a project page's location makes, or none for an unknown section. */
async function projectReads(projectId: string, section: string, pageRef: string | undefined,
  params: URLSearchParams): Promise<string[]> {
  const readers = PROJECT_SECTION_READS[section];
  if (!readers || (pageRef && section !== "pages")) return [];
  const api = `/api/projects/${projectId}`;
  // Every project page shows the feedback counter in the sidebar.
  const paths = [`${api}/feedback/counts`, ...readers.map((reader) => `${api}/${reader}`)];
  // A bare team page reads its default list; links and filters change that read.
  if (section === "feedback" && params.size === 0) paths.push(defaultFeedbackListReadPath(projectId));
  // Other tabs do not show the statistics.
  if (section === "settings" && (params.get("tab") ?? PROJECT_SETTINGS_DEFAULT_TAB) !== PROJECT_SETTINGS_DEFAULT_TAB) {
    return paths.slice(0, 1);
  }
  if (pageRef) {
    const pageId = await resolveRouteRef("pages", pageRef).catch(() => null);
    if (pageId) paths.push(`${api}/pages/${pageId}`);
  }
  return paths;
}

/**
 * The reads a document load of `location` makes before its first content,
 * written exactly as the browser requests them. Unknown routes seed the shell
 * only; a project code this account cannot see seeds no project read.
 */
export async function serverSeedPaths(location: string, timeZone: string | null): Promise<string[]> {
  const url = new URL(location, "https://minddy.invalid");
  const paths = [...SHELL_READS];
  const tz = timeZone ? `?tz=${encodeURIComponent(timeZone)}` : null;
  if (tz) paths.push(`/api/me/cycle${tz}`);
  // The global board's prerequisites (lib/retained-board-read-state.ts).
  // Its two halves (lib/global-board-reads.ts) arrive as separate seeds.
  if (url.pathname === "/all") {
    paths.push("/api/me/views", ...(timeZone ? [globalBoardReadPath(timeZone)] : []), DEFERRED_BOARD_ISSUES_PATH);
  }
  if (url.pathname === "/routines") paths.push("/api/routines", "/api/agent/models");
  // The route answers non-admins with an error, which is never seeded.
  if (url.pathname === "/admin") paths.push("/api/admin/capabilities", "/api/admin/overview");
  const project = url.pathname.match(/^\/projects\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/);
  if (project) {
    const projectId = await resolveProjectSegment(decodeURIComponent(project[1])).catch(() => null);
    const pageRef = project[3] && decodeURIComponent(project[3]);
    if (projectId) paths.push(...await projectReads(projectId, project[2] ?? "", pageRef, url.searchParams));
  }
  return paths;
}

/** The plan for this document request, or null when it must not carry seeds. */
export async function serverSeedPlan(): Promise<ServerSeedPlan | null> {
  const [headers, cookies] = await Promise.all([requestHeaders(), requestCookies()]);
  const location = headers.get(SERVER_SEED_PATH_HEADER);
  if (!location) return null;
  try {
    // The paths are read through the session's RLS client and discarded
    // without a verified owner, so both reads start together.
    const [owner, paths] = await Promise.all([
      createServerSupabase().then(verifiedSessionUserId),
      serverSeedPaths(location, parseTimeZoneCookie(cookies.get(TIME_ZONE_COOKIE)?.value)),
    ]);
    if (!owner) return null;
    return { owner, paths };
  } catch {
    return null;
  }
}

/**
 * Request headers a handler may read, copied from the document request. The
 * cookie header already holds a session the proxy refreshed for this request.
 */
const FORWARDED_HEADERS = ["cookie", "accept-language", "user-agent", "x-forwarded-for", "x-real-ip", "x-forwarded-host", "x-forwarded-proto", "host"];

/**
 * Run the GET handler of `path` as the browser's request would, or null when
 * the browser must read it itself: no seedable route, a non-success status,
 * a body too large, a failure or the deadline.
 */
export async function runServerSeed(path: string): Promise<ServerSeedResponse | null> {
  const url = new URL(path, "https://minddy.invalid");
  const route = seedRoute(url.pathname);
  if (!route) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const incoming = await requestHeaders();
    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = incoming.get(name);
      if (value) headers.set(name, value);
    }
    const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost";
    const protocol = incoming.get("x-forwarded-proto") ?? "https";
    const request = new NextRequest(new URL(`${url.pathname}${url.search}`, `${protocol}://${host}`), { headers });
    const module = await route.load();
    if (!module.GET) return null;
    const { id = "", pageId = "" } = route.match.groups ?? {};
    const params = Promise.resolve({ id, pageId });
    const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), SEED_DEADLINE_MS); });
    const read = (async () => {
      const response = await module.GET!(request, { params });
      if (response.status < 200 || response.status >= 300) return null;
      const body = await response.text();
      if (body.length > MAX_SEED_BODY_CHARS) return null;
      return { status: response.status, contentType: response.headers.get("content-type") ?? "application/json", body };
    })();
    return await Promise.race([read, deadline]);
  } catch {
    console.error("[server-seed] read_unavailable");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
