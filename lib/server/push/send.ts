import "server-only";

import webpush, { type WebPushError } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

import { configureWebPush } from "./vapid";
import { toPushLocale, type PushLocale, type PushPayload } from "./payload";

/**
 * L'envoi Web Push, et l'entretien du parc d'abonnements qui va avec (MIN-183).
 *
 * ## Le contrat : jamais de throw
 *
 * Même contrat que `insertNotifications` — on log, on avale. Un service de push
 * injoignable ne doit pas faire échouer le commentaire qui l'a déclenché, ni la
 * cascade d'automatisations dans laquelle il tourne.
 *
 * ## Les abonnements MEURENT, et c'est normal
 *
 * Un abonnement n'a pas de fin de vie annoncée : l'utilisateur désinstalle la
 * PWA, révoque la permission, efface les données du site — et l'endpoint répond
 * alors 404 ou 410, définitivement. Sans purge, la table accumulerait des lignes
 * mortes que la carte des réglages montrerait comme des appareils actifs, et à
 * qui on continuerait de pousser à chaque événement. La purge se fait donc ICI,
 * au moment où le service de push nous le dit : c'est le seul endroit qui
 * l'apprend.
 *
 * Les autres codes ne se traitent pas pareil, et c'est le point :
 *   • 403 → la SIGNATURE est refusée : les clés VAPID ont changé sous les pieds
 *           des abonnements. Ce n'est pas l'appareil qui est mort, c'est nous
 *           qui avons cassé le lien — supprimer serait effacer la preuve.
 *   • 413 → charge utile trop grosse. Un bug de fabrication, pas un appareil.
 *   • 429 / 5xx → transitoire. On compte, on garde, ça repassera.
 *
 * ## Concurrence bornée
 *
 * Quelqu'un peut avoir dix appareils, et un insert peut concerner dix personnes.
 * Un `Promise.all` sur tout le produit ouvrirait cent requêtes sortantes d'un
 * coup depuis une lambda. Cinq à la fois suffisent largement et tiennent la
 * queue courte.
 */

/** Ce que la table stocke d'un appareil, réduit à ce dont l'envoi a besoin. */
export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: string | null;
}

const CONCURRENCY = 5;

/** 24 h : au-delà, une notification d'inbox n'a plus d'intérêt — l'appareil qui
 *  se rallume trois jours après n'a pas à recevoir une rafale de l'avant-veille. */
const TTL_SECONDS = 60 * 60 * 24;

/** L'issue d'un envoi vers un appareil, telle que l'appelant peut la lire. */
export type PushSendOutcome = "sent" | "gone" | "failed" | "skipped";

const statusOf = (e: unknown): number | null => {
  const status = (e as WebPushError | undefined)?.statusCode;
  return typeof status === "number" ? status : null;
};

/**
 * Un envoi, vers un appareil. Met la ligne à jour selon l'issue : succès →
 * horodatage et compteur d'échecs remis à zéro ; abonnement mort → la ligne
 * disparaît ; échec transitoire → le compteur monte.
 */
async function sendToSubscription(
  service: SupabaseClient,
  sub: PushSubscriptionRow,
  payload: PushPayload
): Promise<PushSendOutcome> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: TTL_SECONDS, urgency: "normal" }
    );
    await service
      .from("push_subscriptions")
      .update({ last_push_at: new Date().toISOString(), failure_count: 0 })
      .eq("id", sub.id);
    return "sent";
  } catch (e) {
    const status = statusOf(e);

    if (status === 404 || status === 410) {
      // L'abonnement n'existe plus chez le service de push. Rien à réparer :
      // la ligne ne désignera plus jamais un appareil joignable.
      await service.from("push_subscriptions").delete().eq("id", sub.id);
      return "gone";
    }

    if (status === 403) {
      console.error(
        "[push] 403 du service de push — clés VAPID désaccordées de cet abonnement " +
          "(la paire a-t-elle changé ?). L'appareil devra se réabonner."
      );
      return "failed";
    }

    console.error(
      `[push] envoi échoué (${status ?? "sans statut"}):`,
      (e as Error).message
    );
    // `failure_count + 1` sans RPC : la valeur lue peut être périmée, mais
    // c'est un indicateur d'entretien, pas un compteur transactionnel.
    const { data } = await service
      .from("push_subscriptions")
      .select("failure_count")
      .eq("id", sub.id)
      .maybeSingle();
    if (data) {
      await service
        .from("push_subscriptions")
        .update({ failure_count: ((data.failure_count as number) ?? 0) + 1 })
        .eq("id", sub.id);
    }
    return "failed";
  }
}

/** Exécute les tâches par vagues de `CONCURRENCY`. */
async function inBatches<T>(
  tasks: readonly (() => Promise<T>)[],
  size = CONCURRENCY
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    out.push(...(await Promise.all(tasks.slice(i, i + size).map((task) => task()))));
  }
  return out;
}

/** Les appareils actifs d'un compte. Client SERVICE : on lit pour le compte de
 *  quelqu'un d'autre, hors de toute requête authentifiée. */
export async function activeSubscriptionsOf(
  service: SupabaseClient,
  userId: string
): Promise<PushSubscriptionRow[]> {
  const { data, error } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, locale")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (error) {
    console.error("[push] lecture des abonnements échouée:", error.message);
    return [];
  }
  return (data ?? []) as PushSubscriptionRow[];
}

/**
 * Pousse vers tous les appareils actifs d'un compte.
 *
 * `payloadFor` est appelé par LANGUE et non par appareil : la formulation est la
 * même pour deux téléphones en français, et sa fabrication coûte un formateur
 * next-intl. Rendre `null` (cible disparue) n'envoie rien pour cette langue-là.
 */
export async function sendPushToUser(
  service: SupabaseClient,
  userId: string,
  payloadFor: (locale: PushLocale) => PushPayload | null,
  opts: { onlyEndpoint?: string } = {}
): Promise<{ sent: number; gone: number; failed: number }> {
  const tally = { sent: 0, gone: 0, failed: 0 };
  if (!configureWebPush()) return tally;

  let subs = await activeSubscriptionsOf(service, userId);
  if (opts.onlyEndpoint) {
    subs = subs.filter((s) => s.endpoint === opts.onlyEndpoint);
  }
  if (subs.length === 0) return tally;

  const payloads = new Map<PushLocale, PushPayload | null>();
  const payloadCached = (locale: PushLocale): PushPayload | null => {
    if (!payloads.has(locale)) payloads.set(locale, payloadFor(locale));
    return payloads.get(locale) ?? null;
  };

  const tasks = subs.flatMap((sub) => {
    const payload = payloadCached(toPushLocale(sub.locale));
    if (!payload) return [];
    return [() => sendToSubscription(service, sub, payload)];
  });

  for (const outcome of await inBatches(tasks)) {
    if (outcome === "sent") tally.sent++;
    else if (outcome === "gone") tally.gone++;
    else if (outcome === "failed") tally.failed++;
  }
  return tally;
}
