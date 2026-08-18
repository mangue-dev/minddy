import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { FaviconError } from "@/lib/server/favicon";
import { resolveLinkResource } from "@/lib/server/link-resource";
import { MAX_LINK_URL_LENGTH } from "@/lib/server/attachments";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/link-preview → { url, file_name, icon_data_url }
 *
 * The counterpart of direct upload for a LINK (MIN-184): the client posts a
 * URL, the server returns the descriptor that the registration route expects.
 * The two gestures then become symmetrical — a file goes towards the
 * storage puis on enregistre son descripteur, un lien part ici puis on
 * saves its own — and the creation modal, where the entity does not exist
 * again, follows exactly the same path as the sidebar.
 *
 * Nothing is written: it's an overview. The road is limited in flow because
 * that it OUTPUTS an HTTP request on the server side; anti-SSRF guards
 * (protocol, private IPs, re-validated redirects, timeout, size ceiling)
 * live in [favicon.ts](../../../../../lib/server/favicon.ts).
 *
 * A valid public URL never fails the route: site unreachable or
 * absent favicon renders a partial preview (hostname for label, null icon).
 * Only an unrecoverable URL — exotic protocol, private IP, dead DNS — is worth
 * un 400.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const rl = checkSessionRateLimit(auth.user.id, "link-preview", { limit: 30 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const url = (body as { url?: unknown })?.url;
  if (
    typeof url !== "string" ||
    !url.trim() ||
    url.length > MAX_LINK_URL_LENGTH
  ) {
    return NextResponse.json({ error: t("linkInvalidUrl") }, { status: 400 });
  }

  try {
    return NextResponse.json(await resolveLinkResource(url));
  } catch (err) {
    if (err instanceof FaviconError) {
      return NextResponse.json({ error: t("linkInvalidUrl") }, { status: 400 });
    }
    console.error("[api/projects/:id/link-preview] failed:", err);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
