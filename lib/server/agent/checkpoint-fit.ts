import { capHistoryImages, pruneToolOutputs } from "./prune";
import type { AgentChatMessage } from "./agent-loop";
import type { AgentCheckpoint } from "./runs";

/**
 * Rabotage du checkpoint au gabarit (MIN-217). Module PUR, comme `prune.ts` et
 * `compact.ts` : `executeAgentRun` ne s'atteint qu'avec une microVM, une base et
 * un modèle, mais l'arithmétique de « qu'est-ce qu'on lâche, et dans quel ordre »
 * se teste toute seule.
 *
 * **Ce que ça répare.** Le garde-fou anti-runaway déclarait un checkpoint trop
 * gros, émettait `turnTooBig`… puis persistait le MÊME objet, tel quel, en
 * invitant l'utilisateur à ouvrir un nouveau tour — lequel le rehydratait et
 * rejouait exactement la même fin. Une impasse, pas un garde-fou.
 *
 * **Pourquoi rien ne convergeait tout seul.** Les deux hygiènes de la boucle
 * (`pruneToolOutputs`, `capHistoryImages`) et la compaction se décident en TOKENS
 * ESTIMÉS, jamais en octets — et les deux ne coïncident pas :
 *
 * - une image compte `IMAGE_PART_CHARS` (4 000 caractères, cf. `content.ts`) quel
 *   que soit son poids réel en base64, parce que c'est ce qu'elle coûte AU MODÈLE ;
 * - les `messages` d'une fille suspendue (`SubagentRecord`, jusqu'à
 *   `SUBAGENT_HISTORY_MAX_BYTES` = 1,5 Mo chacune) ne sont PAS dans `messages` :
 *   ni l'élagage ni la compaction ne les voit passer.
 *
 * Six filles suspendues font 9 Mo de checkpoint sans qu'un seul token de plus
 * n'entre dans la fenêtre du modèle. Le garde-fou se redéclenchait alors à chaque
 * tour, indéfiniment.
 *
 * **Le geste.** Trois paliers, du moins cher au plus cher, et on s'arrête au
 * premier qui tient. Les deux premiers ne perdent que du RE-DEMANDABLE (une fille
 * coupée a déjà livré son rapport partiel ; une image et une sortie de tool
 * laissent un marqueur qui dit comment les relire). Le troisième, lui, perd la
 * conversation — il se dit à l'utilisateur, code d'erreur à part.
 */

/** Taille max du checkpoint sérialisé. */
export const MAX_CHECKPOINT_BYTES = 8_000_000;

/** Ce qu'un palier a lâché — dans l'ordre où on l'a lâché. */
export type CheckpointDrop = "subagentHistories" | "images" | "toolOutputs" | "history";

export interface CheckpointFit {
  /** Le checkpoint à persister : celui d'entrée s'il tenait, sinon le raboté. */
  checkpoint: AgentCheckpoint;
  /** Taille sérialisée AVANT rabotage — c'est ELLE que le garde-fou juge. */
  bytes: number;
  /** Vide = rien n'a été touché. Contient `"history"` = la conversation est perdue. */
  dropped: CheckpointDrop[];
}

/**
 * Rend un checkpoint qui TIENT dans `max`, en lâchant par paliers.
 *
 * `bytes` est la taille d'ENTRÉE, pas celle de sortie : l'appelant s'en sert pour
 * décider si le tour a débordé (ce que le rabotage ne change pas — un tour dont
 * l'état a explosé reste un tour qu'on arrête), le rabotage ne servant qu'à ce que
 * le tour SUIVANT reparte de quelque chose de viable.
 */
