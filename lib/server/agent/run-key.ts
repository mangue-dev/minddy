import "server-only";
import { SITE_NAME } from "@/lib/site";

/**
 * Clé LLM PAR RUN, à plafond dur (MIN-223).
 *
 * LE PROBLÈME QU'ELLE BORNE, et il ne se referme pas autrement. La politique
 * réseau ([network-policy.ts](network-policy.ts)) fait que la microVM ne détient
 * plus la clé : c'est le firewall qui la pose, après la sortie. Mais elle laisse
 * la VM **appeler la route créditée hors de la boucle** — un `curl` suffit, la
 * sonde du cadrage l'a fait. Ce n'est pas de l'exfiltration, c'est de la
 * DÉPENSE, et elle échappe au ledger : personne ne la voit passer.
 *
 * Un contrôle de plus DANS la VM ne borne rien — elle est compromise par
 * hypothèse. Ce qui borne, c'est un plafond tenu **hors de la VM et hors de notre
 * code** : une clé OpenRouter émise pour ce run, avec `limit` en dollars et
 * `expires_at`. Au-delà, c'est le fournisseur qui refuse. Le pire cas devient
 * « le run a dépensé son budget sans rien produire », pas « la facture de minddy
 * a doublé cette nuit ».
 *
 * BYOK : pas de mint. La clé de l'utilisateur est injectée telle quelle — aussi
 * inexfiltrable que la nôtre, mais **non plafonnable** : c'est sa clé et sa
 * facture, et l'API de provisioning d'OpenRouter n'émet que sur le compte qui la
 * détient. Ça se DIT dans l'écran BYOK, ça ne se corrige pas.
 *
 * DÉGRADATION VOULUE **DANS UNE MICROVM**, et nulle part ailleurs : sans
 * `OPENROUTER_PROVISIONING_KEY`, le chemin cloud retombe sur la clé plateforme.
 * Le mint y est un garde-fou de dépense, pas un prérequis de fonctionnement —
 * une variable pas encore posée en prod ne doit pas empêcher un run de tourner,
 * elle doit lui retirer son plafond fournisseur et le DIRE dans les logs. Elle ne
 * le disait pas : `mintRunKey` rendait `null` sans un mot quand la variable
 * manquait, ce qui est la seule façon pour une dégradation d'être vraiment
 * silencieuse (MIN-357).
 *
 * ET CETTE DÉGRADATION N'EXISTE PAS SUR LA MACHINE DE L'UTILISATEUR. La clé
 * plateforme est NON PLAFONNÉE et partagée avec Numo, la transcription, les
 * embeddings et le catalogue : la laisser descendre sur un Mac, où le compute de
 * microVM — dernier garde-fou du cloud — vaut structurellement zéro, serait
 * offrir un robinet ouvert. **Pas de mint = pas de run local** : le lanceur garde
 * le run dans le cloud (`admitLocalRun`, [local-exec.ts](local-exec.ts)) et la
 * surface qui sert la clé refuse en 503 (`/llm-key`, control-plane.ts).
 */

/** Clé de provisioning OpenRouter (émet et révoque les clés de run). JAMAIS
 *  passée à la politique réseau : elle ne sort pas de la fonction. */
const PROVISIONING_ENV = "OPENROUTER_PROVISIONING_KEY";
const KEYS_URL = "https://openrouter.ai/api/v1/keys";

/**
 * Plancher du plafond, en dollars. Un run dont il ne reste presque rien à
 * dépenser sur SON budget recevrait sinon une clé à 0 $, donc morte à la première
 * complétion — et le tour échouerait sur un 402 illisible au lieu de s'arrêter
 * proprement sur son budget (ce que la boucle sait déjà faire, et dire).
 *
 * Il ne franchit JAMAIS le restant du COMPTE : c'est un plancher sous un plafond,
 * pas un droit de dépenser un quart de dollar de plus que ce que l'utilisateur a.
 */
