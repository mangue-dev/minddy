import "server-only";

import { NextResponse } from "next/server";
import type { PrScope } from "./pr-scope";

/**
 * The forge accounts that can be mentioned on this PR (MIN-162), read on the
 * installation token: the list does not depend on who is looking.
 *
 * A failure is an empty list, never an error: the "Members" permission may be
 * missing from the installation (403), a GitLab instance may refuse the
 * endpoint, and comments still work without suggestions.
 */
export async function prMembersResponse(scope: PrScope): Promise<NextResponse> {
  const members = await scope.forge.listRepoMembers(scope.call).catch(() => {
    console.error("[pr-actions] repo_members_unreadable");
    return [];
  });
  return NextResponse.json(
    { members },
    // Collaborators do not change while a comment is written. `private`: it
    // describes an often private repository.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
