import type { EmitAgentLive } from "./agent-loop";
import type { AgentLiveEdit } from "./exec-tool";
import { CHANGED_FILES_CAP } from "./repo-host";

/**
 * LES FICHIERS DU TOUR EN COURS, tenus pour le direct — la moitié provisoire du
 * couple dont `files_changed` (dérivé de git, en fin de tour) est l'autorité.
 *
 * PARTAGÉ PAR LES DEUX MOTEURS, et pas par élégance : la fonction
 * ([execute.ts](execute.ts)) et la microVM ([vm/turn.ts](vm/turn.ts)) doivent
 * raconter le même fil, et c'est exactement ce que la première version n'a pas
 * fait — le crochet n'existait que côté fonction, donc la feature ne marchait
 * sur aucun projet basculé en `loop_in_vm`, c'est-à-dire sur celui où on la
 * regardait. Un état à tenir en double se tient dans un module, pas par copie.
 *
 * Deux règles y vivent :
 *
 *  - **une `Map` par chemin** : un fichier édité six fois n'apparaît qu'une fois,
 *    et la dernière nouvelle l'emporte (écrit puis supprimé ⇒ supprimé) ;
 *  - **la liste part avec CHAQUE charge du direct**, pas seulement avec celle de
 *    l'édition. Une charge est un INSTANTANÉ complet du round, et le fil efface
 *    ce qu'une charge tait : émise à part, la liste disparaissait à la charge
 *    suivante.
 */
export interface LiveEditLog {
  /** Ce qu'un tool vient de toucher. */
  note(edits: AgentLiveEdit[]): void;
  /** Le relais est passé à la liste de git : on oublie. Rend `true` s'il y avait
   *  quelque chose à oublier — l'appelant n'a à rediffuser que dans ce cas. */
  clear(): boolean;
  /**
   * Ce qu'une charge de direct doit porter. Vide (aucune clé) quand rien n'a été
   * touché : le fil distingue « pas de fichiers » de « liste vide », et une clé
   * `files: []` en trop suffirait à faire passer un round au repos pour un signe
   * de vie.
   *
   * Bornée au même plafond que la liste autoritaire, et le même aveu : un tour
   * qui touche 200 fichiers ne doit pas en diffuser 200 quatre fois par seconde,
   * et une liste tronquée sans le dire se lit comme une liste complète.
   */
  payload(): { files?: AgentLiveEdit[]; filesTruncated?: boolean };
}

export function newLiveEditLog(): LiveEditLog {
  const edits = new Map<string, AgentLiveEdit>();
  return {
    note: (batch) => {
      for (const edit of batch) edits.set(edit.path, edit);
    },
    clear: () => {
      if (edits.size === 0) return false;
      edits.clear();
      return true;
    },
    payload: () => {
      if (edits.size === 0) return {};
      const all = [...edits.values()];
      const filesTruncated = all.length > CHANGED_FILES_CAP;
      return {
        files: filesTruncated ? all.slice(0, CHANGED_FILES_CAP) : all,
        filesTruncated,
      };
    },
  };
}

/**
 * Le crochet `onEdit` de l'exec-tool, tel que les DEUX moteurs le câblent : on
 * note, puis on rediffuse aussitôt — sans quoi le fil attendrait la prochaine
 * charge de texte, c'est-à-dire le prochain round.
 *
 * La charge est celle d'un round AU REPOS. Une édition ne fait pas avancer le
 * round (ni texte, ni réflexion, ni tool-call de plus) : annoncer `tools: 1`
 * mentirait sur un compteur que le fil lit pour décider si un texte est une
 * réponse ou de la narration.
 */
export function liveEditHook(
  log: LiveEditLog,
  emitLive: EmitAgentLive,
): (edits: AgentLiveEdit[]) => void {
  return (edits) => {
    log.note(edits);
    emitLive({ text: "", tools: 0, reasoningActive: false, reasoningMs: 0 });
  };
}
