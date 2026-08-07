import "server-only";

import { currentDeploymentScope } from "./deployment";

/**
 * Origine (scheme+host) de l'app pour l'auto-invocation du drain de l'agent
 * (MIN-46). minddy n'a pas de helper d'origine canonique ; on privilégie l'URL
 * du DÉPLOIEMENT courant (VERCEL_URL) pour que l'enfant s'exécute sur le même
 * déploiement, sinon le domaine de prod. Utilisé comme fallback quand la route
 * cron ne fournit pas sa propre origine de requête.
 */
export function getAgentDrainOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return "https://www.minddy.app";
}

/**
 * Origine que la microVM appelle pour joindre le PLAN DE CONTRÔLE (MIN-223) —
 * events, ledger, checkpoint, tools de plateforme.
 *
 * Ce n'est pas `getAgentDrainOrigin` : celle-ci privilégie `NEXT_PUBLIC_APP_URL`,
 * qui vaut le domaine de PROD jusque sur un preview. Une microVM lancée par un
 * preview doit parler à SON déploiement, pas à la prod — même règle que
 * l'affinité de drain (`deploymentScopeFromEnv`, MIN-165) : un run continue avec
 * le code qui l'a lancé, sinon le plan de contrôle et la boucle divergent en
 * plein tour.
 *
 * Elle sert aussi de `forwardURL` et donc d'`aud` de l'OIDC vérifié par
 * `defineSandboxProxy` : c'est une adresse EXACTE, pas une préférence
 * d'affichage. Hors Vercel (poste de dev), on retombe sur la prod — une microVM
 * ne sait pas joindre un localhost.
 */
export function agentControlOrigin(): string {
  const scope = currentDeploymentScope();
  if (scope) return `https://${scope}`;
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return new URL(explicit).origin;
  return "https://www.minddy.app";
}
