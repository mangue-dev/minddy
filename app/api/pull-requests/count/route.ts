import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  countPullRequestsForUser,
  listVisibleRepos,
} from "@/lib/server/agent/pull-requests";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const repos = await listVisibleRepos(auth.supabase);
    const count = await countPullRequestsForUser(auth.supabase, repos, [
      "open",
      "draft",
    ]);
    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to count pull requests",
      },
      { status: 500 },
    );
  }
}
