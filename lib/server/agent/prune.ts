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

/** Octets de sortie de tools (les plus récents) protégés de l'élagage. */
export const PRUNE_PROTECT_BYTES = 40_000;
/** On n'élague que si l'on récupère au moins autant (évite le churn). */
export const PRUNE_MINIMUM_BYTES = 20_000;
/** Marqueur qui remplace une sortie de tool élaguée. */
export const PRUNE_STUB =
  "[Tool output elided to save context. Re-read the file or re-run the search if you still need it.]";

/** Forme minimale d'un message manipulé (compatible AgentChatMessage). */
interface PrunableMessage {
  role: string;
  content?: string | null;
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
    if (m.role !== "tool" || typeof m.content !== "string") continue;
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
