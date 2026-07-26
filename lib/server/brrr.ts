import "server-only";
import { after } from "next/server";
import type { User } from "@supabase/supabase-js";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { getAppEnv, type AppEnv } from "@/lib/env";

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

/**
 * Programme l'envoi hors du chemin de réponse : l'utilisateur qui vient de
 * s'inscrire ne doit pas attendre le push pour être redirigé. `after()` maintient
 * l'invocation en vie le temps de la requête sortante — sans lui, la lambda gèle
 * après la redirection et le push part une fois sur deux. Même motif que
 * lib/server/posthog.ts ; hors contexte de requête, on retombe sur un envoi
 * détaché.
 */
function schedulePush(push: BrrrPush): void {
  try {
    after(() => sendBrrr(push));
  } catch {
    void sendBrrr(push);
  }
}

/** Suffixe d'environnement : une inscription de test ne doit pas se faire passer
    pour un vrai utilisateur. Rien en production. */
function envSuffix(env: AppEnv): string {
  return env === "production" ? "" : ` (${env})`;
}

/**
 * « Quelqu'un vient de créer un compte. »
 *
 * L'email est volontairement dans le message : c'est une alerte d'exploitation
 * pour l'équipe, pas un affichage produit — la règle « jamais l'email brut »
 * (lib/display-name.ts) vaut pour l'UI. Le nom, lui, suit bien la résolution
 * maison ; sans repli sur l'email il est vide quand le compte n'en porte pas.
 */
export function notifyNewUser(user: User): void {
  const email = user.email ?? "(sans email)";
  const name = authDisplayName(user.user_metadata as AuthNameMeta, null, "");
  const provider = user.app_metadata?.provider ?? "email";

  schedulePush({
    title: `🎉 Nouvel utilisateur minddy${envSuffix(getAppEnv())}`,
    message: `${name ? `${name} (${email})` : email} vient de s'inscrire via ${provider}.`,
    threadId: "new-user",
    sound: "cha_ching",
  });
}
