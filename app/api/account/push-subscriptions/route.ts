import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { deviceLabelFromUserAgent } from "@/lib/device-label";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";
import { PUSH_DEVICE_COLUMNS } from "@/lib/server/push/columns";
import { capability } from "@/lib/server/capabilities";
import {
  parsePushRegistration,
  resolveRegistrationState,
} from "@/lib/server/push/registration";
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
  return NextResponse.json({
    devices: (data ?? []) as unknown as PushDevice[],
    capabilities: {
      web: capability("webPush").configured,
      apns: capability("apns").configured,
    },
  });
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
 *
 * `refresh: true` marque les appels que PERSONNE n'a demandés — la remise
 * d'aplomb au chargement de l'app, le ré-abonnement spontané du navigateur.
 * Eux ne touchent pas à `enabled` : voir lib/server/push/registration.ts, c'est
 * toute la différence entre un interrupteur qui tient et un qui se rallume à la
 * page suivante.
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

  const { locale, oldEndpoint, refresh } = (body ?? {}) as {
    locale?: unknown;
    oldEndpoint?: unknown;
    refresh?: unknown;
  };
  const registration = parsePushRegistration(body);
  if (!registration) {
    return NextResponse.json({ error: t("pushSubscriptionInvalid") }, { status: 400 });
  }
  const {
    endpoint: endpointValue,
    transport: selectedTransport,
    p256dh,
    auth: authSecret,
    installationId,
  } = registration;

  // Une configuration publique partielle ne doit pas suffire à enregistrer un
  // appareil que ce serveur ne pourra jamais joindre. Cette garde précède aussi
  // la résolution DNS anti-SSRF de l'endpoint web : capacité absente = aucun
  // appel réseau, même de validation.
  const transportCapability = capability(
    selectedTransport === "web" ? "webPush" : "apns",
  );
  if (!transportCapability.configured) {
    return NextResponse.json(
      { error: transportCapability.diagnostic },
      { status: 503 },
    );
  }

  // Un endpoint est une adresse que le serveur ira APPELER, à chaque
  // notification, pour toujours. Le navigateur y met celle de son service de
  // push ; le corps de la requête, lui, est écrit par qui veut — d'où le garde
  // anti-SSRF sur l'adresse résolue (MIN-341), en plus du https.
  if (selectedTransport === "web") {
    try {
      await assertPublicHttpUrl(endpointValue);
    } catch {
      return NextResponse.json({ error: t("pushSubscriptionInvalid") }, { status: 400 });
    }
  }

  const rotatedFrom =
    typeof oldEndpoint === "string" && oldEndpoint && oldEndpoint !== endpointValue
      ? oldEndpoint
      : null;

  // L'état ANTÉRIEUR de cet appareil : sa propre ligne, ou celle que le
  // ré-abonnement vient de périmer. La RLS ne rend que les miennes, donc rien à
  // filtrer de plus.
  const priorQuery = auth.supabase
    .from("push_subscriptions")
    .select("endpoint, enabled, locale");
  const { data: priorRows } = installationId
    ? await priorQuery.eq("native_installation_id", installationId)
    : await priorQuery.in(
        "endpoint",
        rotatedFrom ? [endpointValue, rotatedFrom] : [endpointValue]
      );
  const priorRow =
    priorRows?.find((r) => r.endpoint === endpointValue) ?? priorRows?.[0] ?? null;
  const state = resolveRegistrationState(
    priorRow
      ? { enabled: priorRow.enabled as boolean, locale: priorRow.locale as string }
      : null,
    { locale, refresh }
  );

  const now = new Date().toISOString();
  const userAgent = request.headers.get("user-agent");
  const { data, error } = await auth.supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: auth.user.id,
        endpoint: endpointValue,
        transport: selectedTransport,
        p256dh: selectedTransport === "web" ? p256dh : null,
        auth: selectedTransport === "web" ? authSecret : null,
        native_installation_id: installationId,
        // Calculé côté serveur depuis l'en-tête : rien à croire d'un corps de
        // requête pour une étiquette qu'on affichera telle quelle.
        device_label: deviceLabelFromUserAgent(userAgent),
        user_agent: userAgent,
        locale: state.locale,
        // Une activation allume ; un rafraîchissement respecte le réglage en
        // place (lib/server/push/registration.ts).
        enabled: state.enabled,
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

  if (rotatedFrom) {
    const { error: cleanupError } = await auth.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", rotatedFrom);
    // Best-effort : au pire une ligne morte de plus, que le premier 410 purgera.
    if (cleanupError) {
      console.error(
        "[api/push-subscriptions] cleanup of rotated endpoint failed:",
        cleanupError.message
      );
    }
  }

  if (installationId) {
    const { error: cleanupError } = await auth.supabase
      .from("push_subscriptions")
      .delete()
      .eq("native_installation_id", installationId)
      .neq("endpoint", endpointValue);
    if (cleanupError) {
      console.error("[api/push-subscriptions] cleanup of rotated APNs token failed:", cleanupError.message);
    }
  }

  return NextResponse.json({ device: data as unknown as PushDevice });
}
