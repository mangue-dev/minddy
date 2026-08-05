import { Extension, textInputRule } from "@tiptap/core";

/**
 * « -> » devient « → » sous les doigts, comme dans Notion.
 *
 * C'est une règle de SAISIE, pas un rendu : le caractère écrit dans le document
 * — et donc dans le markdown enregistré — est la vraie flèche. Rien à
 * réinterpréter à la relecture, et le texte copié ailleurs part avec sa flèche.
 *
 * Les deux règles se déclenchent sur le MÊME caractère, le « > » final, et c'est
 * ce qui les rend prévisibles : chacune remonte de là jusqu'au début de la
 * flèche, tirets et « < » compris. `-->` donne donc une seule flèche et non
 * « -→ », et `<->` donne « ↔ » et non « <→ ». Une règle qui se déclencherait sur
 * un caractère non final — un « <- » seul, sans rien qui le ferme — couperait
 * l'herbe sous le pied des deux autres : elle n'existe pas, et « <- » reste donc
 * tel quel.
 *
 * Ce que les règles ne touchent pas, et c'est voulu : les blocs de code et le
 * code en ligne, que le moteur de règles de tiptap écarte lui-même (le `a -> b`
 * d'un exemple de code reste du code). Et une substitution dont on ne voulait
 * pas s'annule d'un Retour arrière, qui rend les caractères tapés.
 *
 * Posée sur les deux surfaces de texte riche — le carnet de tâches et
 * <MarkdownEditor> (description d'un ticket, d'un objectif, d'un retour), donc
 * la modale de création comprise.
 */
export const Arrows = Extension.create({
  name: "arrows",

  addInputRules() {
    return [
      // Avant la flèche simple : « <-> » est bien une double flèche, pas un
      // « < » suivi d'une flèche.
      textInputRule({ find: /<-{1,2}>$/, replace: "↔" }),
      textInputRule({ find: /-{1,2}>$/, replace: "→" }),
    ];
  },
});
