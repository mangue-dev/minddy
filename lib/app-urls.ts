// Readable application URLs.
//
// Records are addressed in visible URLs by a short code instead of their
// UUID: the first eight hexadecimal characters of the id. The code is derived,
// never stored, so it needs no column, no backfill and survives every rename.
// Projects add their key in front (`/projects/min-3f2a9c81`) and issues use
// their identifier (`?issue=MIN-42`).
//
// Titles never enter a URL: project, objective, page and issue names are
// encrypted at rest, and paths reach request logs, analytics and referrers.
//
// Every resolver also accepts a full UUID, so bookmarks, pushed notifications
// and persisted tabs written before this format keep opening their target.
// PURE module: shared by client components, the proxy and server code.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[0-9a-f]{8}$/i;
const ISSUE_IDENTIFIER_RE = /^([A-Za-z0-9]+)-(\d+)$/;

export const SHORT_CODE_LENGTH = 8;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isShortCode(value: string): boolean {
  return CODE_RE.test(value);
}

/** The short code of a record id: its first eight hexadecimal characters. */
export function shortCode(id: string): string {
  return id.slice(0, SHORT_CODE_LENGTH).toLowerCase();
}

/**
 * The reference a URL carries for `id`: its short code. Anything that is not
 * a UUID (a test fixture, an optimistic temporary id) is kept as is, so it
 * still resolves by exact equality.
 */
export function recordRef(id: string): string {
  return isUuid(id) ? shortCode(id) : id;
}

