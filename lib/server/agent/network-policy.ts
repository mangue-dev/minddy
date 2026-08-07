import type { NetworkPolicy, NetworkPolicyRule } from "@vercel/sandbox";

import { chatCompletionsUrl } from "@/lib/agent-providers";

/**
 * Politique réseau de la microVM de l'agent (MIN-223). PUR et testable sans
 * sandbox — comme `command-guard.ts` et `repo-path.ts`, c'est de la logique qui
 * garde quelque chose qu'on ne peut pas rattraper après coup.
 *
 * LE PRINCIPE, ET IL EST INHABITUEL : **la microVM ne détient aucun secret.** Ni
 * clé LLM, ni clé Supabase, ni jeton d'identité. Ce n'est pas une discipline de
 * code, c'est la plateforme :
 *
 * - le firewall de Vercel Sandbox termine le TLS de la VM et **pose lui-même**
 *   l'en-tête `authorization` sur la requête de complétion (`transform`), après
 *   la sortie de la VM. La clé n'entre jamais dans son espace mémoire ; la boucle
 *   envoie un placeholder et reçoit une vraie complétion (mesuré, cf.
 *   docs/orchestrateur-process-long.md §1) ;
 * - le plan de contrôle (events, ledger, checkpoint, tools) passe par
 *   `forwardURL` : le firewall forwarde la requête vers notre route en y
 *   ajoutant un OIDC signé par la plateforme, dont le claim `sandbox_name` vaut
 *   `agent-<run.id>`. **Une VM ne peut donc rien prétendre d'autre que son propre
 *   run** — ce qu'un jeton porté dans la VM n'aurait pas su garantir.
 *
 * DEUX CHOIX QUI ONT L'AIR DE DÉTAILS ET N'EN SONT PAS.
 *
 * 1. `path: { exact }` sur la route de complétion, **jamais** un `startsWith`.
 *    C'est ce mot qui met `/api/v1/key` — la route de PROVISIONING d'OpenRouter,
 *    voisine d'un segment — hors de portée : mesurée à 401 avec le placeholder,
 *    là qu'un préfixe l'aurait créditée et aurait laissé la VM émettre ses
 *    propres clés.
 * 2. Le catch-all `"*": []` reste : le reste d'Internet est OUVERT, sans
 *    injection. On ferme le chemin du **secret**, pas celui de la **donnée** —
 *    l'exfiltration du contenu du dépôt est déjà possible aujourd'hui
 *    (`run_command` + réseau ouvert) et une liste blanche stricte casserait
 *    `npm install` sur les dépôts de nos utilisateurs, dont on ne connaît ni les
 *    registres privés ni les miroirs. Traiter les deux comme un seul problème,
 *    c'est n'en résoudre aucun.
 *
 * CE QUI RESTE POSSIBLE, ET QUI EST BORNÉ AILLEURS : un modèle hostile peut
 * appeler la route créditée hors de la boucle (un `curl` suffit). Ce n'est pas
 * de l'exfiltration, c'est de la dépense, et elle échappe au ledger. Le
 * garde-fou n'est pas un contrôle de plus dans la VM — elle est compromise par
 * hypothèse — c'est la clé par run à plafond dur de `run-key.ts`, tenue par le
 * fournisseur.
 */

/**
 * Préfixe des URL du plan de contrôle, **identique** dans la VM et sur la route.
 *
 * Le firewall APPEND le chemin demandé par la VM à `forwardURL`. En posant
 * `forwardURL` = l'origine nue, l'URL que la VM appelle et l'URL qui arrive chez
 * nous sont donc littéralement la même — le firewall n'y ajoute que l'OIDC. Un
 * appel direct à cette URL depuis la VM est impossible : il matche la règle,
 * donc il est forwardé, donc il porte l'OIDC. Et un appel depuis n'importe où
 * ailleurs arrive sans OIDC et se fait refuser par `defineSandboxProxy`.
 */
export const AGENT_VM_PATH_PREFIX = "/api/agent-vm";

/** Ce que la boucle met dans `authorization` : le firewall l'écrase. Sa seule
 *  fonction est d'être reconnaissable dans un log ou une trace réseau. */
export const AGENT_LLM_PLACEHOLDER_KEY = "minddy-placeholder";

/** Préfixe du nom de microVM d'un run. Le nom EST l'identité : c'est lui que la
 *  plateforme signe dans le claim `sandbox_name` de l'OIDC. */
const AGENT_SANDBOX_PREFIX = "agent-";

/** Nom déterministe de la microVM d'un run (persisté dans `agent_runs.sandbox_id`). */
export function agentSandboxName(runId: string): string {
  return `${AGENT_SANDBOX_PREFIX}${runId}`;
}

