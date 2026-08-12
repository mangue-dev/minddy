import { Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { FileText } from "lucide-react";
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
 * Le nœud porte aussi la DÉTECTION de sa propre disparition (MIN-272) : à
 * chaque mise à jour du document, les pages citées avant et après sont
 * comparées, et celles qui viennent d'en sortir sont annoncées à l'éditeur, qui
 * demande confirmation puis les met à la corbeille. Ce que ce fichier ne fait
 * PAS : parler à la base — il ne connaît que deux crochets, `create` et
 * `removed`, posés par components/pages/page-view.tsx.
 *
 * Pourquoi la détection plutôt qu'un bouton « supprimer » : le bloc part par
 * une douzaine de gestes — retour arrière, menu ⋯, couper, tout sélectionner,
 * glisser hors du document. Les intercepter un par un, c'est en oublier ; le
 * document, lui, dit toujours la vérité.
 *
 * ── LE REPARENTAGE, et c'est le genre de subtilité qu'on re-découvre sinon ──
 *
 * Déplacer une page dans l'arbre de la sidebar change `parent_id` et NE DÉPLACE
 * PAS son bloc : celui-ci reste dans le corps où il a été écrit, et devient un
 * simple lien vers une page qui vit désormais ailleurs. C'est délibéré et non
 * un manque.
 *
 * La raison tient au sens des deux objets. Le bloc est une phrase du document —
 * il a une place dans un texte, entre deux paragraphes qui parlent de lui.
 * Aller le découper d'un corps pour le recoller à la fin d'un autre détruirait
 * cette place pour la remplacer par rien, et ferait d'un geste d'ORGANISATION
 * (ranger une page ailleurs) une modification du TEXTE de deux pages que
 * personne n'a demandée — chez celui qui les a peut-être ouvertes en ce moment
 * même.
 *
 * La conséquence à assumer : après un reparentage, le corps de l'ancien parent
 * cite une page qui n'est plus sa fille. Le bloc continue de marcher, il
 * n'annonce simplement plus une imbrication. C'est ce que `parent_id` est la
 * vérité veut dire concrètement.
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
  /** Les pages qui viennent de perdre leur bloc dans ce document. Même parti
      pris que `create` : lu au moment de l'événement, jamais capturé. */
  removed: ((pageIds: string[]) => void) | null;
  /** La page qui vient d'être créée depuis le menu « / » et dont le bloc est
      posé : à l'appelant d'enregistrer le parent, puis de l'ouvrir. */
  opened: ((pageId: string) => void) | null;
  /** Copier une page et sa descendance, et rendre l'id de la copie. C'est ce
      que « dupliquer » fait sur un bloc sous-page — copier le BLOC donnerait
      deux liens vers la même page, ce que personne ne demande. */
  duplicate: ((pageId: string) => Promise<string | null>) | null;
  markdown?: unknown;
}

/**
 * Les pages citées par un document ProseMirror.
 *
 * Sur le nœud plutôt que sur son JSON : `descendants` traverse l'arbre sans
 * rien sérialiser, et cette lecture tourne à CHAQUE frappe. Elle est récursive
 * parce qu'un bloc sous-page peut être posé dans un dépliant ou un item de
 * liste — ne regarder que le premier niveau laisserait un bloc pointant vers le
 * vide, exactement ce qu'on cherche à empêcher.
 */
export function subpageIdsInDoc(doc: ProseMirrorNode): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name !== "subpage") return true;
    const id = node.attrs.pageId;
    if (typeof id === "string" && id.length > 0) ids.add(id);
    return false;
  });
  return ids;
}

const SUBPAGE_MD = /^\[\[page:([^\]\s]+)\]\]$/;

export const Subpage = Node.create<Record<string, never>, SubpageStorage>({
  name: "subpage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addStorage() {
    return { create: null, removed: null, opened: null, duplicate: null };
  },

  /**
   * `onUpdate` et pas `onTransaction`, et la différence est tout sauf un
   * détail : adopter un document fusionné passe par `setContent(…, { emitUpdate:
   * false })` (MIN-271), qui pose `preventUpdate` sur sa transaction. Sur
   * `onTransaction`, une fusion qui a fait tomber un bloc sous-page — ce que la
   * fusion fait justement quand le SERVEUR vient de le retirer — se lirait comme
   * une suppression de l'utilisateur, et corbeillerait la page une seconde fois.
   *
   * La comparaison se fait sur `transaction.before` plutôt que sur un instantané
   * gardé de côté : un instantané se périme précisément à ces adoptions
   * silencieuses, alors que la transaction porte toujours son propre avant.
   */
  onUpdate({ editor, transaction }) {
    const removed = this.storage.removed;
    if (!removed || !transaction.docChanged) return;

    const before = subpageIdsInDoc(transaction.before);
    if (before.size === 0) return;
    const after = subpageIdsInDoc(editor.state.doc);
    const gone = [...before].filter((id) => !after.has(id));
    if (gone.length > 0) removed(gone);
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

  // Pas d'`addNodeView` ici, et c'est la règle du dossier : la vue
  // (blocks/subpage-view.tsx) est un module « use client » et `@tiptap/react`
  // en est un aussi. La nommer depuis ce fichier ferait entrer une référence
  // client dans le graphe SERVEUR — le registre est monté par la projection
  // markdown (lib/pages-markdown.ts), donc par le MCP, Numo et l'agent — et
  // tiptap l'appellerait au montage de l'éditeur headless. La vue est injectée
  // par la surface, `pageExtensions({ nodeViews: { subpage } })`, exactement
  // comme la tâche du carnet (cf. task-list.ts).

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
    // `create` crée la page ET ouvre l'enfant, dans cet ordre : le bloc doit
    // être POSÉ, puis le corps du parent enregistré, avant qu'on quitte la page
    // — sinon la navigation démonte l'éditeur avec, dans le brouillon, un bloc
    // que personne n'a encore écrit. L'attente et l'enregistrement vivent chez
    // l'appelant (`PagesLookup.opened`), qui seul tient l'autosave.
    void create().then((pageId) => {
      if (editor.isDestroyed) return;
      editor.commands.insertSubpage(pageId);
      if (pageId) editor.storage.subpage?.opened?.(pageId);
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
