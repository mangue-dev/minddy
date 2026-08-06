/**
 * Durcissement du contexte de l'agent de code (MIN-46) : élagage des sorties de
 * tools périmées. Inspiré du `prune` d'opencode.
 *
 * Sur un run long, les plus gros consommateurs de contexte sont les résultats de
 * `read_file`/`grep`/`list_dir`/`glob` lus il y a de nombreux tours : volumineux
 * et périmés (l'agent a déjà agi dessus). On protège les DERNIERS ~40 Ko de sortie
 * de tools (contexte récent, encore utile) et on remplace les plus anciens par un
 * marqueur — MAIS seulement si l'on récupère au moins ~20 Ko (sinon on ne touche à
 * rien : pas de churn sur les petits runs). Logique PURE, testable ; appelée à la
 * frontière de round dans agent-loop.ts. Élaguer réduit le coût par appel ET la
 * taille du checkpoint (l'historique EST le checkpoint).
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

/** Octets de sortie de tools (les plus récents) protégés de l'élagage. */
export const PRUNE_PROTECT_BYTES = 40_000;
/** On n'élague que si l'on récupère au moins autant (évite le churn). */
export const PRUNE_MINIMUM_BYTES = 20_000;
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
 */
export function pruneToolOutputs<T extends PrunableMessage>(
  messages: T[],
  opts?: { protectBytes?: number; minimumBytes?: number },
): number {
  const protectBytes = opts?.protectBytes ?? PRUNE_PROTECT_BYTES;
  const minimumBytes = opts?.minimumBytes ?? PRUNE_MINIMUM_BYTES;

  let remainingProtect = protectBytes;
  let reclaimable = 0;
  const toPrune: number[] = [];

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
      continue;
    }
    if (m.content === PRUNE_STUB) continue; // déjà élagué
    const size = m.content.length;
    if (remainingProtect > 0) {
      remainingProtect -= size; // dans la fenêtre protégée récente
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
