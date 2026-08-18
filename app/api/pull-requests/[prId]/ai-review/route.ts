import { type NextRequest } from "next/server";

import { authorizePrRequest, prReviewRunResponse } from "@/lib/server/agent/pr-actions";

/**
 * Numo's review of this pull request, as a SESSION.
 *  GET → { review, events, reviewedHeadSha, defaultModel }
 *
 * Read when the panel opens (replay the wire), then re-poll while a pass
 * turns — live realtime (`pr-review:{id}`) is comfort, this GET is
 * net: tab asleep, message lost, page reloaded in the middle.
 *
 * The trigger remains a POST on the parent route
 * (`{ action: 'ai_review' }`): this is a gesture on the PR, not on its session.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prReviewRunResponse(auth.scope, auth.userId);
}
