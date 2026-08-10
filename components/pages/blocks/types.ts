// Le DESCRIPTEUR d'un bloc de page : l'objet qui déclare, en un seul endroit,
// les six choses qu'un bloc est réellement.
//
// Un bloc n'est pas un nœud tiptap. C'est le nœud, PLUS son entrée dans le menu
// « / », PLUS son entrée dans « transformer en », PLUS son icône, PLUS ses
// libellés FR/EN, PLUS sa sérialisation markdown dans les deux sens. Tiptap rend
// le nœud modulaire et ne dit rien des cinq autres : si elles vivent dans six
// fichiers, ajouter un bloc tableau dans six mois voudra dire six éditions, et
// un oubli — un bloc insérable mais absent de « transformer en », traduit d'un
// seul côté, ou perdu à l'aller-retour markdown.
//
// D'où la règle du dossier : UN FICHIER PAR BLOC, qui exporte un `PageBlock`, et
// un registre unique (./index.ts) que le menu « / », le menu ⋯ et le sérialiseur
// parcourent tous les trois. Aucun consommateur n'importe un bloc nommément.
//
// Ce que le compilateur tient déjà, sans test : un descripteur auquel il manque
// un champ ne compile pas, et `labelKey` / `descriptionKey` sont typés
// `MessageKey<"Pages">` — une clé i18n absente du catalogue anglais est une
// erreur de type, pas un `Pages.slashTableau` affiché à l'écran.
// Ce qu'il ne tient pas, et que lib/pages-blocks.test.ts tient : la présence de
// la clé dans le catalogue FRANÇAIS, et le fait que le markdown du bloc revienne
// intact d'un aller-retour.

import type { Editor, Extensions, Range } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n-keys";

/** L'identité d'un bloc dans le CATALOGUE — pas le nom de son nœud tiptap :
    les trois titres sont trois blocs pour un seul nœud `heading`. */
export type PageBlockId =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "codeBlock"
  | "divider"
  | "details"
  | "subpage";

/** Les sections du menu « / », dans cet ordre. */
export type SlashGroup = "basic" | "lists" | "advanced";

/* ── Markdown ─────────────────────────────────────────────────────────── */

/** Le minimum de l'état de sérialisation de prosemirror-markdown qu'un bloc
    touche. Le paquet ne publie pas ses types côté tiptap-markdown ; on déclare
    donc ce qu'on utilise plutôt que de tout passer en `any`. */
export interface MarkdownState {
  write(text: string): void;
  text(text: string, escape?: boolean): void;
  ensureNewLine(): void;
  renderContent(node: MarkdownNode): void;
  renderInline(node: MarkdownNode): void;
  renderList(
    node: MarkdownNode,
    delim: string,
    firstDelim: (index: number) => string
  ): void;
  closeBlock(node: MarkdownNode): void;
  wrapBlock(
    delim: string,
    firstDelim: string | null,
    node: MarkdownNode,
    fn: () => void
  ): void;
}

/** Le minimum du nœud ProseMirror qu'un sérialiseur de bloc touche. */
export interface MarkdownNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  textContent: string;
  childCount: number;
  child(index: number): MarkdownNode;
}

export interface PageBlockMarkdown {
  /**
   * Ce que ce bloc écrit en markdown — un exemple MINIMAL et complet.
   *
   * Ce n'est pas de la documentation : c'est la fixture que
   * lib/pages-blocks.test.ts relit dans un vrai éditeur, resérialise, et exige
   * identique. Un bloc dont la sérialisation part d'un côté seulement fait
   * tomber ce test, pas un aller-retour découvert six mois plus tard sur une
   * vraie page.
   */
  sample: string;

  /**
   * Sérialisation propre au bloc (sens ÉCRITURE). Le registre la greffe sur le
   * nœud, dans son `storage.markdown` — c'est là que tiptap-markdown la lit.
   *
   * Absente = le nœud sait déjà le faire : soit tiptap-markdown fournit la
   * règle (les nœuds standards), soit le nœud la porte lui-même (les tâches du
   * carnet, cf. components/scratchpad/task-nodes.ts). Le `sample` est ce qui
   * le prouve, dans les deux cas.
   */
  toMarkdown?: (state: MarkdownState, node: MarkdownNode) => void;

