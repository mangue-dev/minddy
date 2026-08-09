/**
 * Durcissement du contexte de l'agent de code (MIN-46) : élagage des sorties de
 * tools périmées. Inspiré du `prune` d'opencode.
 *
 * Sur un run long, les plus gros consommateurs de contexte sont les résultats de
 * `read_file`/`grep`/`list_dir`/`glob` lus il y a de nombreux tours : volumineux
 * et périmés (l'agent a déjà agi dessus). On protège les DERNIERS ~400 Ko de sortie
 * de tools (contexte récent, encore utile) et on remplace les plus anciens par un
 * marqueur — MAIS seulement si l'on récupère au moins ~100 Ko (sinon on ne touche à
 * rien : pas de churn sur les petits runs), et jamais la DERNIÈRE lecture d'un
 * chemin donné (`keepLastPerKey`, MIN-248). Logique PURE, testable ; appelée à la
 * frontière de round dans agent-loop.ts, et seulement sous pression de contexte.
 * Élaguer réduit le coût par appel ET la taille du checkpoint (l'historique EST le
 * checkpoint).
 *
 * Sûreté : on ne modifie QUE le `content` des messages `role:"tool"` (leur
 * `tool_call_id` et l'appariement tool_call ↔ résultat restent intacts). Les
 * messages de l'agent, de l'utilisateur et les tool-calls ne sont jamais touchés.
 */

import { contentChars, imageCount, stripImages, type AgentContentPart } from "./content";

/**
 * Enveloppe d'UN résultat de tool dans l'historique : la boucle sérialise le
 * résultat en JSON et le passe à `headTail`. Un tool qui compose sa sortie doit
 * tenir DEDANS — sinon c'est cette coupe-ci qui décide, et elle élide le milieu
 * du JSON (donc, pour une commande, la queue de stdout : le verdict, MIN-107).
 */
export const TOOL_RESULT_MAX_CHARS = 6000;

/**
 * Octets de sortie de tools (les plus récents) protégés de l'élagage.
 *
 * 400 Ko ≈ 100 k tokens, du même ordre que `AGENT_COMPACT_BASELINE_TOKENS`
 * (120 k) : élaguer est le geste qui PRÉCÈDE la compaction, pas celui qui la
 * remplace. Les 40 Ko d'origine (MIN-46) valaient ~7 fenêtres de `read_file` —
 * un ordre de grandeur sous le seuil de compaction, donc le seul des deux
 * garde-fous à jamais entrer en jeu. Le modèle y perdait ses lectures au bout de
 * quelques rounds et les rachetait une par une : 83 lectures du même fichier en
 * 44 minutes, zéro édition (MIN-248).
 */
export const PRUNE_PROTECT_BYTES = 400_000;
/** On n'élague que si l'on récupère au moins autant (évite le churn). */
export const PRUNE_MINIMUM_BYTES = 100_000;
/** Marqueur qui remplace une sortie de tool élaguée. */
export const PRUNE_STUB =
  "[Tool output elided to save context. Re-read the file or re-run the search if you still need it.]";

/**
 * Tronque une chaîne en gardant le DÉBUT et la FIN (le milieu élidé). Mieux que
 * head-only pour les sorties de commandes : la queue (tail d'un test qui échoue,
 * derniers matchs de grep) est souvent la partie utile.
 */
export function headTail(str: string, max: number): string {
  if (str.length <= max) return str;
  const keep = Math.max(1, Math.floor((max - 40) / 2));
  const elided = str.length - keep * 2;
  return `${str.slice(0, keep)}\n… [${elided} chars elided] …\n${str.slice(-keep)}`;
}

/** Forme minimale d'un message manipulé (compatible AgentChatMessage). */
interface PrunableMessage {
  role: string;
  content?: string | AgentContentPart[] | null;
}

/**
 * Clé de MÉMOIRE d'un résultat de tool : deux résultats de même clé disent la
 * même chose du même objet (le même fichier lu deux fois, à deux fenêtres près),
 * et seul le plus récent vaut d'être gardé. Rendre `null` = ce résultat n'a rien
 * de re-lisible à protéger, il s'élague comme avant.
 *
 * La fonction vient de l'APPELANT : `prune.ts` ne connaît ni les noms de tools ni
 * la forme de leurs arguments (cf. `toolMemoryKeys` dans agent-loop.ts). C'est ce
 * qui garde ce module pur — et testable sans microVM.
 */
export type ToolMemoryKey<T> = (msg: T, index: number) => string | null;

/**
 * Parties image gardées dans TOUT l'historique (MIN-111). L'historique EST le
 * checkpoint : une maquette y reste sous forme de data URL, tour après tour. Sans
 * plafond, une conversation qui ouvre des maquettes à répétition ferait grossir le
 * checkpoint jusqu'au `MAX_CHECKPOINT_BYTES` (8 Mo) qui met le run au repos. Trois
 * images (≈ 3 Mo au pire, cf. le cap par image d'issue-tools.ts) couvrent le cas
 * réel — le ticket porte une maquette, parfois deux états d'un même écran — et
 * laissent la marge au reste du contexte.
 */