export function fitCheckpoint(
  checkpoint: AgentCheckpoint,
  max: number = MAX_CHECKPOINT_BYTES,
): CheckpointFit {
  const bytes = JSON.stringify(checkpoint).length;
  if (bytes <= max) return { checkpoint, bytes, dropped: [] };

  const dropped: CheckpointDrop[] = [];

  /**
   * Palier 1 — les historiques des filles SUSPENDUES, de loin le plus gros poste
   * invisible à la compaction.
   *
   * Retirer `messages` d'un record suffit à le rendre honnête tout seul :
   * `isResumableSubagent` devient faux, donc `Subagents.restore` le reclasse en
   * `cut` + `delivered` (le rapport partiel est déjà parti dans les messages du
   * chunk précédent) et l'admission de chunk cesse de différer le réveil pour une
   * reprise qui n'aura pas lieu. Le record reste LISIBLE — `agent_status` et
   * `list_agents` répondent toujours.
   *
   * `parkedForSubagents` part avec : garer le parent en attente de filles qui ne
   * repartiront jamais lui ferait passer son chunk à attendre le vide.
   */
  const withoutSubagentHistories = stripSubagentHistories(checkpoint);
  if (withoutSubagentHistories) {
    dropped.push("subagentHistories");
    if (JSON.stringify(withoutSubagentHistories).length <= max) {
      return { checkpoint: withoutSubagentHistories, bytes, dropped };
    }
  }
  const afterSubagents = withoutSubagentHistories ?? checkpoint;

  /**
   * Palier 2 — l'hygiène de l'historique, poussée à fond. Les mêmes deux gestes
   * que la boucle applique à chaque frontière de round, mais SANS fenêtre
   * protégée : ici on n'optimise plus le contexte, on sauve la conversation.
   *
   * Les deux remplacent par un marqueur qui dit au modèle comment relire ce qu'on
   * vient de lui retirer — rien d'irrécupérable ne part sur ce palier.
   *
   * Copie SUPERFICIELLE : les deux helpers remplacent des éléments, ils ne mutent
   * pas les messages en place. `result.messages` de l'appelant reste intact.
   */
  const messages: AgentChatMessage[] = [...afterSubagents.messages];
  const elidedImages = capHistoryImages(messages, 0);
  if (elidedImages > 0) dropped.push("images");
  const reclaimed = pruneToolOutputs(messages, { protectBytes: 0, minimumBytes: 1 });
  if (reclaimed > 0) dropped.push("toolOutputs");
  if (elidedImages > 0 || reclaimed > 0) {
    const fitted: AgentCheckpoint = { ...afterSubagents, messages };
    if (JSON.stringify(fitted).length <= max) return { checkpoint: fitted, bytes, dropped };
  }

  /**
   * Palier 3 — le filet. On ne garde que l'état de RUN, et le tour suivant repart
   * à froid : `messages: []` reprend la branche d'amorce d'`execute.ts`, qui
   * rebâtit le prompt système et recharge le contexte du ticket ou de la PR.
   *
   * `instructions` est REMIS À ZÉRO, et c'est le piège de ce palier : il dit
   * « AGENTS.md déjà servi », or le message qui le portait vient de partir avec
   * l'historique. Le laisser passer, c'est un agent qui ne lira plus jamais les
   * consignes du dépôt sur cette session.
   *
   * Ce qui reste ne peut pas déborder : `lastFilesSha` est un sha, `usageSeq` et
   * `prInlineComments` des entiers, `editedPaths` est capé par
   * `CHECKPOINT_EDITED_PATHS_MAX`. C'est donc bien un plancher, pas un quatrième
   * palier déguisé.
   */
  dropped.push("history");
  return {
    checkpoint: {
      messages: [],
      ...(afterSubagents.usageSeq !== undefined ? { usageSeq: afterSubagents.usageSeq } : {}),
      ...(afterSubagents.lastFilesSha ? { lastFilesSha: afterSubagents.lastFilesSha } : {}),
      ...(afterSubagents.editedPaths?.length ? { editedPaths: afterSubagents.editedPaths } : {}),
      ...(afterSubagents.repoTouched ? { repoTouched: true } : {}),
      ...(afterSubagents.prInlineComments
        ? { prInlineComments: afterSubagents.prInlineComments }
        : {}),
    },
    bytes,
    dropped,
  };
}

/**
 * Le checkpoint sans les historiques de ses filles, ou `null` s'il n'en portait
 * aucun — l'appelant s'en sert pour savoir si le palier a servi à quelque chose.
 */
function stripSubagentHistories(checkpoint: AgentCheckpoint): AgentCheckpoint | null {
  const records = checkpoint.subagents ?? [];
  if (!records.some((r) => (r?.messages?.length ?? 0) > 0)) return null;
  const { parkedForSubagents: _parked, ...rest } = checkpoint;
  return {
    ...rest,
    subagents: records.map(({ messages: _messages, ...record }) => record),
  };
}
