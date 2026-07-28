import "server-only";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { getAppEnv, type AppEnv } from "@/lib/env";
import { SITE_URL } from "@/lib/site";

/**
 * Alertes push brrr.now (MIN-92) — celles qui font vibrer le TÉLÉPHONE.
 *
 * À ne pas confondre avec les notifications de l'app (lib/server/notifications.ts) :
 * ici on ne prévient pas un utilisateur, on prévient l'exploitant. Deux familles
 * d'alertes seulement, et la barre reste haute : ce qui casse (garde-fou qui
 * saute, cron muet) et ce qui compte (quelqu'un vient de créer un compte).
 *
 * Le secret EST l'URL (`https://api.brrr.now/v1/<secret>`) : `BRRR_WEBHOOK_URL`
 * ne doit jamais quitter le serveur. Variable absente = alertes désactivées,
 * ce qui est l'état normal en local et en CI.
 */

type BrrrSound =
  | "default"
  | "brrr"
  | "cha_ching"
  | "upbeat_bells"
  | "bubbly_success_ding";

export interface BrrrPush {
  title: string;
  message: string;
  /** Regroupe les alertes de même nature dans l'app brrr. */
  threadId?: string;
  sound?: BrrrSound;
  /** Où mène la notification. Une alerte doit ouvrir l'écran qui l'explique. */
  openUrl?: string;
}

/** Au-delà, on abandonne : une alerte en retard ne vaut pas une lambda bloquée. */
const PUSH_TIMEOUT_MS = 3_000;

/**
 * Envoie la notification. Ne rejette JAMAIS : une alerte ratée ne doit pas
 * casser le flux qui l'a déclenchée (une inscription, un cron). Les erreurs
 * sont journalisées et avalées.
 *
 * Exportée et attendable pour les futurs appelants hors requête (crons, scripts)
 * qui doivent garantir l'envoi avant de rendre la main.
 */
export async function sendBrrr(push: BrrrPush): Promise<void> {
  const url = process.env.BRRR_WEBHOOK_URL;
  if (!url) {
    console.warn("[brrr] BRRR_WEBHOOK_URL absent : alerte ignorée");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: push.title,
        message: push.message,
        ...(push.threadId ? { thread_id: push.threadId } : {}),
        ...(push.sound ? { sound: push.sound } : {}),
        ...(push.openUrl ? { open_url: push.openUrl } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[brrr] push refusé (HTTP ${res.status})`);
    }
  } catch (err) {
    console.error("[brrr] push échoué :", err);
  }
  clearTimeout(timeout);
}

/** Suffixe d'environnement : une inscription de test ne doit pas se faire passer
    pour un vrai utilisateur. Rien en production. */
function envSuffix(env: AppEnv): string {
  return env === "production" ? "" : ` (${env})`;
}

/**
 * « Quelqu'un vient de créer un compte. »
 *
 * Déclenchée quand l'adresse est CONFIRMÉE (MIN-117), par le webhook de base
 * `app/api/webhooks/supabase/new-user` posé sur `auth.users` — c'est lui qui
 * porte la logique de transition, cette fonction ne fait qu'envoyer. Un compte
 * créé et jamais confirmé n'est pas un utilisateur : il ne déclenche rien.
 *
 * Elle partait auparavant de `app/auth/callback`. Le déplacement n'est pas
 * cosmétique : une inscription par email appelle `signUp()` depuis le
 * NAVIGATEUR, et le callback ne tournait qu'à l'ouverture du lien — lien qui
 * était précisément cassé, d'où les inscriptions silencieuses.
 *
 * ATTENDUE, pas programmée via `after()` : l'appelant est un webhook, il n'y a
 * aucune réponse utilisateur à ne pas retarder — même raisonnement que
 * `notifySpendGuard`.
 *
 * L'email est volontairement dans le message : c'est une alerte d'exploitation
 * pour l'équipe, pas un affichage produit — la règle « jamais l'email brut »
 * (lib/display-name.ts) vaut pour l'UI. Le nom, lui, suit bien la résolution
 * maison ; sans repli sur l'email il est vide quand le compte n'en porte pas.
 */
export async function notifyNewUser(params: {
  email: string | null;
  /** `raw_user_meta_data` de la ligne `auth.users` (= `user_metadata`). */
  metadata: AuthNameMeta | null;
  provider: string;
}): Promise<void> {
  const email = params.email ?? "(sans email)";
  const name = authDisplayName(params.metadata, null, "");

  await sendBrrr({
    title: `🎉 Nouvel utilisateur minddy${envSuffix(getAppEnv())}`,
    message: `${name ? `${name} (${email})` : email} vient de s'inscrire via ${params.provider}.`,
    threadId: "new-user",
    sound: "cha_ching",
  });
}

/**
 * « Le plafond de la clé OpenRouter est presque atteint. » (MIN-92)
 *
 * Ce qui casse ici, c'est Numo, la dictée et le traitement du feedback qui
 * s'arrêtent net jusqu'au mois suivant — d'où le push plutôt qu'un email.
 *
 * ATTENDU, pas programmé via `after()` : l'appelant est un cron, il n'y a aucune
 * réponse utilisateur à ne pas retarder, et l'envoi doit être parti avant que la
 * lambda rende la main. Le franchissement de seuil et l'anti-répétition se
 * décident chez l'appelant (`app/api/cron/spend-guard/route.ts`) : cette
 * fonction ne fait qu'envoyer.
 */
export async function notifySpendGuard(params: {
  threshold: number;
  percent: number;
  usageUsd: number;
  limitUsd: number;
}): Promise<void> {
  const remaining = Math.max(params.limitUsd - params.usageUsd, 0);
  await sendBrrr({
    title: `⚠️ Plafond IA à ${params.percent} %${envSuffix(getAppEnv())}`,
    message:
      `${params.usageUsd.toFixed(2)} $ consommés sur ${params.limitUsd.toFixed(0)} $ ce mois-ci ` +
      `(${remaining.toFixed(2)} $ restants). Au plafond, Numo, la dictée et le feedback s'arrêtent.`,
    threadId: "spend-guard",
    sound: "brrr",
    openUrl: `${SITE_URL}/admin?tab=finances`,
  });
}
