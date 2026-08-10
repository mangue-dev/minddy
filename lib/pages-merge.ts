/**
 * La FUSION PAR BLOC d'un document de page (MIN-271) — logique pure, aucune IO.
 *
 * Une page est partagée par tout le projet, et deux personnes peuvent l'ouvrir
 * en même temps. Le garde-fou est un compteur : chaque écriture du corps envoie
 * la `version` sur laquelle elle s'appuie, et le serveur refuse (409) si elle a
 * bougé. Reste à savoir quoi faire du refus — et c'est tout ce module.
 *
 * Le document est un ARBRE, pas une liste de lignes : on ne fusionne donc pas
 * « le bloc B » isolément, on fusionne le document entier en comparant les
 * blocs de PREMIER NIVEAU par leur `blockId` (posé par `UniqueID`, MIN-267).
 * C'est la granularité que l'utilisateur perçoit — un paragraphe, un titre, une
 * liste — et la seule qui survive au glisser-déposer : déplacer un bloc réécrit
 * deux endroits de l'arbre à la fois, ce qu'aucune sauvegarde « par bloc » au
 * sens littéral ne saurait représenter.
 *
 * Trois documents entrent :
 *   `base`   — celui sur lequel je me suis appuyé (ma dernière synchro) ;
 *   `mine`   — ce que j'ai à l'écran ;
 *   `theirs` — ce que le serveur porte maintenant.
 *
 * Et la règle tient en une phrase : **le distant gagne, jamais en silence.**
 * Un bloc que je suis seul à avoir touché est repris tel quel (fusion muette,
 * c'est le cas courant : B chez moi, C chez l'autre). Un bloc que nous avons
 * touché tous les deux garde la version DISTANTE dans le document, et la mienne
 * ressort dans `conflicts` — l'appelant la propose en restauration
 * (`applyRestore`). Choisir la mienne en silence effacerait le travail de
 * l'autre, ce que cette feature existe précisément pour empêcher.
 *
 * Ce que ce module ne fait PAS : fusionner l'INTÉRIEUR d'un bloc. Deux
 * personnes qui tapent dans le même paragraphe à la même seconde relèvent du
 * caractère par caractère, donc de `prosemirror-collab` — hors v1. C'est
 * justement ce cas-là qui devient un conflit signalé.
 */

import { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks";

/** Un nœud ProseMirror en JSON, vu de l'extérieur. */
export interface PageNodeJSON {
  type?: string;
  attrs?: Record<string, unknown> | null;
  content?: PageNodeJSON[];
  [key: string]: unknown;
}

/** Le document, tel qu'il est stocké dans `pages.content`. */
export interface PageDocJSON extends PageNodeJSON {
  type?: string;
  content?: PageNodeJSON[];
}

/**
 * Un bloc que les deux côtés ont touché.
 *
 * `mine` est ce que J'AVAIS — le contenu offert en restauration —, `null`
 * quand mon geste était une suppression. `theirs` est ce qui a été retenu dans
 * le document fusionné, `null` quand c'est une suppression distante qui a
 * gagné.
 */
export interface PageBlockConflict {
  id: string;
  mine: PageNodeJSON | null;
  theirs: PageNodeJSON | null;
}

export interface PageMergeResult {
  /** Le document à adopter. Toujours défini, même en présence de conflits. */
  doc: PageDocJSON;
  /** Les blocs contestés, dans l'ordre du document. Vide = fusion muette. */
  conflicts: PageBlockConflict[];
  /**
   * La fusion apporte-t-elle quelque chose que le serveur n'a pas ? C'est ce
   * qui décide du REJEU : sans ça, un conflit où je n'ai rien à sauver
   * relancerait une écriture identique à ce qui est déjà en base.
   */
  changed: boolean;
}

/* ─── Lecture du document ──────────────────────────────────────────────────── */

/**
 * Les blocs de premier niveau, chacun avec sa CLÉ.
 *
 * La clé est le `blockId` quand il y en a un. Un bloc qui n'en porte pas —
 * document écrit avant MIN-267, ou collé depuis une source qui n'en pose pas —
 * prend une clé de position (`@3`). Elle vaut ce qu'elle vaut : deux documents
 * dont les blocs anonymes ont bougé ne se compareront pas finement. C'est
 * préférable à les laisser sans clé du tout, ce qui les ferait tous se
 * confondre et disparaître à la première fusion.
 */
function blockKey(node: PageNodeJSON, index: number): string {
  const id = node.attrs?.[BLOCK_ID_ATTRIBUTE];
  return typeof id === "string" && id.length > 0 ? id : `@${index}`;
}

function topLevel(doc: PageDocJSON | null | undefined): PageNodeJSON[] {
  return Array.isArray(doc?.content) ? doc.content : [];
}

interface Indexed {
  keys: string[];
  byKey: Map<string, PageNodeJSON>;
}

function indexBlocks(doc: PageDocJSON | null | undefined): Indexed {
  const keys: string[] = [];
  const byKey = new Map<string, PageNodeJSON>();
  topLevel(doc).forEach((node, index) => {
    let key = blockKey(node, index);
    // Un id dupliqué (copier-coller d'un bloc dans un client qui n'a pas
    // regénéré son id) rendrait la map ambiguë : le second prend une clé de
    // position, ce qui le traite comme un bloc anonyme plutôt que comme le
    // jumeau du premier.
    if (byKey.has(key)) key = `@${index}`;
    keys.push(key);
    byKey.set(key, node);
  });
  return { keys, byKey };
}

/** Égalité structurelle. Les documents viennent du même sérialiseur, mais
    l'ordre des clés d'un objet JSON n'est garanti par personne. */
export function sameNode(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => sameNode(item, b[i]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameNode(left[key], right[key])) return false;
  }
  return true;
}

