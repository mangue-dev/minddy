import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { PUSH_DEVICE_COLUMNS } from "@/lib/server/push/columns";
import type { PushDevice } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Un appareil abonné, pris un par un (MIN-183) : l'allumer/l'éteindre, ou le
 * retirer.
 *
 * Les deux gestes sont distincts et le restent :
 *   • PATCH `enabled` COUPE l'envoi sans toucher à l'abonnement navigateur — la
 *     permission reste acquise, l'appareil se rallume d'un clic. C'est le geste
 *     « pas ce soir ».
 *   • DELETE retire la ligne. C'est le geste « j'ai changé de téléphone ». Rien
 *     ne peut plus être poussé à cet endpoint, même si le navigateur d'en face
 *     garde son abonnement (il ne fera plus rien de personne).
 *
 * Client AUTHENTIFIÉ dans les deux cas : la RLS fait la vérification de
 * propriété, et une ligne qui ne m'appartient pas est simplement introuvable —
 * d'où le 404 sur zéro ligne touchée, qui ne distingue pas « n'existe pas » de
 * « pas à vous ».
 */

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

  const { enabled } = (body ?? {}) as { enabled?: unknown };
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("push_subscriptions")
    .update({ enabled, failure_count: 0 })
    .eq("id", id)
    .select(PUSH_DEVICE_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[api/push-subscriptions] update failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("pushDeviceNotFound") }, { status: 404 });
  }
  return NextResponse.json({ device: data as unknown as PushDevice });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { count, error } = await auth.supabase
    .from("push_subscriptions")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("[api/push-subscriptions] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: t("pushDeviceNotFound") }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
