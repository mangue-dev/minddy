// Central destination rules for mentions.
//
// A mention can retain a canonical URL for modified clicks and browser menus
// while using a different ordinary-click interaction. Issues open in the
// app-wide side panel; objectives and pages continue to navigate to their own
// screens. People have no profile destination and therefore remain plain text.
//
// This module is intentionally pure so every mention surface can share and
// test the same decision without mounting React.

/** What a mention can designate (see components/mention-chip.tsx). */
export type MentionTargetType =
  | "member"
  | "project"
  | "numo"
  | "forge"
  | "issue"
  | "objective"
  | "page";

/**
 * The path opened by a mention, or `null` when it leads nowhere.
 *
 * `null` covers two cases that should not be confused when called:
 * - a mention which has NO destination (a person, Numo, an account of
 * forge) — there will never be one;
 * - a ticket, an objective or a page whose project we do not know — the
 * resolution has not (yet) succeeded, the pill remains inert rather than
 * creating a false URL.
 */
export function mentionTargetPath(
  type: MentionTargetType,
  id: string,
  projectId?: string | null,
): string | null {
  // A project designates itself: its id IS that of its destination, it
  // there is nothing to resolve.
  if (type === "project") return id ? `/projects/${id}` : null;
  if (!id || !projectId) return null;
  switch (type) {
    case "issue":
      return `/projects/${projectId}?issue=${id}`;
    case "objective":
      return `/projects/${projectId}/objectives?open=${id}`;
    case "page":
      return `/projects/${projectId}/pages/${id}`;
    default:
      // member, numo, forge: no one has a screen to open.
      return null;
  }
}

export type MentionNavigationTarget =
  | {
      kind: "issue-panel";
      projectId: string;
      issueId: string;
      href: string;
    }
  | { kind: "route"; href: string };

/** Separates in-place issue opening from mentions that navigate to a screen. */
export function mentionNavigationTarget(
  type: MentionTargetType,
  id: string,
  projectId?: string | null,
): MentionNavigationTarget | null {
  const href = mentionTargetPath(type, id, projectId);
  if (!href) return null;
  if (type === "issue" && projectId) {
    return { kind: "issue-panel", projectId, issueId: id, href };
  }
  return { kind: "route", href };
}

/** What you need to know about a quotable element to find your project. */
interface MentionRow {
  id: string;
  project_id: string;
}

/**
 * Which project does the cited item belong to — the missing link between the pill,
 * which only has the type and id (components/mention-node.ts), and the URL of
 * its screen, which starts with the project.
 *
 * A single table for the three natures, with a compound key: two entities of
 * different types can carry the same id without stepping on each other, and an unknown id
 * makes `undefined` — the pill then remains text.
 */
export function mentionProjectLookup(sources: {
  issues?: MentionRow[];
  objectives?: MentionRow[];
  pages?: MentionRow[];
}): (type: MentionTargetType, id: string) => string | undefined {
  const byKey = new Map<string, string>();
  for (const issue of sources.issues ?? []) {
    byKey.set(`issue:${issue.id}`, issue.project_id);
  }
  for (const objective of sources.objectives ?? []) {
    byKey.set(`objective:${objective.id}`, objective.project_id);
  }
  for (const page of sources.pages ?? []) {
    byKey.set(`page:${page.id}`, page.project_id);
  }
  return (type, id) => byKey.get(`${type}:${id}`);
}
