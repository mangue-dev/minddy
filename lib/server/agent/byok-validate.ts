import "server-only";

import {
  getAgentProvider,
  isLocalAgentProvider,
  type AgentProviderId,
} from "@/lib/agent-providers";

/**
 * PROBE D'UNE CLÉ BYOK (MIN-344) — le fournisseur reconnaît-il cette clé ?
 *
 * Déclarer une clé suffisait à passer en usage illimité. On présente donc la clé
 * au fournisseur AVANT d'en tirer la moindre conséquence de facturation : un
 * appel authentifié, lu pour son STATUT et rien d'autre (on ne garde ni la liste
 * de modèles ni le corps de la réponse — le catalogue a déjà son propre chemin,
 * avec son cache).
 *
 * Trois verdicts, et la nuance compte :
 *   • `valid`     — la clé a répondu, on peut lever les plafonds ;
 *   • `invalid`   — le fournisseur la REFUSE (401/403) : c'est un fait, on le dit
 *                   à l'utilisateur au lieu d'enregistrer une clé morte ;
 *   • `unknown`   — panne réseau, 5xx, endpoint absent : on ne sait pas. La clé
 *                   s'enregistre, mais sans date de validation — donc sans lever
 *                   de plafond, et `getUserByok` retentera plus tard.
 *
 * `unknown` est le repli SÛR des deux côtés : on ne refuse pas une bonne clé sur
 * un hoquet d'OpenRouter, et on ne crédite pas d'illimité une clé qu'on n'a pas
 * vue marcher.
 */

export type ByokProbeVerdict = "valid" | "invalid" | "unknown";

/** Au-delà, on ne sait pas — et on ne fait pas attendre l'écran des réglages. */
const PROBE_TIMEOUT_MS = 8000;

interface ProbeRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * L'appel authentifié le moins cher de chaque fournisseur.
 *
 * OpenRouter a mieux qu'un `/models` — qui est PUBLIC chez lui, et répondrait
 * 200 à une clé bidon : `/key` décrit la clé présentée, donc n'existe que pour
 * une clé qui existe. Les autres passent par leur listing, qui exige la clé.
 */
function probeRequestFor(
  provider: AgentProviderId,
  baseUrl: string,
  apiKey: string,
): ProbeRequest {
  switch (provider) {
    case "openrouter":
      return { url: `${baseUrl}/key`, headers: { Authorization: `Bearer ${apiKey}` } };
    case "anthropic":
      return {
        url: `${baseUrl}/models?limit=1`,
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      };
    default:
      // OpenAI, Google et tout serveur OpenAI-compatible : `/models` authentifié.
      return { url: `${baseUrl}/models`, headers: { Authorization: `Bearer ${apiKey}` } };
  }
}

/**
 * Présente la clé au fournisseur. Ne lève jamais : un échec est un verdict, pas
 * une exception — l'appelant décide quoi en faire.
 *
 * La base URL est supposée DÉJÀ passée par le garde anti-SSRF (`assertPublicHttpUrl`,
 * MIN-341) : c'est l'appelant qui la tient, ici on ne fait que l'appeler.
 */
export async function probeByokKey(params: {
  provider: AgentProviderId;
  apiKey: string;
  baseUrl: string;
}): Promise<ByokProbeVerdict> {
  const { provider, apiKey, baseUrl } = params;
  if (!apiKey || !baseUrl) return "invalid";
  if (!getAgentProvider(provider)) return "invalid";
  // Une sonde depuis le déploiement cloud annulerait précisément la promesse du
  // provider local. Son état est établi par le premier appel du proxy local.
  if (isLocalAgentProvider(provider)) return "unknown";

  const { url, headers } = probeRequestFor(provider, baseUrl.replace(/\/+$/, ""), apiKey);
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (res.ok) return "valid";
    // 401/403 = la clé est refusée. 402 aussi : OpenRouter le rend pour une clé
    // VRAIE mais sans crédit — elle ne fera tourner aucun run, la traiter comme
    // valide reviendrait à lever un plafond au bénéfice d'un endpoint qui refuse
    // déjà de servir. 429/5xx = on ne sait rien de la clé, seulement de l'heure.
    if (res.status === 401 || res.status === 403 || res.status === 402) return "invalid";
    return "unknown";
  } catch {
    // Réseau, DNS, timeout : aucune information sur la clé.
    return "unknown";
  }
}
