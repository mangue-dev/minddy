import "server-only";

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
 * DÉGRADATION VOULUE : sans `OPENROUTER_PROVISIONING_KEY`, on retombe sur la clé
 * plateforme. Le mint est un garde-fou de dépense, pas un prérequis de
 * fonctionnement — une variable pas encore posée en prod ne doit pas empêcher un
 * run de tourner, elle doit lui retirer son plafond fournisseur et le dire dans
 * les logs.
 */

/** Clé de provisioning OpenRouter (émet et révoque les clés de run). JAMAIS
 *  passée à la politique réseau : elle ne sort pas de la fonction. */
const PROVISIONING_ENV = "OPENROUTER_PROVISIONING_KEY";
const KEYS_URL = "https://openrouter.ai/api/v1/keys";

/**
 * Plancher du plafond, en dollars. Un run dont il ne reste presque rien à
 * dépenser recevrait sinon une clé à 0 $, donc morte à la première complétion —
 * et le tour échouerait sur un 402 illisible au lieu de s'arrêter proprement sur
 * son budget (ce que la boucle sait déjà faire, et dire).
 */
const MIN_CAP_USD = 0.25;
/**
 * Marge au-dessus du budget restant. Le plafond fournisseur est un FILET, pas le
 * gouverneur : c'est la boucle qui arrête le run sur son budget, avec un message.
 * Le serrer à l'euro près ferait gagner la course au fournisseur, et l'utilisateur
 * lirait une erreur d'API là où il devait lire « budget atteint ».
 */
const CAP_HEADROOM = 1.5;
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
 * Le plafond à poser sur la clé d'un run : ce qu'il reste à dépenser, plancher
 * et marge compris. `null` en usage illimité (BYOK) — mais on n'y mint pas.
 */
export function runKeyCapUsd(opts: {
  /** Plafond posé sur le run lui-même (`agent_runs.budget_usd`), s'il y en a un. */
  runBudgetUsd?: number | null;
  /** Ce que le run a déjà dépensé, tous chunks confondus. */
  runSpentUsd?: number;
  /** Ce qu'il reste du budget mensuel du COMPTE. `undefined` = illimité. */
  accountRemainingUsd?: number;
}): number {
  const fromRun =
    opts.runBudgetUsd == null
      ? undefined
      : Math.max(0, Number(opts.runBudgetUsd) - (opts.runSpentUsd ?? 0));
  const candidates = [fromRun, opts.accountRemainingUsd].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const remaining = candidates.length ? Math.min(...candidates) : MIN_CAP_USD * 4;
  return Math.max(MIN_CAP_USD, Math.round(remaining * CAP_HEADROOM * 100) / 100);
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
  if (!provisioning) return null;
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
        name: `minddy agent run ${opts.runId}`,
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
