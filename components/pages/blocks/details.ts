import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details";
import { ChevronRight } from "lucide-react";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

/**
 * Le dépliant — un bloc, TROIS nœuds (`details` > `detailsSummary` +
 * `detailsContent`). C'est le cas qui justifie que la sérialisation puisse vivre
 * dans le fichier du bloc plutôt que sur le descripteur : le registre ne sait
 * greffer un `toMarkdown` que sur le nœud nommé, et il en faut trois ici. Le
 * descripteur ne déclare donc que son `sample`, et c'est lui qui tient le
 * contrat — il traverse un vrai éditeur dans lib/pages-blocks.test.ts.
 *
 * **Markdown n'a pas de dépliant.** Aucune syntaxe, ni CommonMark ni GFM. Le
 * seul repliable que GitHub, Notion et Obsidian rendent tous les trois est le
 * `<details>` HTML — c'est donc lui la projection, et c'est ce que Numo lira.
 * (D'où `html: true` sur l'extension Markdown de l'éditeur de page.)
 */

const detailsMarkdown = {
  serialize(state: MarkdownState, node: MarkdownNode) {
    state.write("<details>\n");
    state.renderContent(node);
    state.write("</details>");
    state.closeBlock(node);
  },
  parse: {},
};

/**
 * Le résumé s'écrit DANS une balise — et ce qu'on y pose est déjà ÉCHAPPÉ, sans
 * qu'une ligne de ce fichier s'en charge (vérifié en MIN-350, et écrit ici parce
 * que la lecture du code dit exactement le contraire).
 *
 * C'est tiptap-markdown qui le fait, sur TOUT nœud texte du document et pas
 * seulement ici : son sérialiseur de texte passe par `escapeHTML`
 * (`tiptap-markdown/src/extensions/nodes/text.js`), qui remplace `<` et `>` par
 * leurs entités. Un résumé « A <b> x » sort donc en `A &lt;b&gt; x`, et la
 * lecture le redécode en texte — la balise ne se referme pas, l'aller-retour
 * revient identique, et `lib/pages-markdown.test.ts` le tient.
 *
 * La perte assumée qui reste, minuscule et de la même famille que les autres :
 * un résumé dont le texte est littéralement `&lt;` revient en `<`. Rien ne
 * distingue les deux dans la projection, ici pas plus qu'ailleurs — c'est le
 * prix de `html: true`, qui est le prix du dépliant.
 */
const summaryMarkdown = {
  serialize(state: MarkdownState, node: MarkdownNode) {
    state.write("<summary>");
    state.renderInline(node);
    state.write("</summary>");
    state.closeBlock(node);
  },
  parse: {},
};

const contentMarkdown = {
  // Le corps s'écrit nu : ce qui est replié reste du markdown ordinaire, donc
  // lisible et modifiable par Numo sans connaître le dépliant.
  serialize(state: MarkdownState, node: MarkdownNode) {
    state.renderContent(node);
  },
  parse: {},
};

/**
 * Les deux libellés du bouton de repli, posés par l'éditeur au montage.
 *
 * Le registre de blocs n'a pas de traducteur — il est monté headless par la
 * projection markdown et par les outils MCP, où aucun libellé n'a de sens. Les
 * valeurs par défaut ne sont donc là que pour ces surfaces-là ; dès qu'un
 * navigateur est en jeu, components/pages/page-editor.tsx appelle
 * `setDetailsLabels` avec les chaînes du catalogue.
 */
const labels = { expand: "Expand", collapse: "Collapse" };

export function setDetailsLabels(next: {
  expand: string;
  collapse: string;
}): void {
  labels.expand = next.expand;
  labels.collapse = next.collapse;
}

/** Le chevron du bouton, en SVG inline — même tracé que `ChevronRight`. */
const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

const PageDetails = Details.extend({
  addStorage() {
    return { ...this.parent?.(), markdown: detailsMarkdown };
  },
}).configure({
  /**
   * `persist` : l'état plié / déplié entre dans le DOCUMENT.
   *
   * Sans lui, tiptap ne garde l'ouverture que dans la classe CSS du node view —
   * toute la page rouvre donc repliée au rechargement, y compris les dépliants
   * qu'on venait d'ouvrir. Un dépliant est un choix de rédaction (« ceci est
   * secondaire »), pas un état d'affichage : il se range avec le texte.
   */
  persist: true,
  /**
   * Le bouton que rend tiptap est VIDE — pas d'icône, pas de dimension, aucun
   * style. Laissé tel quel, le dépliant n'a rien de cliquable à l'écran : on
   * voit deux paragraphes empilés, dont l'un disparaît parfois. C'est ici qu'on
   * lui donne son chevron, et dans app/globals.css qu'il prend sa place.
   */
  renderToggleButton: ({ element, isOpen }: { element: HTMLElement; isOpen: boolean }) => {
    element.className = "page-details-toggle";
    element.setAttribute("aria-expanded", String(isOpen));
    element.setAttribute("aria-label", isOpen ? labels.collapse : labels.expand);
    element.setAttribute("title", isOpen ? labels.collapse : labels.expand);
    if (!element.firstChild) element.innerHTML = CHEVRON;
  },
});

const PageDetailsSummary = DetailsSummary.extend({
  addStorage() {
    return { ...this.parent?.(), markdown: summaryMarkdown };
  },
});

const PageDetailsContent = DetailsContent.extend({
  addStorage() {
    return { ...this.parent?.(), markdown: contentMarkdown };
  },
});

export const detailsBlock: PageBlock = {
  id: "details",
  nodeName: "details",
  extensions: [PageDetails, PageDetailsSummary, PageDetailsContent],
  icon: ChevronRight,
  labelKey: "blockDetails",
  slash: {
    group: "advanced",
    order: 3,
    keywords: ["details", "dépliant", "depliant", "toggle", "collapse", "accordion", "fold"],
  },
  turnInto: (editor) => editor.chain().focus().setDetails().run(),
  isActive: (editor) => editor.isActive("details"),
  shortcut: { keys: "Mod-Alt-D", display: "⌘⌥D" },
  markdown: {
    sample: "<details>\n<summary>A summary</summary>\n\nHidden text\n\n</details>",
  },
};