/* ─── La fusion ────────────────────────────────────────────────────────────── */

/** Le sort d'un bloc, une fois les deux côtés lus. */
interface Decision {
  /** Le nœud retenu, `null` quand le bloc quitte le document. */
  node: PageNodeJSON | null;
  conflict: PageBlockConflict | null;
}

function decide(
  key: string,
  base: PageNodeJSON | undefined,
  mine: PageNodeJSON | undefined,
  theirs: PageNodeJSON | undefined
): Decision {
  const inBase = base !== undefined;

  if (mine !== undefined && theirs !== undefined) {
    if (sameNode(mine, theirs)) return { node: theirs, conflict: null };
    const mineChanged = !inBase || !sameNode(mine, base);
    const theirsChanged = !inBase || !sameNode(theirs, base);
    if (mineChanged && !theirsChanged) return { node: mine, conflict: null };
    if (!mineChanged && theirsChanged) return { node: theirs, conflict: null };
    // Les deux ont écrit dans le même bloc : le distant reste, le mien est
    // offert. C'est LE cas que le CRDT aurait fusionné caractère par
    // caractère, et celui qu'on préfère signaler plutôt que trancher.
    return { node: theirs, conflict: { id: key, mine, theirs } };
  }

  if (mine !== undefined) {
    // Un bloc que j'ai AJOUTÉ (absent de la base) n'est en concurrence avec
    // rien : il entre dans le document fusionné.
    if (!inBase) return { node: mine, conflict: null };
    // Ils l'ont supprimé. Si je l'ai seulement laissé tel quel, la suppression
    // passe sans bruit ; si je l'avais modifié, elle gagne quand même — mais
    // pas en silence.
    const mineChanged = !sameNode(mine, base);
    return {
      node: null,
      conflict: mineChanged ? { id: key, mine, theirs: null } : null,
    };
  }

  if (theirs !== undefined) {
    if (!inBase) return { node: theirs, conflict: null };
    // Je l'ai supprimé. Ils l'ont modifié → leur version reste, et je le
    // découvre : `mine: null` dit que mon geste était une suppression, donc
    // que « restaurer la mienne » veut dire la retirer.
    const theirsChanged = !sameNode(theirs, base);
    return {
      node: theirs,
      conflict: theirsChanged ? { id: key, mine: null, theirs } : null,
    };
  }

  return { node: null, conflict: null };
}

/** L'ordre relatif des blocs communs a-t-il bougé entre deux versions ? */
function reordered(before: string[], after: string[]): boolean {
  const kept = new Set(after);
  const left = before.filter((key) => kept.has(key));
  const has = new Set(before);
  const right = after.filter((key) => has.has(key));
  return left.length !== right.length || left.some((key, i) => key !== right[i]);
}

/**
 * Fusionne mon document et celui du serveur, sur la base commune.
 *
 * L'ORDRE vient d'un seul côté : celui qui a réordonné. Un glisser-déposer
 * réécrit tout l'ordre de la fratrie, donc entrelacer deux ordres produirait
 * une suite que personne n'a voulue. Quand un seul des deux a bougé, sa suite
 * fait foi ; quand les deux ont bougé (ou aucun), c'est celle du serveur, et
 * les blocs que l'autre côté a ajoutés s'y glissent derrière leur voisin.
 */
