// Where a mention leads — the rule, in one place.
//
// A pill “@” DESIGNATES something: a ticket, an objective, a page of the
// wiki, a project. Clicking on it should go there, just like a link from the
// text. A person leads nowhere: minddy has no page of
// profile, and a pill that clicks without opening anything lies about what it is.
//
// The paths are the same as those of a notification
// (lib/notification-target.ts): a ticket opens as a panel on the board
// your project, an objective is selected from the list of objectives. Two
// entries to the same screens, only one form of URL.
//
// PUR module: no React, no `server-only` — enough to test it without anything
// mount, and read it from any surface.

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
