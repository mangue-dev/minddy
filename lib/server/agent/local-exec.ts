import "server-only";

import {
  LOCAL_EXEC_MAX_TTL_SECONDS,
  resolveLocalExecSecret,
  signLocalExecToken,
} from "./local-exec-token";
import { runKeyMintingEnabled } from "./run-key";
import { bumpLocalExecGen } from "./runs";

/**
 * LE BAIL D'EXÉCUTION LOCALE (MIN-355) — l'émission du jeton, moitié base.
 *
 * Séparé de [local-exec-token.ts](local-exec-token.ts), qui reste PUR : la
 * cryptographie et le contrat de claims se testent sans base, et c'est ce qui
 * permet de les casser dans un test plutôt qu'en production. Ici, il n'y a qu'un
 * geste, et il en fait deux à la fois.
 *
 * ÉMETTRE, C'EST RÉVOQUER. On incrémente la génération AVANT de signer : à la
 * seconde où cette fonction rend, tout jeton émis auparavant pour ce run est
 * refusé par le plan de contrôle. Ce n'est pas un effet de bord, c'est la
 * fonctionnalité — un jeton auto-porteur ne se rappelle pas, et « une machine par
 * run » ne peut donc pas être une règle qu'on demande à quelqu'un de respecter.
 *
 * Corollaire à savoir avant de câbler le renouvellement (MIN-294) : deux machines
 * qui réclament le même run se chassent mutuellement, la dernière servie gagne. Un
 * conflit s'y voit donc tout de suite, au lieu de produire deux harness qui
 * écrivent le même checkpoint chacun de son côté.
 *
 * ET UNE DÉCISION QUI SE PREND AVANT (MIN-357) : `admitLocalRun`, qui dit si ce
 * run a le droit de jouer sur une machine. Elle est ici et pas dans le lanceur
 * parce qu'elle porte sur la même chose que le bail — ce qu'un tour local a le
 * droit de faire — et qu'un lanceur est le dernier endroit où l'on veut voir un
 * `if` de sécurité écrit à la main.
 */

/**
 * Pourquoi un run ne peut pas jouer sur la machine de l'utilisateur.
 *
 * - `byok` : la clé est celle de l'utilisateur, sur SON compte, et l'API de
 *   provisioning d'OpenRouter n'émet que sur le compte qui détient la clé de
 *   provisioning. Un run BYOK local n'a donc littéralement aucun plafond : pas de
 *   clé plafonnable, pas de `budgetUsd`, et le compute de microVM — dernier
 *   garde-fou du cloud — vaut structurellement zéro sur une machine ;
 * - `no_mint` : `OPENROUTER_PROVISIONING_KEY` n'est pas posée sur ce
 *   déploiement. Dans une microVM jetable, la dégradation vers la clé plateforme
 *   est assumée ; sur la machine de quelqu'un, cette clé-là est NON PLAFONNÉE et
 *   partagée avec Numo, la transcription, les embeddings et le catalogue.
 */
export type LocalRunRefusal = "byok" | "no_mint";

export type LocalRunAdmission = { ok: true } | { ok: false; reason: LocalRunRefusal };

/**
 * UN RUN A-T-IL LE DROIT DE JOUER EN LOCAL ? (MIN-357)
 *
 * L'appelant est le LANCEUR (MIN-293), et ce qu'il doit en faire tient en une
 * phrase : **basculer dans le cloud, jamais déplafonner.** Un run refusé ici
 * n'est pas un run qui échoue — c'est un run qui part en microVM, où tout ce qui
 * manque à une machine existe (firewall, clé posée à la sortie, compute
 * facturé), et où l'absence de mint n'est qu'un plafond fournisseur en moins.
 *
 * Ce qui compte, c'est que la bascule SE DISE : un event `status` de phase
 * `local_exec_declined` portant ce `reason`, que le fil rend en note
 * ([agent-event-feed.tsx](../../../components/agent/agent-event-feed.tsx),
 * `LOCAL_DECLINED_KEYS`). Une bascule silencieuse serait exactement le défaut
 * qu'on vient de corriger dans `mintRunKey` — quelque chose qui se dégrade sans
 * que personne ne le sache. La phase voyage en littéral des deux côtés, comme
 * `sandbox_ready` et `transient_error` : ce module est `server-only`, le fil est
 * un composant client, et une constante partagée demanderait un troisième
 * fichier pour deux chaînes.
 *
 * PUR, et sans lecture de base : les deux entrées sont le mode de clé du run et
 * l'environnement du déploiement. C'est ce qui permet de le casser dans un test.
 */
