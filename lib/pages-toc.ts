import type { Node } from "@tiptap/pm/model";

/**
 * Ce que la table des matières flottante lit d'un document
 * (components/pages/page-toc.tsx) — et rien d'autre : ni React, ni DOM, ni
 * navigateur, pour que la lecture des titres se teste seule.
 *
 * La source est l'ÉTAT ProseMirror et pas le DOM rendu. Deux conséquences qui
 * valent d'être dites : la table suit la frappe sans qu'on observe quoi que ce
 * soit, et elle ne peut pas décrire une page que le document ne contient plus.
 */
export interface TocEntry {
  /** La position ProseMirror du titre — son identité ET son ancre DOM. */
  pos: number;
  /** 1, 2 ou 3 : le registre des blocs n'en propose pas d'autres. */
  level: number;
  text: string;
}

/**
 * Les titres du document, dans l'ordre de lecture.
 *
 * Un titre VIDE n'en est pas un : on en croise un dès qu'on tape « ## » et
 * qu'on s'arrête pour réfléchir, et une entrée sans texte est une ligne muette
 * dans la table — au mieux inutile, au pire une place qui bouge sous le
 * curseur pendant qu'on écrit.
 *
 * Les titres imbriqués (dans un dépliant, par exemple) comptent : ils
 * structurent la page comme les autres, et les sauter ferait une table qui
 * saute des sections sans jamais dire pourquoi.
 */
export function readHeadings(doc: Node): TocEntry[] {
  const entries: TocEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    const text = node.textContent.trim();
    if (text) {
      entries.push({ pos, level: (node.attrs.level as number) || 1, text });
    }
    // Un titre n'en contient pas d'autre : inutile d'y descendre.
    return false;
  });
  return entries;
}

/**
 * Deux tables portent-elles la même chose ?
 *
 * La lecture est refaite à CHAQUE frappe : sans cette comparaison, taper une
 * lettre dans un paragraphe re-rendrait la table entière, avec ses transitions
 * de largeur, pour un contenu identique.
 */
export function sameHeadings(a: TocEntry[], b: TocEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, i) =>
        entry.pos === b[i].pos &&
        entry.level === b[i].level &&
        entry.text === b[i].text
    )
  );
}
