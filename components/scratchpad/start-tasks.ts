import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { isQuestionHeading, type PlanTaskState } from "@/lib/plan";
import type { ScratchpadTaskLine } from "@/lib/scratchpad";

/** Rang (1–3) d'un nœud titre. */
export const nodeRank = (node: { attrs: { level?: unknown } }): number =>
  Math.min(6, Math.max(1, Number(node.attrs.level) || 1));

/**
 * Le texte PROPRE d'une tâche : celui de son premier paragraphe, pas celui de
 * tout ce qu'elle porte.
 *
 * `node.textContent` d'un `taskItem` concatène ses descendants — texte de la
 * tâche ET de ses sous-tâches, collés sans séparateur. C'est ce qui sortait du
 * carnet quand on copiait une tâche à enfants : une seule ligne, « relancer le
 * croncheck les logsprévenir Marc ».
 */
export function taskOwnText(node: PMNode): string {
  const first = node.firstChild;
  return (first?.isTextblock ? first.textContent : node.textContent).trim();
}

/**
 * Une tâche et TOUT ce qu'elle porte, à plat et en profondeur (racine à 0).
 *
 * La règle de la hiérarchie : le parent emporte ses enfants, l'enfant n'emporte
 * pas son parent. Le nombre de niveaux n'est pas borné — une sous-tâche de
 * sous-tâche est une sous-tâche.
 *
 * `map` sert à sortir la tâche dans son état d'APRÈS le geste : une passation
 * démarre le travail, et le markdown copié doit dire « en cours » ce que le
 * carnet dit déjà « en cours ».
 */
export function taskItemLines(
  node: PMNode,
  map?: (state: PlanTaskState) => PlanTaskState
): ScratchpadTaskLine[] {
  const lines: ScratchpadTaskLine[] = [];
  const push = (item: PMNode, depth: number) => {
    const state = (item.attrs.state ?? "pending") as PlanTaskState;
    lines.push({ depth, state: map ? map(state) : state, text: taskOwnText(item) });
    item.forEach((child) => {
      if (child.type.name !== "taskList") return;
      child.forEach((sub) => {
        if (sub.type.name === "taskItem") push(sub, depth + 1);
      });
    });
  };
  push(node, 0);
  return lines;
}

/**
 * Passe « en cours » toutes les tâches PAS ENCORE COMMENCÉES de l'intervalle
 * [from, to) — sous-tâches comprises, à tous les niveaux. C'est le pendant, à
 * l'échelle d'une tâche, d'une section ou du carnet entier, de ce que dit la
 * règle : confier du travail à un agent, c'est le commencer, et confier un
 * parent, c'est confier ce qu'il porte.
 *
 * Une tâche déjà en cours, cochée ou annulée ne bouge pas, et les cases d'une
 * section « Questions » non plus — ce sont des questions, pas du travail (même
 * règle que `parsePlan`, que suivent déjà le compteur et l'aperçu de l'accueil).
 *
 * Tout part en UNE transaction : un seul Ctrl-Z remet l'ensemble, et l'autosave
 * ne voit qu'une modification. Retourne le nombre de tâches déplacées.
 */
export function startPendingTasks(
  editor: Editor,
  from: number,
  to: number
): number {
  const { state } = editor;
  const tr = state.tr;
  let moved = 0;
  // Le balayage part du DÉBUT du document, pas de `from` : l'intervalle visé
  // peut commencer à l'intérieur d'une section « Questions » ouverte plus haut.
  let questionRank: number | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const rank = nodeRank(node);
      if (questionRank !== null && rank <= questionRank) questionRank = null;
      if (isQuestionHeading(node.textContent)) questionRank = rank;
      return false;
    }
    if (node.type.name !== "taskItem") return true;
    if (questionRank !== null || pos < from || pos >= to) return true;
    // Changer un attribut ne change pas la taille du nœud, donc les positions
    // déjà relevées restent valides d'un pas à l'autre — y compris celles des
    // sous-tâches, dans lesquelles on continue de descendre.
    if (node.attrs.state === "pending") {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, state: "in_progress" });
      moved += 1;
    }
    return true;
  });
  if (moved > 0) editor.view.dispatch(tr);
  return moved;
}
