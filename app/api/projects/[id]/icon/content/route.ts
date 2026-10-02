import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { downloadProjectIcon } from "@/lib/server/project-icon";
import { getBoardByToken } from "@/lib/server/feedback/boards";
import { getPublicShareTarget } from "@/lib/server/view-shares";
import { isShareUnlocked } from "@/lib/server/share-unlock";
import { getRequestDomainTarget } from "@/lib/server/custom-domains";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Serve icon bytes only to a current project member or a valid public share. */
export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("share_token");
  const kind = url.searchParams.get("share_kind");
  if (!UUID.test(id) || (token && token.length > 512)) {
    return new NextResponse(null, { status: 404 });
  }
  const domain = await getRequestDomainTarget();
  if (domain && domain.projectId !== id) {
    return new NextResponse(null, { status: 404 });
  }
  let allowed = false;
  if (token && kind === "feedback") {
    const context = await getBoardByToken(token);
    allowed = context?.board.enabled === true && context.project.id === id;
  } else if (token && kind === "share") {
    const context = await getPublicShareTarget(token);
    allowed = context?.project.id === id &&
      await isShareUnlocked(context.share);
  } else {
    const auth = await getAuthedUser(request);
    allowed = auth.ok && !!(await getProjectAccess(auth.user.id, id));
  }
  if (!allowed) return new NextResponse(null, { status: 404 });
  try {
    const icon = await downloadProjectIcon(id);
    if (!icon) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(icon.bytes), {
      headers: { "content-type": icon.mimeType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    console.error("[project-icon] authorized read failed", error);
    return new NextResponse(null, { status: 500 });
  }
}