/** Lowercase, URL-safe form of a project key (`MIN` → `min`). */
function keySlug(key: string | null | undefined): string {
  return (key ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ProjectRefSource {
  id: string;
  key?: string | null;
}

// Project keys this client has loaded (fed by lib/ref-registry.ts), so a link
// built from a bare `project_id` still reads `min-3f2a9c81`. Empty on the
// server, where such a link carries the code alone and stays valid.
const projectKeys = new Map<string, string>();

export function rememberProjectKey(id: string, key: string): void {
  projectKeys.set(id.toLowerCase(), key);
}

export function knownProjectKey(id: string): string | null {
  return projectKeys.get(id.toLowerCase()) ?? null;
}

/** `min-3f2a9c81`: the project key for the eye, the code for resolution. */
export function projectRef(project: ProjectRefSource | string): string {
  const { id, key } = typeof project === "string" ? { id: project, key: null } : project;
  const ref = recordRef(id);
  if (!isUuid(id)) return ref;
  const slug = keySlug(key ?? knownProjectKey(id));
  return slug ? `${slug}-${ref}` : ref;
}

/**
 * The code a project segment carries: the part after its last hyphen when
 * that part is a short code, the whole segment otherwise (a bare code, a full
 * UUID or a legacy test id). The key in front is decorative, so a renamed key
 * never breaks a link.
 */
export function projectSegmentCode(segment: string): string {
  const decoded = safeDecode(segment);
  if (isUuid(decoded)) return decoded.toLowerCase();
  const tail = decoded.slice(decoded.lastIndexOf("-") + 1);
  return CODE_RE.test(tail) ? tail.toLowerCase() : decoded;
}

/**
 * Does the URL reference `ref` designate the record `id`? A full UUID must
 * match exactly, a short code matches the id it prefixes, and any other value
 * (non-UUID ids) matches by equality.
 */
export function refMatches(id: string, ref: string): boolean {
  if (id === ref) return true;
  if (isUuid(ref)) return id.toLowerCase() === ref.toLowerCase();
  return CODE_RE.test(ref) && isUuid(id) && shortCode(id) === ref.toLowerCase();
}

/**
 * The record a URL reference designates among those the viewer can see.
 * Within one user's scope two ids sharing 32 bits are vanishingly rare; if it
 * ever happens the reference is ambiguous and resolves to nothing rather than
 * to the wrong record.
 */
export function resolveRef<T extends { id: string }>(
  ref: string | null | undefined,
  items: readonly T[] | null | undefined,
): T | undefined {
  if (!ref || !items) return undefined;
  const exact = items.find((item) => item.id === ref);
  if (exact) return exact;
  const matches = items.filter((item) => refMatches(item.id, ref));
  return matches.length === 1 ? matches[0] : undefined;
}

/** The project a `/projects/<segment>` route designates, if visible. */
export function resolveProjectSegment<T extends { id: string }>(
  segment: string | null | undefined,
  projects: readonly T[] | null | undefined,
): T | undefined {
  return segment ? resolveRef(projectSegmentCode(segment), projects) : undefined;
}

export type ProjectTab = "objectives" | "pages" | "triage" | "feedback" | "settings";

/** `/projects/min-3f2a9c81[/tab]`. */
export function projectPath(project: ProjectRefSource | string, tab?: ProjectTab): string {
  const base = `/projects/${encodeURIComponent(projectRef(project))}`;
  return tab ? `${base}/${tab}` : base;
}

type QueryValue = string | number | null | undefined;

/** A path with its query; record values become short codes by the caller. */
export function withQuery(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== "") params.set(name, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** A project route with selection parameters: `/projects/min-3f2a9c81?objective=8b1e04aa`. */
export function projectHref(
  project: ProjectRefSource | string,
  tab?: ProjectTab,
  query?: Record<string, QueryValue>,
): string {
  return withQuery(projectPath(project, tab), query);
}

/** `/projects/min-3f2a9c81/pages/8b1e04aa`. */
export function pagePath(project: ProjectRefSource | string, pageId: string): string {
  return `${projectPath(project, "pages")}/${encodeURIComponent(recordRef(pageId))}`;
}

export interface IssueRefSource {
  id: string;
  number?: number | null;
  project_id?: string | null;
  /** The project key, when the caller has it at hand. */
  key?: string | null;
}

/**
 * The value of `?issue=`: the readable identifier when the project key and
 * number are known (`MIN-42`), the short code otherwise.
 */
export function issueRef(issue: IssueRefSource): string {
  const key = issue.key ?? (issue.project_id ? knownProjectKey(issue.project_id) : null);
  return key && issue.number != null ? `${key}-${issue.number}` : recordRef(issue.id);
}

/** The board with an issue open: `/projects/min-3f2a9c81?issue=MIN-42`. */
export function issueHref(
  project: ProjectRefSource | string,
  issue: IssueRefSource,
  tab?: ProjectTab,
): string {
  const key = typeof project === "string" ? null : project.key;
  return projectHref(project, tab, { issue: issueRef({ key, ...issue }) });
}

/** An objective's details: `/projects/min-3f2a9c81/objectives?open=8b1e04aa`. */
export function objectiveHref(project: ProjectRefSource | string, objectiveId: string): string {
  return projectHref(project, "objectives", { open: recordRef(objectiveId) });
}

/** An objective's tickets on the board: `/projects/min-3f2a9c81?objective=8b1e04aa`. */
export function objectiveBoardHref(project: ProjectRefSource | string, objectiveId: string): string {
  return projectHref(project, undefined, { objective: recordRef(objectiveId) });
}

/** A feedback post: `/projects/min-3f2a9c81/feedback?post=8b1e04aa`. */
export function feedbackPostHref(project: ProjectRefSource | string, postId: string): string {
  return projectHref(project, "feedback", { post: recordRef(postId) });
}

/** `/routines?routine=8b1e04aa`. */
export function routineHref(routineId: string): string {
  return withQuery("/routines", { routine: recordRef(routineId) });
}

/** `/pull-requests?pr=8b1e04aa`. */
export function pullRequestHref(pullRequestId: string): string {
  return withQuery("/pull-requests", { pr: recordRef(pullRequestId) });
}

/**
 * The issue a `?issue=` value designates: an identifier such as `MIN-42`
 * (matched on the number, the key being the project's), a short code or a
 * full UUID.
 */
export function resolveIssueRef<T extends { id: string; number?: number | null; project_id?: string | null }>(
  ref: string | null | undefined,
  issues: readonly T[] | null | undefined,
): T | undefined {
  if (!ref || !issues) return undefined;
  const exact = issues.find((issue) => issue.id === ref);
  if (exact) return exact;
  const identifier = ISSUE_IDENTIFIER_RE.exec(ref);
  if (identifier && !CODE_RE.test(ref)) {
    const number = Number(identifier[2]);
    const key = identifier[1].toLowerCase();
    // On a board spanning projects the key tells same-numbered issues apart.
    return issues.find((issue) => {
      if (issue.number !== number) return false;
      const issueKey = issue.project_id ? knownProjectKey(issue.project_id) : null;
      return !issueKey || issueKey.toLowerCase() === key;
    });
  }
  return resolveRef(ref, issues);
}

/** The issue number an identifier such as `MIN-42` carries, else null. */
export function issueNumberFromRef(ref: string): number | null {
  const identifier = ISSUE_IDENTIFIER_RE.exec(ref);
  return identifier && !CODE_RE.test(ref) ? Number(identifier[2]) : null;
}

/** Inclusive UUID bounds of a short code, for an indexed range lookup. */
export function shortCodeRange(code: string): { from: string; to: string } | null {
  if (!CODE_RE.test(code)) return null;
  const c = code.toLowerCase();
  return {
    from: `${c}-0000-0000-0000-000000000000`,
    to: `${c}-ffff-ffff-ffff-ffffffffffff`,
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const LEGACY_PARAMS = ["issue", "objective", "open", "post", "routine", "pr", "family", "view"] as const;

/**
 * The readable form of a legacy app URL, or null when it already is one.
 * Replaces every full UUID the URL carries (project and page segments, record
 * parameters) by its short code. The project key cannot be known without a
 * read; the client adds it once the project list is loaded.
 */
export function shortenLegacyAppUrl(pathname: string, search: string): string | null {
  const segments = pathname.split("/");
  let changed = false;
  const shortened = segments.map((segment) => {
    if (!isUuid(segment)) return segment;
    changed = true;
    return shortCode(segment);
  });
  const params = new URLSearchParams(search);
  for (const name of LEGACY_PARAMS) {
    const value = params.get(name);
    if (value && isUuid(value)) {
      params.set(name, shortCode(value));
      changed = true;
    }
  }
  if (!changed) return null;
  const query = params.toString();
  return `${shortened.join("/")}${query ? `?${query}` : ""}`;
}
