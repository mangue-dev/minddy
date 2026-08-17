import "server-only";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import { getAppEnv } from "@/lib/env";
import { shouldSendServerAnalytics } from "@/lib/analytics-localhost";

/**
 * Événements PostHog émis par le SERVEUR (MIN-78).
 *
 * Pourquoi doubler le client : ces événements-là font AUTORITÉ. Ils partent
 * quel que soit le consentement cookies du navigateur (base légale = intérêt
 * légitime sur une donnée non identifiante côté appareil : aucun cookie n'est
 * posé, le `distinctId` est l'id du compte), et surtout ils existent là où il
 * n'y a pas de navigateur du tout — MCP, agent de code, webhooks Stripe/GitHub,
 * crons. C'est le seul moyen de compter fidèlement les tickets créés quand la
 * moitié le sont par un agent.
 *
 * Ne jamais mettre de PII ni de texte libre dans `properties` : mêmes règles que
 * le catalogue client (compteurs, booléens, enums, ids, tranches).
 */

let client: PostHog | null = null;

/**
 * Client partagé, ou null si les analytics serveur ne doivent pas émettre :
 * pas de clé (self-host, CI), ou exécution en local sans
 * `NEXT_PUBLIC_POSTHOG_ALLOW_LOCALHOST=1`.
 *
 * La garde locale est le pendant exact de celle du navigateur
 * (`isLocalAnalyticsHostname`) : sans elle, couper le flag ne silencerait que
 * la moitié de l'instrumentation et un `pnpm dev` continuerait d'écrire dans
 * le projet de production.
 */
export function getServerPostHog(): PostHog | null {
  const serverKey = process.env.POSTHOG_API_KEY?.trim();
  const serverHost = process.env.POSTHOG_HOST?.trim();
  const publicKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const publicHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  // Une paire reste atomique : mélanger une clé serveur avec l'hôte public (ou
  // l'inverse) activerait un client que le registre de capacités diagnostique
  // comme incomplet. La paire serveur explicite garde la priorité.
  const config =
    serverKey && serverHost
      ? { key: serverKey, host: serverHost }
      : publicKey && publicHost
        ? { key: publicKey, host: publicHost }
        : null;
  if (
    !config ||
    !shouldSendServerAnalytics({
      hasKey: true,
      appEnv: getAppEnv(),
      allowLocalhost: process.env.NEXT_PUBLIC_POSTHOG_ALLOW_LOCALHOST === "1",
    })
  ) {
    return null;
  }
  if (!client) {
    client = new PostHog(config.key, {
      host: config.host,
      flushAt: 5,
      flushInterval: 10_000,
    });
  }
  return client;
}

export interface ServerEvent {
  /** Id du compte concerné, ou un id anonyme stable pour les flux publics. */
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  /** Rattache l'événement à un projet (même type de groupe que côté client). */
  groups?: Record<string, string>;
}

/**
 * Capture un événement serveur ET garantit son envoi avant le gel de la lambda.
 *
 * Le client `posthog-node` bufferise (`flushAt: 5`, `flushInterval: 10s`). Un
 * événement isolé — le cas le PLUS fréquent ici, par ex. le premier
 * `user_signed_up` de la journée — resterait donc dans la file : la route rend
 * sa réponse, la fonction gèle, l'intervalle de 10s ne se déclenche jamais et
 * l'événement est perdu. `after()` maintient l'invocation en vie juste le temps
 * du flush, sans retarder la réponse.
 *
 * Les erreurs sont avalées : une panne PostHog ne doit jamais faire échouer une
 * requête utilisateur. À appeler depuis un contexte de requête (route handler /
 * server action) — c'est toujours le cas ici.
 */
export function captureServerEvent({
  distinctId,
  event,
  properties,
  groups,
}: ServerEvent): void {
  const posthog = getServerPostHog();
  if (!posthog) return;
  try {
    posthog.capture({ distinctId, event, properties, groups });
    after(async () => {
      try {
        await posthog.flush();
      } catch {
        // Un échec de livraison ne doit pas affecter la requête.
      }
    });
  } catch {
    // `after()` hors contexte de requête, ou client en erreur : on ignore.
  }
}

/**
 * Pose des propriétés de personne depuis le serveur (plan Stripe, jalons
 * d'activation). Même garantie de flush que `captureServerEvent`.
 */
export function identifyServerUser(
  distinctId: string,
  properties: Record<string, unknown>
): void {
  const posthog = getServerPostHog();
  if (!posthog) return;
  try {
    posthog.identify({ distinctId, properties });
    after(async () => {
      try {
        await posthog.flush();
      } catch {
        // idem
      }
    });
  } catch {
    // idem
  }
}