export function mergeDocs(
  base: PageDocJSON | null | undefined,
  mine: PageDocJSON | null | undefined,
  theirs: PageDocJSON | null | undefined
): PageMergeResult {
  const server: PageDocJSON = theirs ?? { type: "doc", content: [] };

  // Rien à fusionner : je n'ai rien touché depuis ma base, ou j'ai déjà
  // exactement ce que le serveur porte.
  if (!mine || sameNode(mine, server)) {
    return { doc: server, conflicts: [], changed: false };
  }
  if (base && sameNode(mine, base)) {
    return { doc: server, conflicts: [], changed: false };
  }

  const b = indexBlocks(base);
  const m = indexBlocks(mine);
  const s = indexBlocks(server);

  const decisions = new Map<string, Decision>();
  for (const key of new Set([...b.keys, ...m.keys, ...s.keys])) {
    decisions.set(key, decide(key, b.byKey.get(key), m.byKey.get(key), s.byKey.get(key)));
  }

  // Qui a bougé l'ordre ? La question ne se pose que sur les blocs que la base
  // connaissait : un ajout n'est pas un déplacement.
  const mineMoved = base ? reordered(b.keys, m.keys) : false;
  const theirsMoved = base ? reordered(b.keys, s.keys) : false;
  const spineFromMine = mineMoved && !theirsMoved;
  const spine = spineFromMine ? m.keys : s.keys;
  const other = spineFromMine ? s.keys : m.keys;

  const kept = (key: string) => decisions.get(key)?.node != null;
  const order = spine.filter(kept);

  // Ce que l'autre côté a ajouté se glisse DERRIÈRE son voisin de gauche, celui
  // avec lequel il a été écrit. Ajouter en fin de document mettrait un
  // paragraphe inséré au milieu d'un chapitre tout en bas de la page.
  const placed = new Set(order);
  for (let i = 0; i < other.length; i += 1) {
    const key = other[i];
    if (placed.has(key) || !kept(key)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const anchor = order.indexOf(other[j]);
      if (anchor !== -1) {
        at = anchor + 1;
        break;
      }
    }
    order.splice(at, 0, key);
    placed.add(key);
  }

  const content = order.map((key) => decisions.get(key)!.node!);
  const conflicts: PageBlockConflict[] = [];
  for (const key of order) {
    const conflict = decisions.get(key)?.conflict;
    if (conflict) conflicts.push(conflict);
  }
  // Les blocs SORTIS du document peuvent eux aussi être contestés (ils m'ont
  // supprimé un bloc que j'avais modifié) : ils n'ont plus de place dans
  // l'ordre, mais ils ont toute leur place dans le bandeau.
  for (const [key, decision] of decisions) {
    if (decision.conflict && !placed.has(key)) conflicts.push(decision.conflict);
  }

  const doc: PageDocJSON = { ...server, content };
  return { doc, conflicts, changed: !sameNode(doc, server) };
}

/* ─── La restauration ──────────────────────────────────────────────────────── */

/**
 * Remet MA version d'un bloc contesté dans le document fusionné.
 *
 * C'est le geste du bandeau, et il est explicite par construction : la fusion
 * a retenu la version distante, l'utilisateur voit laquelle et décide. Un bloc
 * dont mon geste était une suppression sort du document ; un bloc que le
 * distant a supprimé revient à sa place d'origine, calculée sur le document
 * fusionné plutôt que sur un index figé — d'autres restaurations ont pu passer
 * avant.
 */
export function applyRestore(
  doc: PageDocJSON,
  conflict: PageBlockConflict,
  mineOrder: PageDocJSON | null | undefined
): PageDocJSON {
  const blocks = topLevel(doc);
  const at = blocks.findIndex((node, index) => blockKey(node, index) === conflict.id);

  if (conflict.mine === null) {
    if (at === -1) return doc;
    return { ...doc, content: [...blocks.slice(0, at), ...blocks.slice(at + 1)] };
  }

  if (at !== -1) {
    const content = [...blocks];
    content[at] = conflict.mine;
    return { ...doc, content };
  }

  // Le bloc n'est plus là : le distant l'avait supprimé. On le replace derrière
  // le voisin de gauche qu'il avait chez moi.
  const mineKeys = indexBlocks(mineOrder).keys;
  const position = mineKeys.indexOf(conflict.id);
  let insertAt = 0;
  for (let j = position - 1; j >= 0; j -= 1) {
    const anchor = blocks.findIndex(
      (node, index) => blockKey(node, index) === mineKeys[j]
    );
    if (anchor !== -1) {
      insertAt = anchor + 1;
      break;
    }
  }
  return {
    ...doc,
    content: [...blocks.slice(0, insertAt), conflict.mine, ...blocks.slice(insertAt)],
  };
}
