import type { NetworkPolicy, NetworkPolicyRule } from "@vercel/sandbox";

import { chatCompletionsUrl } from "@/lib/agent-providers";

/**
 * Politique réseau de la microVM de l'agent (MIN-223). PUR et testable sans
 * sandbox — comme `command-guard.ts` et `repo-path.ts`, c'est de la logique qui
 * garde quelque chose qu'on ne peut pas rattraper après coup.
 *
 * LE PRINCIPE, ET IL EST INHABITUEL : **la microVM ne détient aucun secret DE
 * MINDDY.** Ni clé LLM, ni clé Supabase, ni jeton d'identité. Ce n'est pas une
 * discipline de code, c'est la plateforme :
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
 * LE SECRET QU'ELLE DÉTIENT QUAND MÊME, et la phrase ci-dessus disait le contraire
 * (MIN-327). **Le token de forge est dans la VM**, dans le `remote.origin.url` que
 * `git clone` a écrit dans `.git/config`. Ce n'est pas rattrapable par une
 * politique réseau : c'est ce avec quoi la VM clone et pousse, elle ne peut pas
 * travailler sans. Ce qui est rattrapable, et qui l'est depuis MIN-327, c'est ce
 * que ce token OUVRE :
 *
 * - il est scopé AU DÉPÔT que le projet a lié (`repositories` au mint), là où il
 *   valait sur tous les dépôts de l'installation ;
 * - son pouvoir est celui de l'ANCRAGE du run : `contents: write` pour un run qui
 *   pousse, `contents: read` pour une relecture, qui n'écrit rien dans le dépôt et
 *   dont le contenu vient d'un fork inconnu (`RepoTokenAccess`, repo-access.ts) ;
 * - et il ne remonte pas dans les journaux : la substitution de `redact.ts` le
 *   retire de tout ce qui SORT de la boucle, avant même que le modèle le voie.
 *
 * L'affirmation trop large, elle, n'était pas neutre : elle a dispensé de regarder
 * ce que ce token-là ouvrait vraiment.
 *
 * ET TOUT CE QUI PRÉCÈDE NE VAUT QUE D'UNE MICROVM (MIN-355). Ce fichier décrit
 * une politique posée par le firewall de Vercel Sandbox : un tour qui joue sur la
 * machine de l'utilisateur n'en a aucune, et n'a donc rien de ce que la plateforme
 * garantit ici. Il PORTE un jeton d'exécution locale
 * ([local-exec-token.ts](local-exec-token.ts)) — « la machine qui exécute ne
 * détient aucun jeton d'identité » cesse d'être vraie là-bas, et ce qui la remplace
 * n'est pas une cachette mais une réduction de pouvoir, écrite dans
 * `handleControlPlaneRequest`.
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

/** Le locataire Vercel qui a le droit de parler au plan de contrôle : NOTRE team
 *  et NOTRE projet, ceux-là mêmes qui créent les microVM des runs. */
export interface ControlPlaneTenant {
  teamId: string;
  projectId: string;
}

/** Ce que la plateforme signe sur une requête forwardée (`ProxyMeta`), réduit à
 *  ce dont l'admission a besoin. */
export interface SandboxCaller {
  teamId: string;
  projectId: string;
  sandboxName: string;
}

export type SandboxAdmission =
  | { ok: true; runId: string }
  | { ok: false; status: 403 | 503; error: string };

/**
 * Le locataire attendu, lu dans l'environnement. Mêmes variables que la création
 * de microVM et que les domaines personnalisés (MIN-36) — pas une de plus à tenir.
 *
 * Et ce n'est pas qu'une économie de configuration : c'est la paire que
 * `sandboxCredentials()` (sandbox.ts) présente pour CRÉER les microVM. On
 * compare donc le locataire de l'appelant à celui qui l'a fait naître — une
 * valeur fausse ne laisserait pas passer un intrus, elle empêcherait le run
 * d'exister.
 *
 * `null` quand l'une manque, et l'appelant en fait un **503, pas un passe-droit** :
 * un plan de contrôle qui ne sait pas qui il sert ne sert personne.
 */
export function resolveControlPlaneTenant(
  env: Record<string, string | undefined> = process.env,
): ControlPlaneTenant | null {
  const teamId = env.VERCEL_TEAM_ID?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  return teamId && projectId ? { teamId, projectId } : null;
}

/**
 * QUI A LE DROIT DE PARLER (MIN-331), et pourquoi la signature ne suffisait pas.
 *
 * `defineSandboxProxy` vérifie que le jeton est un OIDC **de Vercel** : signature
 * contre le JWKS de `oidc.vercel.com`, `aud` égale à l'URL forwardée, fenêtre de
 * validité. Aucune de ces trois vérifications ne dit **de quel compte** vient la
 * VM : l'émetteur est commun à toute la plateforme, et l'`aud` est celle que
 * l'appelant a lui-même posée dans le `forwardURL` de SA politique réseau. Un
 * attaquant qui déploie chez lui, pointe son `forwardURL` sur notre origine et
 * nomme sa sandbox `agent-<uuid d'un vrai run>` passait tout ça — et repartait
 * avec le jeton de forge du run, son checkpoint et sa surface d'outils.
 *
 * Ce qui tranche, c'est le locataire : `team_id` et `project_id` sont posés par
 * la plateforme, hors de portée de l'appelant. On exige les nôtres, puis
 * seulement ensuite on lit le nom — car c'est ce nom qui, lui, désigne le run.
 */
export function admitSandboxCaller(
  caller: SandboxCaller,
  tenant: ControlPlaneTenant | null,
): SandboxAdmission {
  if (!tenant) {
    return { ok: false, status: 503, error: "control plane tenant not configured" };
  }
  if (caller.teamId !== tenant.teamId || caller.projectId !== tenant.projectId) {
    return { ok: false, status: 403, error: "foreign sandbox" };
  }
  const runId = runIdFromSandboxName(caller.sandboxName);
  if (!runId) return { ok: false, status: 403, error: "not an agent sandbox" };
  return { ok: true, runId };
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