export function admitLocalRun(opts: { keyMode: "platform" | "byok" }): LocalRunAdmission {
  if (opts.keyMode === "byok") return { ok: false, reason: "byok" };
  if (!runKeyMintingEnabled()) return { ok: false, reason: "no_mint" };
  return { ok: true };
}

/**
 * LE DRAPEAU DEMANDÉ PAR LA PAGE SURVIT-IL AU LANCEMENT ? (MIN-359)
 *
 * `localExec` arrive dans le corps d'un POST : c'est une DEMANDE, pas un fait.
 * Cette fonction est le seul endroit qui la transforme en valeur écrite sur la
 * ligne — et elle ne la laisse passer que pour un run dont le contexte vient
 * de la personne qui lance, sur sa propre machine.
 *
 * **Le prédicat est la SOURCE DU DÉCLENCHEMENT, jamais `job.interactive`** (qui
 * vaut `!run.routine_id`, donc vrai pour une relecture de PR déclenchée par
 * webhook). Un run d'automatisation, de routine ou de chaîne part d'un texte que
 * minddy n'a pas écrit ; dans une microVM jetable, une injection de prompt coûte
 * une VM, sur le Mac de quelqu'un c'est un shell.
 *
 * ⚠ **Ce n'est que la moitié étroite de l'invariant du §7 de l'audit.** L'ancrage
 * `pr` est exclu ici par construction — `launchPrReviewRun` est un chemin à part
 * qui ne passe pas ce drapeau du tout — mais les mentions externes et le board
 * public arrivent par d'autres portes. Le prédicat complet, écrit une fois pour
 * toutes les entrées, appartient à MIN-360.
 */
export function localExecRequested(input: {
  localExec?: boolean;
  triggeredBy: "button" | "chat" | "mention" | "automation" | "routine";
  routineId?: string | null;
  chainId?: string | null;
}): boolean {
  if (input.localExec !== true) return false;
  if (input.routineId || input.chainId) return false;
  // `mention` est exclu volontairement : une mention peut venir d'un commentaire
  // de forge recopié par un webhook, et rien à cet endroit ne distingue les deux.
  return input.triggeredBy === "button" || input.triggeredBy === "chat";
}

/** L'échec est DIT, jamais rendu en jeton vide : l'appelant doit pouvoir choisir
 *  entre « ce run n'est pas local » et « ce déploiement ne sait pas signer ». */
export type IssueLocalExecTokenResult =
  | { ok: true; token: string; gen: number; expiresInSeconds: number }
  | { ok: false; error: "not_configured" | "not_local" };

/**
 * Émet le jeton du prochain tour local d'un run — 15 minutes glissantes.
 *
 * L'appelant est l'APP, qui a la session de l'utilisateur : c'est la seule
 * autorité qui puisse dire qu'une machine a le droit de jouer ce run. Le harness,
 * lui, ne fait que porter ce qu'on lui donne, et redemande quand ça expire.
 */
export async function issueLocalExecToken(
  runId: string,
): Promise<IssueLocalExecTokenResult> {
  const secret = resolveLocalExecSecret();
  if (!secret) {
    // La même conduite que le locataire manquant sur le chemin cloud : un
    // déploiement qui ne sait pas signer ne délivre rien, et il le dit.
    console.error("[agent-local-exec] SUPABASE_SERVICE_ROLE_KEY manquante — aucun jeton local");
    return { ok: false, error: "not_configured" };
  }
  const gen = await bumpLocalExecGen(runId);
  if (gen === null) return { ok: false, error: "not_local" };
  return {
    ok: true,
    token: signLocalExecToken({ runId, gen }, secret),
    gen,
    expiresInSeconds: LOCAL_EXEC_MAX_TTL_SECONDS,
  };
}