  /**
   * Lecture : la règle markdown-it qui rend ce bloc depuis du markdown, quand
   * markdown-it ne la connaît pas. Reçoit l'instance markdown-it de
   * tiptap-markdown (typée `unknown` : ses types sont ceux d'une dépendance
   * transitive, cf. components/scratchpad/task-markdown.ts).
   *
   * Deux pièges, vérifiés tous les deux en écrivant un bloc bidon :
   *
   * - le chemin de lecture est markdown-it → **HTML** → `parseHTML` du nœud. Une
   *   règle qui pose des attributs sur un `paragraph_open` ne donne rien : ils
   *   n'arrivent pas jusqu'au HTML. Émettre un token `html_block`, comme le fait
   *   blocks/subpage.ts ;
   * - ce HTML doit porter une balise que **personne d'autre ne réclame**. Un
   *   `<p data-type="…">` est happé par la règle `p` du paragraphe, qui en jette
   *   les attributs au passage — le bloc se relit alors en paragraphe, sans un
   *   mot d'erreur. Un `<div data-type="…">` passe.
   */
  fromMarkdown?: (markdownit: unknown) => void;
}

/* ── Le descripteur ───────────────────────────────────────────────────── */

export interface PageBlock {
  /** Identité dans le catalogue. Unique sur tout le registre. */
  id: PageBlockId;

  /** Le nom du NŒUD tiptap sous ce bloc (`"heading"` pour les trois titres). */
  nodeName: string;

  /**
   * Les extensions tiptap que ce bloc apporte. Vide quand un autre bloc du même
   * nœud les apporte déjà — le titre 1 monte `Heading`, les titres 2 et 3 se
   * greffent dessus. Le registre dédoublonne par nom d'extension et le test
   * structurel vérifie qu'aucun nœud du catalogue n'est orphelin.
   */
  extensions: Extensions;

  icon: LucideIcon;
  labelKey: MessageKey<"Pages">;
  descriptionKey: MessageKey<"Pages">;

  /** Le menu « / » : où le bloc apparaît, et sur quoi il se cherche. Les
      aliases portent les DEUX langues — c'est une saisie, pas un affichage. */
  slash: { group: SlashGroup; order: number; keywords: string[] };

  /**
   * Convertir la sélection courante VERS ce bloc — le menu « transformer en ».
   * `false` quand ça n'a pas de sens : une sous-page ne se transforme pas
   * depuis un paragraphe, elle s'insère.
   */
  turnInto: ((editor: Editor) => boolean) | false;

  /**
   * Poser le bloc à la place de la saisie « /… ». Facultatif : sans lui, le
   * registre le déduit de `turnInto` (effacer la plage, puis convertir), ce qui
   * couvre tous les blocs qui sont une transformation du paragraphe courant.
   */
  insert?: (editor: Editor, range: Range) => void;

  /** Est-ce CE bloc qui porte la sélection ? Sert à cocher l'entrée courante de
      « transformer en » — d'où le besoin d'un test par bloc et pas par nœud :
      `heading` est actif pour les trois titres, `heading1` pour un seul. */
  isActive: (editor: Editor) => boolean;

  /**
   * Le raccourci de CONVERSION vers ce bloc. Déclaré ICI et nulle part ailleurs :
   * le registre en fait la liaison clavier (`PageBlockShortcuts`) ET le libellé
   * affiché à droite de l'entrée « transformer en ». Un raccourci qu'on lirait
   * dans le menu sans qu'il fonctionne, ou l'inverse, n'est donc pas
   * représentable.
   *
   * Les combinaisons reprennent celles du carnet et des extensions tiptap —
   * `⌘⌥1..3` pour les titres, `⌘⇧7/8/9` pour les listes : un utilisateur qui
   * passe d'une note à une page ne réapprend rien. Le registre les REDÉCLARE
   * plutôt que de laisser faire chaque extension, pour leur donner à toutes la
   * même sémantique de bascule (le raccourci du bloc actif ramène au paragraphe).
   */
  shortcut?: {
    /** La combinaison en notation ProseMirror (`Mod-Alt-1`). */
    keys: string;
    /** Ce que le menu AFFICHE (`⌘⌥1`). */
    display: string;
  };

  markdown: PageBlockMarkdown;
}