export const MAX_HISTORY_IMAGES = 3;
/** Note qui remplace une image élaguée (même contrat que PRUNE_STUB : re-demandable). */
export const IMAGE_ELIDED_NOTE =
  "[Image elided to save context. Call read_resource again if you still need to look at it.]";

/**
 * Borne le nombre d'images RETENUES dans l'historique : garde les
 * `max` plus récentes, remplace les plus anciennes par une note. Ne touche QUE les
 * messages `role:"tool"` (mêmes garanties que `pruneToolOutputs` : l'appariement
 * tool_call↔résultat reste intact, les messages de l'agent et de l'utilisateur ne
 * sont jamais réécrits). Renvoie le nombre d'images élaguées.
 */
export function capHistoryImages<T extends PrunableMessage>(
  messages: T[],
  max: number = MAX_HISTORY_IMAGES,
): number {
  let seen = 0;
  let elided = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "tool") continue;
    const count = imageCount(m.content);
    if (count === 0) continue;
    if (seen + count <= max) {
      seen += count;
      continue;
    }
    // Ce message fait déborder le plafond : on le vide de ses images d'un bloc
    // (une partie d'un même résultat de tool n'a pas de sens à moitié).
    messages[i] = { ...m, content: stripImages(m.content, IMAGE_ELIDED_NOTE) } as T;
    elided += count;
  }
  return elided;
}

/**
 * Élague en place les sorties de tools les plus anciennes. Parcourt l'historique
 * de la fin vers le début : tant que la sortie de tools cumulée reste sous
 * `protectBytes`, on protège ; au-delà, on marque à élaguer. Ne modifie rien si
 * le total récupérable est sous `minimumBytes`. Renvoie le nombre d'octets
 * récupérés (0 si aucun élagage).
 *
 * `keepLastPerKey` ajoute une seconde protection, indépendante de l'âge : le
 * DERNIER résultat de chaque clé survit, aussi vieux soit-il. Un fichier lu vingt
 * fois n'en garde qu'une lecture ; il n'en garde jamais zéro. Sans elle, le stub
 * (« relis le fichier si tu en as encore besoin ») se referme en tapis roulant —
 * le modèle relit, la relecture sort de la fenêtre au round suivant, il relit
 * encore (MIN-248). Le chemin de SAUVETAGE (`checkpoint-fit.ts`) ne la passe pas :
 * quand le checkpoint déborde, tout doit pouvoir partir.
 */
export function pruneToolOutputs<T extends PrunableMessage>(
  messages: T[],
  opts?: { protectBytes?: number; minimumBytes?: number; keepLastPerKey?: ToolMemoryKey<T> },
): number {
  const protectBytes = opts?.protectBytes ?? PRUNE_PROTECT_BYTES;
  const minimumBytes = opts?.minimumBytes ?? PRUNE_MINIMUM_BYTES;
  const keyOf = opts?.keepLastPerKey;

  let remainingProtect = protectBytes;
  let reclaimable = 0;
  const toPrune: number[] = [];
  /** Clés dont on a déjà croisé le résultat le plus récent (on remonte le temps). */
  const seenKeys = new Set<string>();

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "tool") continue;
    if (typeof m.content !== "string") {
      // Résultat MULTIPART (une pièce jointe image, MIN-111) : on ne le remplace
      // pas par un marqueur texte — ce serait retirer l'image au modèle qui vient
      // de la demander. Il consomme quand même la fenêtre protégée (au proxy de
      // `contentChars`, pas aux octets de la base64) ; c'est `capHistoryImages`
      // qui borne son accumulation.
      remainingProtect -= contentChars(m.content);
      markSeen(keyOf?.(m, i), seenKeys);
      continue;
    }
    if (m.content === PRUNE_STUB) continue; // déjà élagué
    const size = m.content.length;
    if (remainingProtect > 0) {
      remainingProtect -= size; // dans la fenêtre protégée récente
      // Même dans la fenêtre : la clé est vue, donc les lectures PLUS ANCIENNES du
      // même fichier s'élaguent normalement. On garde une lecture par clé, pas une
      // de plus.
      markSeen(keyOf?.(m, i), seenKeys);
      continue;
    }
    const key = keyOf?.(m, i) ?? null;
    if (key !== null && !seenKeys.has(key)) {
      seenKeys.add(key); // dernière lecture de ce chemin : elle reste
      continue;
    }
    reclaimable += size;
    toPrune.push(i);
  }

  if (reclaimable < minimumBytes) return 0;
  for (const i of toPrune) {
    messages[i] = { ...messages[i], content: PRUNE_STUB };
  }
  return reclaimable;
}

function markSeen(key: string | null | undefined, seen: Set<string>): void {
  if (key) seen.add(key);
}
