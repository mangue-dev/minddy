import { NextResponse, type NextRequest } from "next/server";
import { createTranslator } from "next-intl";
import { getTranslations } from "next-intl/server";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { isPushConfigured } from "@/lib/server/push/vapid";
import { isApnsConfigured } from "@/lib/server/push/apns";
import { toPushLocale } from "@/lib/server/push/payload";
import { sendPushToUser } from "@/lib/server/push/send";

/**
 * POST /api/account/push-subscriptions/test — fait sonner UN appareil (MIN-183).
 *
 * Sans ce bouton, la seule façon de savoir si un appareil marche est d'attendre
 * qu'il se passe quelque chose, puis de ne pas savoir interpréter le silence :
 * permission refusée ? worker mort ? notifications coupées par le système ? Le
 * test transforme ça en une réponse immédiate — et un 410 y devient une purge
 * visible plutôt qu'un mystère.
 *
 * La notification part dans la langue de l'APPAREIL, pas dans celle de l'onglet
 * qui déclenche le test : ce qu'on vérifie, c'est ce que cet appareil recevra
 * vraiment.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const { endpoint } = (body ?? {}) as { endpoint?: unknown };
  if (typeof endpoint !== "string" || !endpoint) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  // Client AUTHENTIFIÉ pour la vérification de propriété : la RLS rend la ligne
  // d'un autre compte introuvable, sans qu'on ait à y penser.
  const { data: device, error } = await auth.supabase
    .from("push_subscriptions")
    .select("id, transport, locale, enabled")
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (error) {
    console.error("[api/push-subscriptions/test] lookup failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!device) {
    return NextResponse.json({ error: t("pushDeviceNotFound") }, { status: 404 });
  }
  const configured =
    device.transport === "apns" ? isApnsConfigured() : isPushConfigured();
  if (!configured) {
    return NextResponse.json({ error: t("pushNotConfigured") }, { status: 503 });
  }
  // `sendPushToUser` ne vise que les appareils actifs : un appareil éteint ne
  // sonnerait pas, et le silence se lirait comme une panne.
  if (!device.enabled) {
    return NextResponse.json({ error: t("pushDeviceDisabled") }, { status: 409 });
  }

  const locale = toPushLocale(device.locale as string | null);
  const tPush = createTranslator({
    locale,
    messages: locale === "fr" ? (fr as typeof en) : en,
    namespace: "Push",
  });

  // Service : c'est lui qui porte l'entretien du parc (purge d'un 410, remise à
  // zéro du compteur d'échecs), et ces écritures-là ne passent pas par la RLS.
  const tally = await sendPushToUser(
    getServiceClient(),
    auth.user.id,
    () => ({
      title: tPush("testTitle"),
      body: tPush("testBody"),
      url: "/inbox",
      tag: "minddy-test",
    }),
    { onlyEndpoint: endpoint }
  );

  if (tally.sent > 0) return NextResponse.json({ ok: true });
  // 404/410 : l'abonnement n'existe plus chez le service de push, et l'envoi
  // vient de supprimer sa ligne. Le dire franchement — la liste va bouger.
  if (tally.gone > 0) {
    return NextResponse.json({ error: t("pushDeviceGone") }, { status: 410 });
  }
  return NextResponse.json({ error: t("pushSendFailed") }, { status: 502 });
}
