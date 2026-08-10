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

const PageDetails = Details.extend({
  addStorage() {
    return { ...this.parent?.(), markdown: detailsMarkdown };
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
  descriptionKey: "blockDetailsHint",
  slash: {
    group: "advanced",
    order: 3,
    keywords: ["details", "dépliant", "depliant", "toggle", "collapse", "accordion", "fold"],
  },
  turnInto: (editor) => editor.chain().focus().setDetails().run(),
  isActive: (editor) => editor.isActive("details"),
  markdown: {
    sample: "<details>\n<summary>A summary</summary>\n\nHidden text\n\n</details>",
  },
};
