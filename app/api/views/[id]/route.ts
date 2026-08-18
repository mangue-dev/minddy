import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  detachDomainFromVercelOnly,
  getDomainForShare,
} from "@/lib/server/custom-domains";
import { updateView } from "@/lib/server/views";
import { getServiceClient } from "@/lib/supabase-service";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/views/[id] — update a view (access enforced in updateView). */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await updateView({
    viewId: id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.view);
}

/** DELETE /api/views/[id] — delete a view (RLS enforces ownership/sharing).
    The kind='my' system view is undeletable (RLS blocks it too — this
    pre-check just turns the silent no-op into an explicit 400). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data: existing } = await auth.supabase
    .from("views")
    .select("id, kind")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: t("viewNotFound") }, { status: 404 });
  }
  if (existing.kind === "my") {
    return NextResponse.json({ error: t("systemViewLocked") }, { status: 400 });
  }

  // The cascade views → view_shares → custom_domains takes the domain line
  // but not the Vercel attachment (MIN-36) — captured before, detached after.
  const service = getServiceClient();
  const { data: shareRow } = await service
    .from("view_shares")
    .select("id")
    .eq("view_id", id)
    .maybeSingle();
  const domainRow = shareRow ? await getDomainForShare(shareRow.id as string) : null;

  const { data, error } = await auth.supabase
    .from("views")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/views/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("viewNotFound") }, { status: 404 });
  if (domainRow) await detachDomainFromVercelOnly(domainRow);
  return NextResponse.json({ ok: true });
}