const MIN_CAP_USD = 0.25;
/**
 * Marge au-dessus du budget restant DU RUN. Ce plafond-là est un FILET derrière un
 * gouverneur qui marche : c'est la boucle qui arrête le run sur `budget_usd`, avec
 * un message. Le serrer à l'euro près ferait gagner la course au fournisseur, et
 * l'utilisateur lirait une erreur d'API là où il devait lire « budget atteint ».
 *
 * Elle ne s'applique QU'À ce budget-là. Le restant du compte, lui, ne se multiplie
 * pas : c'est de l'argent qui n'existe pas.
 */
const CAP_HEADROOM = 1.5;
/**
 * Ce qu'on accorde quand le restant du compte est INCONNU — `checkAgentQuota` en
 * panne, donc facturation injoignable. La boucle est alors sans plafond elle
 * aussi (`budgetUsd` vaut `undefined`), ce qui fait de cette clé le seul garde-fou
 * du passage : trop bas il casse un run ordinaire (0,07 à 0,24 $ mesurés), trop
 * haut il ne borne plus rien.
 */
const UNKNOWN_REMAINING_CAP_USD = 1.5;
/** Durée de vie d'une clé de run. Large devant un tour, court devant l'oubli. */
const KEY_TTL_MS = 24 * 60 * 60_000;

export interface RunKey {
  /** Le secret `sk-or-v1-…`. Ne sort d'ici que vers la politique réseau. */
  key: string;
  /** Identifiant de révocation (`hash` chez OpenRouter) — à persister sur le run. */
  hash: string;
  /** Plafond posé, en dollars. */
  capUsd: number;
}

/** L'API de provisioning est-elle configurée ? Sert aussi à l'écran d'admin. */
export function runKeyMintingEnabled(): boolean {
  return Boolean(process.env[PROVISIONING_ENV]?.trim());
}

/**
 * Le plafond à poser sur la clé d'un run.
 *
 * DEUX BUDGETS, ET ILS N'ONT PAS LE MÊME STATUT — c'est tout ce que cette
 * fonction dit.
 *
 * - le budget du RUN (`agent_runs.budget_usd`, une routine réglée à « 15 % de mon
 *   plan ») est un GOUVERNEUR : la boucle l'oppose à sa dépense à chaque round et
 *   s'arrête dessus en le disant. La clé le double d'une marge, pour que ce soit
 *   toujours notre message que l'utilisateur lise, jamais un 402 ;
 * - le restant du COMPTE (budget mensuel inclus du plan, moins ce qui a été
 *   consommé) est un PLAFOND DUR. Il ne se multiplie pas et ne se relève pas :
 *   au-delà, on ferait dépenser à l'utilisateur un argent qu'il n'a pas.
 *
 * L'ancienne version prenait le `min` des deux PUIS multipliait le tout par la
 * marge, plancher compris. Sur le cas COURANT — un run sans budget propre, donc
 * le seul restant du compte — un utilisateur à 3 $ de reste recevait une clé à
 * 4,50 $, et un utilisateur à 0,10 $ une clé à 0,25 $. Le garde-fou accordait
 * jusqu'à 50 % de plus que le budget qu'il était censé tenir.
 *
 * Les deux entrées sont du RÉEL, pas des colonnes : `runSpentUsd` est le max de
 * la colonne et de la somme du ledger (MIN-215), et le restant du compte descend
 * de `getUserUsage`, qui somme l'usage de la fenêtre de facturation, toutes
 * features comprises — compute de microVM inclus.
 */
