import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FileText } from "lucide-react";
import { SubpageView } from "@/components/pages/blocks/subpage-view";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

/**
 * Le bloc SOUS-PAGE : un nœud atomique qui ne porte QUE l'id de la page cible.
 *
 * Pas de titre recopié dedans, volontairement : renommer une page laisserait
 * sinon son ancien nom dans le corps de tous ses parents. Le titre et l'icône
 * sont résolus à l'affichage depuis le cache du projet
 * (components/pages/pages-lookup.tsx).
 *
 * Ce qui n'est PAS ici et appartient à MIN-272 : créer la page enfant, tenir
 * `parent_id`, et mettre la page à la corbeille quand on supprime le bloc. Ce
 * fichier ne pose que le nœud et son descripteur — c'est le contrat du registre.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    subpage: {
      /** Poser un bloc sous-page pointant sur `pageId` (`null` = pas encore créée). */
      insertSubpage: (pageId: string | null) => ReturnType;
    };
  }
  interface Storage {
    subpage: SubpageStorage;
  }
}

export interface SubpageStorage {
  /** Le créateur de page, posé par l'éditeur au montage (MIN-272). Lu au moment
      du clic, pas capturé : il arrive après le montage de l'éditeur. */
  create: (() => Promise<string | null>) | null;
  markdown?: unknown;
}

const SUBPAGE_MD = /^\[\[page:([^\]\s]+)\]\]$/;

export const Subpage = Node.create<Record<string, never>, SubpageStorage>({
  name: "subpage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addStorage() {
    return { create: null };
  },

  addAttributes() {
    return { pageId: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="subpage"]',
        getAttrs: (element) => ({
          pageId: (element as HTMLElement).getAttribute("data-page-id"),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "div",
      { "data-type": "subpage", "data-page-id": node.attrs.pageId ?? "" },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubpageView);
  },

  addCommands() {
    return {
      insertSubpage:
        (pageId: string | null) =>
        ({ commands }) =>
          commands.insertContent({ type: "subpage", attrs: { pageId } }),
    };
  },
});

export const subpageBlock: PageBlock = {
  id: "subpage",
  nodeName: "subpage",
  extensions: [Subpage],
  icon: FileText,
  labelKey: "blockSubpage",
  descriptionKey: "blockSubpageHint",
  slash: {
    group: "advanced",
    order: 4,
    keywords: ["page", "subpage", "sous-page", "sous page", "child", "enfant", "wiki"],
  },
  // Une sous-page ne se « transforme » pas depuis un paragraphe : il n'y a rien
  // à convertir, elle POINTE vers un autre document.
  turnInto: false,
  insert: (editor, range) => {
    editor.chain().focus().deleteRange(range).run();
    const create = editor.storage.subpage?.create;
    if (!create) {
      // Sans créateur câblé, on pose quand même le bloc : visible, sélectionnable,
      // supprimable. Un bloc vide se voit et se corrige ; une entrée de menu qui
      // n'a rien fait laisse l'utilisateur croire qu'il a mal tapé.
      editor.commands.insertSubpage(null);
      return;
    }
    void create().then((pageId) => {
      if (!editor.isDestroyed) editor.commands.insertSubpage(pageId);
    });
  },
  isActive: (editor) => editor.isActive("subpage"),
  markdown: {
    // Une sous-page se projette en `[[page:<id>]]` : une ligne, lisible, et que
    // Numo peut ÉCRIRE (il connaît les ids par les outils MCP). Le sens lecture
    // demande sa propre règle — markdown-it ne connaît pas cette syntaxe.
    sample: "[[page:00000000-0000-4000-8000-000000000000]]",
    toMarkdown: (state: MarkdownState, node: MarkdownNode) => {
      state.write(`[[page:${node.attrs.pageId ?? ""}]]`);
      state.closeBlock(node);
    },
    fromMarkdown: (markdownit) => subpageMarkdownIt(markdownit as MarkdownIt),
  },
};

/* ── La règle markdown-it (sens lecture) ──────────────────────────────── */

// Forme minimale des pièces de markdown-it qu'on touche — même parti pris que
// components/scratchpad/task-markdown.ts : le paquet est une dépendance
// transitive de tiptap-markdown, on ne s'y accroche pas par ses types.
interface MdToken {
  type: string;
  content: string;
  block: boolean;
}
interface MdCoreState {
  tokens: MdToken[];
  Token: new (type: string, tag: string, nesting: number) => MdToken;
}
interface MarkdownIt {
  core: {
    ruler: {
      after(after: string, name: string, fn: (state: MdCoreState) => void): void;
    };
  };
}

/**
 * Un paragraphe qui ne contient QUE `[[page:<id>]]` devient le HTML que le nœud
 * sait relire. On passe par un `html_block` plutôt que par un token maison : le
 * chemin de lecture de tiptap-markdown est markdown-it → HTML → `parseHTML`, et
 * c'est ce que fait déjà `parseHTML` du nœud ci-dessus.
 *
 * D'où le `html: true` sur l'extension Markdown de l'éditeur de page : sans lui,
 * markdown-it échapperait ce bloc en texte.
 */
function subpageMarkdownIt(md: MarkdownIt): void {
  md.core.ruler.after("inline", "minddy-subpage", (state) => {
    const tokens = state.tokens;
    for (let i = tokens.length - 2; i >= 1; i--) {
      if (
        tokens[i].type !== "inline" ||
        tokens[i - 1].type !== "paragraph_open" ||
        tokens[i + 1].type !== "paragraph_close"
      ) {
        continue;
      }
      const match = SUBPAGE_MD.exec(tokens[i].content.trim());
      if (!match) continue;
      const token = new state.Token("html_block", "", 0);
      token.content = `<div data-type="subpage" data-page-id="${match[1]}"></div>\n`;
      token.block = true;
      tokens.splice(i - 1, 3, token);
    }
  });
}
