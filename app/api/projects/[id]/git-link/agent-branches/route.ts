import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { isForgeApiError } from "@/lib/server/agent/forge";
import {
  deleteAgentBranches,
  previewAgentBranches,
} from "@/lib/server/git/branch-cleanup";

/**
 * Linked Repository Agent Branches (MIN-102): GET returns ALL that minddy has
 * pushed and which still exist (with their status — PR merged, refused,
 * open, or none), POST deletes those designated to it.
 *
 * Owner only — deleting remote branches is the same as
 * untie the deposit. POST does not trust its list: the server module
 * recalculates the preview and accepts only its intersection.
 */

type RouteContext = { params: Promise<{ id: string }> };

// One deletion per branch, in sequence, at the forge: same budget as the
// autres routes qui parlent au provider.
export const maxDuration = 60;

/** POST safety ceiling — well beyond an actual household. */
const MAX_BRANCHES_PER_REQUEST = 200;

/** Auth + project owner. Returns the failure response, or null if it passes. */
async function denyUnlessOwner(
  request: NextRequest,
  projectId: string,
): Promise<NextResponse | null> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, projectId);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const denied = await denyUnlessOwner(request, id);
  if (denied) return denied;

  try {
    const preview = await previewAgentBranches(id);
    if (!preview) {
      return NextResponse.json({ error: "noRepo", code: "noRepo" }, { status: 409 });
    }
    return NextResponse.json(preview);
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const denied = await denyUnlessOwner(request, id);
  if (denied) return denied;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const branches = (body as { branches?: unknown })?.branches;
  if (
    !Array.isArray(branches) ||
    branches.length === 0 ||
    branches.length > MAX_BRANCHES_PER_REQUEST ||
    // 255 = the ceiling of the ref names on the forges side — beyond that, not a branch.
    !branches.every((b) => typeof b === "string" && b.length > 0 && b.length <= 255)
  ) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  try {
    const results = await deleteAgentBranches(id, branches as string[]);
    if (!results) {
      return NextResponse.json({ error: "noRepo", code: "noRepo" }, { status: 409 });
    }
    return NextResponse.json({ results });
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
