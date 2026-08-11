// Le TITRE et le CORPS d'une page, cousus au clavier (MIN-270).
//
// Le titre n'est pas le premier bloc du document — c'est une colonne, et un
// `textarea` à part (cf. page-header.tsx). Le prix de ce choix se paie ici :
// pour qui écrit, les deux champs sont une seule surface, et le curseur doit
// pouvoir passer de l'un à l'autre comme il passe d'une ligne à la suivante.
//
// Trois gestes, et un seul sens à retenir — le titre est la ligne AU-DESSUS de
// la première ligne du corps :
//
//  - ⌫ au tout début du document remonte en fin de titre (rien à supprimer là
//    où on est, donc rien ne se perd) ;
//  - ↑ depuis la première ligne du corps fait de même ;
//  - ↓ depuis le titre redescend dans le corps (page-header.tsx).
//
// L'extension ne SAIT RIEN du titre : elle constate qu'on sort par le haut et
// le dit. C'est l'appelant qui rend le focus, parce que lui seul tient le champ.
//
// **Priorité 1, et c'est le cœur du fichier.** tiptap monte les keymaps dans
// l'ordre inverse de déclaration, puis les trie par priorité décroissante : à
// priorité égale, l'extension déclarée en DERNIER est consultée en PREMIER.
// Nos deux touches sont parmi les plus chargées de l'éditeur — ⌫ défait une
// règle de saisie, sort d'une liste, joint deux blocs ; ↑ traverse les vues de
// nœud. En passant devant, on aurait volé la touche à tout ce monde-là. Avec
// une priorité basse, on est consulté en dernier : on n'agit que si personne
// d'autre n'avait quelque chose à faire.

import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export interface TitleBridgeOptions {
  /**
   * Le curseur sort du document PAR LE HAUT. Rendre `true` pour dire que le
   * geste a été pris en charge — `null` (le défaut) laisse la touche suivre son
   * chemin habituel, ce qui est le comportement d'une surface sans titre.
   */
  onLeaveTop: (() => void) | null;
}

/**
 * Le curseur est-il collé au tout début du document ?
 *
 * `depth === 1` est la garde qui compte : un curseur au début du premier item
 * d'une liste, ou de la première ligne d'une citation, est à la position 3 ou
 * plus et n'est PAS « le début du document » — ⌫ doit l'y sortir de sa liste
 * avant de parler de quitter le corps.
 */
export function atDocumentStart(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  return $from.depth === 1 && $from.pos === 1;
}

/**
 * Le curseur est-il dans le PREMIER bloc de premier niveau ?
 *
 * La moitié pure de « suis-je sur la première ligne » — l'autre moitié
 * (`endOfTextblock`) mesure le rendu, et n'a de réponse que dans un navigateur.
 * Séparées parce qu'un bloc peut faire dix lignes à l'écran : être dans le
 * premier bloc ne suffit pas, et ne l'être pas suffit à répondre non.
 */
export function inFirstBlock(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if ($from.depth === 0) return false;
  return $from.before(1) === 0;
}

/** Le curseur est-il sur la première ligne visible du document ? */
export function onFirstLine(view: EditorView): boolean {
  if (!inFirstBlock(view.state)) return false;
  return view.endOfTextblock("up");
}

export const TitleBridge = Extension.create<TitleBridgeOptions>({
  name: "titleBridge",
  priority: 1,

  addOptions() {
    return { onLeaveTop: null };
  },

  addKeyboardShortcuts() {
    // Lu au moment de la frappe, et non capturé : l'option peut être posée
    // après le montage.
    const leave = () => {
      const go = this.options.onLeaveTop;
      if (!go) return false;
      go();
      return true;
    };

    return {
      Backspace: ({ editor }) => atDocumentStart(editor.state) && leave(),
      ArrowUp: ({ editor }) => onFirstLine(editor.view) && leave(),
    };
  },
});
