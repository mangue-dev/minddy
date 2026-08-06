import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { deviceLabelFromUserAgent } from "@/lib/device-label";
import { PUSH_DEVICE_COLUMNS } from "@/lib/server/push/columns";
import type { PushDevice } from "@/lib/types";

/**
 * Les appareils abonnés aux notifications push du compte appelant (MIN-183).
 *
 * Tout passe par le client AUTHENTIFIÉ, jamais par le service : la RLS de
 * `push_subscriptions` (self-manage strict) garantit la propriété, là où un
 * `eq("user_id", …)` écrit à la main se serait un jour oublié quelque part.
 * Seul l'ENVOI prend le client service — lui écrit pour le compte d'un autre.
 */

/** GET — mes appareils, du plus récent au plus ancien. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("push_subscriptions")
    .select(PUSH_DEVICE_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/push-subscriptions] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ devices: (data ?? []) as unknown as PushDevice[] });
}

/**
 * POST — enregistre (ou rafraîchit) l'abonnement de CET appareil.
 *
 * L'upsert porte sur `endpoint`, la clé métier : un navigateur qui se ré-abonne
 * DÉPLACE sa ligne au lieu d'en créer une seconde — et s'il a changé de compte
 * entre-temps (poste partagé), la ligne change de propriétaire au lieu de
 * laisser l'ancien recevoir les notifications du nouveau.
 *
 * `oldEndpoint` vient du `pushsubscriptionchange` du service worker : le
 * navigateur a fait tourner l'abonnement tout seul, l'ancienne ligne ne désigne
 * plus rien et doit partir, sans quoi la carte montrerait deux fois le même
 * appareil.
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

  const { endpoint, keys, locale, oldEndpoint } = (body ?? {}) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    locale?: unknown;
    oldEndpoint?: unknown;
  };

  const p256dh = keys?.p256dh;
  const authSecret = keys?.auth;
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof p256dh !== "string" ||
    !p256dh ||
    typeof authSecret !== "string" ||
    !authSecret
  ) {
    return NextResponse.json({ error: t("pushSubscriptionInvalid") }, { status: 400 });
  }

  const now = new Date().toISOString();
  const userAgent = request.headers.get("user-agent");
  const { data, error } = await auth.supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: auth.user.id,
        endpoint,
        p256dh,
        auth: authSecret,
        // Calculé côté serveur depuis l'en-tête : rien à croire d'un corps de
        // requête pour une étiquette qu'on affichera telle quelle.
        device_label: deviceLabelFromUserAgent(userAgent),
        user_agent: userAgent,
        locale: typeof locale === "string" && locale.trim() ? locale.trim() : "en",
        // Un ré-enregistrement RALLUME l'appareil : on ne repasse par ce chemin
        // qu'en ayant délibérément (re)donné la permission.
        enabled: true,
        last_seen_at: now,
        failure_count: 0,
      },
      { onConflict: "endpoint" }
    )
    .select(PUSH_DEVICE_COLUMNS)
    .single();

  if (error) {
    console.error("[api/push-subscriptions] upsert failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  if (typeof oldEndpoint === "string" && oldEndpoint && oldEndpoint !== endpoint) {
    const { error: cleanupError } = await auth.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", oldEndpoint);
    // Best-effort : au pire une ligne morte de plus, que le premier 410 purgera.
    if (cleanupError) {
      console.error(
        "[api/push-subscriptions] cleanup of rotated endpoint failed:",
        cleanupError.message
      );
    }
  }

  return NextResponse.json({ device: data as unknown as PushDevice });
}
