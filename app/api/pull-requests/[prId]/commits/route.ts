import { type NextRequest } from "next/server";

import { authorizePrRequest, prCommitsResponse } from "@/lib/server/agent/pr-actions";

/**
 * The commits that make up a pull request, read at the forge with a token
 * fresh — the Commits tab of the PR panel.
 * GET → { commits, truncated } (oldest to newest).
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommitsResponse(auth.scope);
}
