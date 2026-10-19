import type { Collaborator } from "./types";

/**
 * The collaborators to propose under an invite field (MIN-689): those matching
 * what is typed, by name or address, minus the people already there — queued,
 * invited or members. An empty query proposes the first ones.
 */
export function matchCollaborators(
  collaborators: readonly Collaborator[],
  query: string,
  exclude: { userIds?: readonly string[]; emails?: readonly string[] } = {},
  limit = 5,
): Collaborator[] {
  const needle = query.trim().toLowerCase();
  const userIds = new Set(exclude.userIds ?? []);
  const emails = new Set((exclude.emails ?? []).map((email) => email.toLowerCase()));
  return collaborators
    .filter((c) => !userIds.has(c.user_id) && !emails.has(c.email))
    .filter((c) =>
      !needle ||
      c.email.includes(needle) ||
      (c.full_name ?? "").toLowerCase().includes(needle),
    )
    .slice(0, limit);
}
