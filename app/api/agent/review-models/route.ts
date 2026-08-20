import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getPrReviewModelCatalog } from "@/lib/server/agent/models-catalog";
import { getInstancePrReviewModel } from "@/lib/server/agent/model";
import { capability } from "@/lib/server/capabilities";

/**
 * Picker's catalog "have verified by Numo".
 *
 * It is that of the OpenRouter PLATFORM key, and not that of the active provider of the
 * account (`/api/agent/models`): the review runs on the platform key, including
 * included for a BYOK account — offer them their native IDs (`gpt-…`,
 * `claude-…`) would cause a non-routable model to be chosen, which would fail at first
 * call. The tool-calling filter of `getPlatformModelCatalog` is exactly this
 * what is needed here: the review is a forced tool call.
 *
 * `defaultModel` is the instance setting (`pr_review_model`, /admin): this verse
 * what the “default” option of the picker points to.
 *
 * The model ceiling is attached only for runs on minddy's quota. A validated
 * BYOK key leaves the review's model choice uncapped. The instance default
 * (`pr_review_model`) also escapes the ceiling: it is deliberately expensive,
 * and refusing it would close reviews to smaller plans.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const [catalog, defaultModel] = await Promise.all([
    getPrReviewModelCatalog(auth.user.id),
    getInstancePrReviewModel(),
  ]);
  return NextResponse.json({
    ...catalog,
    defaultModel,
    cloudExecutionConfigured: capability("agentExecution").configured,
  });
}