export function runKeyCapUsd(opts: {
  /** Plafond posé sur le run lui-même (`agent_runs.budget_usd`), s'il y en a un. */
  runBudgetUsd?: number | null;
  /** Ce que le run a déjà dépensé, tous chunks confondus (ledger compris). */
  runSpentUsd?: number;
  /** Ce qu'il reste du budget mensuel du COMPTE. `undefined` = inconnu ou
   *  illimité — mais en BYOK (le seul cas illimité) on ne mint pas. */
  accountRemainingUsd?: number;
}): number {
  const ceiling =
    typeof opts.accountRemainingUsd === "number" && Number.isFinite(opts.accountRemainingUsd)
      ? Math.max(0, opts.accountRemainingUsd)
      : undefined;
  const fromRun =
    opts.runBudgetUsd == null
      ? undefined
      : Math.max(0, Number(opts.runBudgetUsd) - (opts.runSpentUsd ?? 0)) * CAP_HEADROOM;

  // Sans budget de run, ce qu'on demande EST le restant du compte — donc, une fois
  // le plafond dur appliqué, exactement lui.
  const asked = fromRun ?? ceiling ?? UNKNOWN_REMAINING_CAP_USD;
  const floored = Math.max(asked, MIN_CAP_USD);
  const capped = ceiling === undefined ? floored : Math.min(floored, ceiling);
  return Math.round(capped * 100) / 100;
}

/**
 * Émet une clé pour ce run. `null` si l'API de provisioning n'est pas configurée
 * ou refuse : l'appelant retombe alors sur la clé plateforme — sans plafond
 * fournisseur, et il le dit.
 */
export async function mintRunKey(opts: {
  runId: string;
  capUsd: number;
}): Promise<RunKey | null> {
  const provisioning = process.env[PROVISIONING_ENV]?.trim();
  if (!provisioning) {
    // LE SEUL ÉCHEC QUI NE SE DISAIT PAS (MIN-357). Les deux autres branches
    // journalisent depuis le début ; celle-ci, la seule qui soit permanente sur
    // un déploiement, rendait `null` en silence — et l'appelant retombait sur la
    // clé plateforme sans que rien, nulle part, ne l'ait dit une seule fois.
    console.error(`[agent-run-key] ${PROVISIONING_ENV} manquante — run non plafonné chez le fournisseur`);
    return null;
  }
  try {
    const res = await fetch(KEYS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${provisioning}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        // Le nom est LU par un humain dans le tableau de bord OpenRouter le jour
        // où une clé traîne : il doit dire de quel run elle vient.
        name: `${SITE_NAME} agent run ${opts.runId}`,
        limit: opts.capUsd,
        expires_at: new Date(Date.now() + KEY_TTL_MS).toISOString(),
      }),
    });
    if (!res.ok) {
      console.error(`[agent-run-key] mint failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const body = (await res.json()) as { key?: string; data?: { hash?: string } };
    const key = body.key?.trim();
    const hash = body.data?.hash?.trim();
    // Le secret n'est rendu qu'à la création : sans les deux, la clé est
    // inutilisable ET irrévocable. Mieux vaut ne pas s'en servir du tout.
    if (!key || !hash) {
      console.error("[agent-run-key] mint returned no key/hash");
      return null;
    }
    return { key, hash, capUsd: opts.capUsd };
  } catch (err) {
    console.error("[agent-run-key] mint failed:", (err as Error).message);
    return null;
  }
}

/**
 * Révoque une clé de run. Best-effort et idempotent : une clé déjà supprimée
 * rend 404, ce qui est le résultat voulu. Appelée quand la microVM est mise au
 * repos — la clé ne survit jamais à la session qui l'utilisait, et un réveil en
 * remint une.
 */
export async function revokeRunKey(hash: string): Promise<void> {
  const provisioning = process.env[PROVISIONING_ENV]?.trim();
  if (!provisioning || !hash) return;
  try {
    const res = await fetch(`${KEYS_URL}/${encodeURIComponent(hash)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${provisioning}` },
    });
    if (!res.ok && res.status !== 404) {
      console.error(`[agent-run-key] revoke failed (${res.status}) for ${hash}`);
    }
  } catch (err) {
    console.error("[agent-run-key] revoke failed:", (err as Error).message);
  }
}
