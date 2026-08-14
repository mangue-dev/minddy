import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { afterOrNow } from "@/lib/server/after-safe";
import { sha256Hex } from "@/lib/server/oauth/crypto";

/**
 * Le compteur d'échecs d'un partage protégé — PERSISTANT (MIN-347).
 *
 * `checkSessionRateLimit` reste la première ligne : elle est gratuite et coupe
 * le martèlement avant toute requête. Mais elle vit en mémoire, donc par
 * instance, et repart à zéro à chaque déploiement — sur une porte anonyme dont
 * le seul secret est un mot de passe, c'est un frein qu'il suffit d'attendre.
 * Ce module-ci compte en base, comme le fait déjà l'OTP du board public.
 *
 * Deux plafonds, parce qu'il y a deux façons de balayer :
 *  - PAR ORIGINE, serré : c'est le cas courant, une machine qui essaie ;
 *  - PAR PARTAGE, large : le balayage distribué. Large parce que ce plafond-là
 *    ferme la porte à TOUT LE MONDE, y compris aux visiteurs légitimes — il est
 *    posé au-dessus de ce qu'une équipe entière peut rater en une heure, et il
 *    tombe de lui-même une heure plus tard.
 *
 * Un déverrouillage réussi efface les échecs de son origine : se tromper deux
 * fois avant de trouver ne laisse pas de dette.
 */

/** Fenêtre des deux compteurs. */
const WINDOW_MS = 60 * 60 * 1000;
/** Échecs tolérés par origine et par partage, sur la fenêtre. */
const MAX_PER_IP = 10;
/** Échecs tolérés sur un partage, toutes origines confondues. */
const MAX_PER_SHARE = 100;

/** Empreinte d'origine, jamais l'IP en clair — même sel que `feedback_otp_codes`. */
function hashIp(ip: string): string {
  return sha256Hex(
    `share-unlock-ip:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}:${ip}`
  );
}

/**
 * Reste-t-il des essais ? Lit les deux compteurs en une passe.
 *
 * Ne LÈVE jamais : une base qui répond mal ne doit pas transformer une page
 * publique en 500. On laisse passer — la limite en mémoire, elle, tient
 * toujours, et scrypt est de toute façon devant.
 */
export async function shareUnlockAttemptsLeft(
  shareId: string,
  ip: string
): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  try {
    // Dans le `try` : sur une configuration incomplète, `getServiceClient` lève,
    // et ça ne doit pas se voir en 500 sur une page publique.
    const service = getServiceClient();
    const [byIp, byShare] = await Promise.all([
      service
        .from("share_unlock_attempts")
        .select("id", { count: "exact", head: true })
        .eq("share_id", shareId)
        .eq("ip_hash", hashIp(ip))
        .gte("created_at", since),
      service
        .from("share_unlock_attempts")
        .select("id", { count: "exact", head: true })
        .eq("share_id", shareId)
        .gte("created_at", since),
    ]);
    return (byIp.count ?? 0) < MAX_PER_IP && (byShare.count ?? 0) < MAX_PER_SHARE;
  } catch (e) {
    console.error("[share-unlock] attempt count failed:", (e as Error).message);
    return true;
  }
}

/**
 * Range un échec, et purge au passage ce qui est sorti de la fenêtre.
 *
 * Hors chemin critique, donc par `afterOrNow` : la réponse part sans attendre,
 * mais l'invocation reste en vie le temps de l'écriture. Détacher la promesse
 * la ferait mourir en vol, et le compteur ne compterait rien.
 */
export function recordShareUnlockFailure(shareId: string, ip: string): void {
  const ipHash = hashIp(ip);
  afterOrNow(async () => {
    const service = getServiceClient();
    const { error } = await service
      .from("share_unlock_attempts")
      .insert({ share_id: shareId, ip_hash: ipHash });
    if (error) console.error("[share-unlock] attempt insert failed:", error.message);

    const { error: purgeError } = await service
      .from("share_unlock_attempts")
      .delete()
      .lt("created_at", new Date(Date.now() - WINDOW_MS).toISOString());
    if (purgeError) {
      console.error("[share-unlock] attempt purge failed:", purgeError.message);
    }
  });
}

/** Le bon mot de passe efface l'ardoise de cette origine. */
export function clearShareUnlockFailures(shareId: string, ip: string): void {
  const ipHash = hashIp(ip);
  afterOrNow(async () => {
    const { error } = await getServiceClient()
      .from("share_unlock_attempts")
      .delete()
      .eq("share_id", shareId)
      .eq("ip_hash", ipHash);
    if (error) console.error("[share-unlock] attempt clear failed:", error.message);
  });
}