/**
 * Le run qu'une microVM PEUT prétendre être — dérivé de son nom, donc du claim
 * OIDC signé par la plateforme, jamais du corps de la requête.
 *
 * C'est là que tient toute la sécurité du plan de contrôle : une VM n'écrit pas
 * sur son run parce qu'on vérifie qu'elle en a le droit, mais parce qu'elle **ne
 * peut rien prétendre d'autre**. Un jeton porté dans la VM, ou un `runId` dans le
 * corps, auraient demandé une vérification ; ici il n'y a rien à vérifier.
 *
 * `null` sur tout ce qui n'est pas `agent-<uuid>` : une sandbox de sonde, un
 * outil interne, un nom inventé. Le format uuid est exigé — sans lui, un
 * `agent-../..` partirait en requête Postgrest sur une chaîne arbitraire.
 */
export function runIdFromSandboxName(name: string): string | null {
  if (!name.startsWith(AGENT_SANDBOX_PREFIX)) return null;
  const candidate = name.slice(AGENT_SANDBOX_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

export interface AgentNetworkPolicyInput {
  /**
   * Base URL OpenAI-compatible du provider du run (sans `/chat/completions`),
   * telle que `resolveAgentApiKey` la résout — registre pour un provider connu,
   * URL saisie pour un BYOK générique.
   */
  baseUrl: string;
  /**
   * La VRAIE clé : celle du run (plafond dur) en mode plateforme, celle de
   * l'utilisateur en BYOK. Elle ne sert qu'ici, et elle ne descend pas plus bas
   * que le firewall.
   */
  llmKey: string;
  /**
   * Origine (scheme + host, sans chemin) du déploiement qui tient le plan de
   * contrôle. La VM doit joindre CE déploiement-là : un run lancé par une preview
   * ne parle pas à la prod.
   */
  appOrigin: string;
}

/** Host + chemin d'une URL absolue. Lève sur une URL illisible — mieux vaut
 *  refuser de démarrer la VM que la démarrer sans politique. */
function splitUrl(raw: string, label: string): { host: string; path: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`agent network policy: ${label} is not an absolute URL (${raw})`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`agent network policy: ${label} must be http(s) (${raw})`);
  }
  return { host: url.host, path: url.pathname };
}

/**
 * La politique à poser sur la microVM d'un run.
 *
 * Trois entrées, et l'ordre de lecture est celui de leur importance :
 *   1. le provider LLM — une seule route créditée, en POST, chemin EXACT ;
 *   2. notre propre origine — le plan de contrôle, forwardé avec OIDC ;
 *   3. `"*"` — tout le reste, ouvert et sans injection.
 *
 * Une requête vers un domaine listé qui ne matche AUCUNE règle passe quand même,
 * simplement non transformée (mesuré : `GET /api/v1/key` ressort en 401 côté
 * OpenRouter, pas en refus du firewall). Lister un domaine ne le restreint donc
 * pas — ça lui ajoute des règles.
 */
export function buildAgentNetworkPolicy(input: AgentNetworkPolicyInput): NetworkPolicy {
  const llm = splitUrl(chatCompletionsUrl(input.baseUrl), "provider base URL");
  const app = splitUrl(input.appOrigin, "app origin");
  if (app.path !== "/") {
    throw new Error(`agent network policy: app origin must have no path (${input.appOrigin})`);
  }
  if (!input.llmKey.trim()) {
    throw new Error("agent network policy: missing LLM key");
  }

  const llmRule: NetworkPolicyRule = {
    match: { method: ["POST"], path: { exact: llm.path } },
    transform: [{ headers: { authorization: `Bearer ${input.llmKey}` } }],
  };
  const controlRule: NetworkPolicyRule = {
    match: { path: { startsWith: `${AGENT_VM_PATH_PREFIX}/` } },
    forwardURL: input.appOrigin.replace(/\/+$/, ""),
  };

  // Le provider et le plan de contrôle peuvent partager un host (BYOK générique
  // hébergé chez nous, jamais vu mais pas interdit) : leurs règles s'additionnent
  // alors sur la même entrée, elles ne s'écrasent pas.
  const allow: Record<string, NetworkPolicyRule[]> = { "*": [] };
  for (const [host, rule] of [
    [llm.host, llmRule],
    [app.host, controlRule],
  ] as const) {
    (allow[host] ??= []).push(rule);
  }
  return { allow };
}

/** URL que la boucle, DANS la VM, appelle pour une surface du plan de contrôle
 *  (`events`, `usage`, `checkpoint`…). Le firewall y ajoute l'OIDC en passant. */
export function agentVmUrl(appOrigin: string, surface: string): string {
  const base = appOrigin.replace(/\/+$/, "");
  const path = surface.startsWith("/") ? surface : `/${surface}`;
  return `${base}${AGENT_VM_PATH_PREFIX}${path}`;
}
