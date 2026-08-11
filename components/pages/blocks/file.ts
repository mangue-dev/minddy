import { Node } from "@tiptap/core";
import { Paperclip } from "lucide-react";
import { pageFileIdFromSrc } from "@/lib/page-files";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

/**
 * Le bloc FICHIER (MIN-280) — n'importe quel type, posé en ligne dans le
 * document avec son nom, son poids et son téléchargement.
 *
 * Sa projection markdown est un LIEN : `[rapport.pdf](/api/…)`. C'est la seule
 * forme que markdown offre, et elle a le bon goût d'être exactement ce qu'un
 * agent sait écrire sans rien apprendre.
 *
 * Le sens LECTURE demande en revanche sa propre règle, et il faut voir pourquoi
 * : un paragraphe qui ne contient qu'un lien est une construction ordinaire (une
 * ligne « voir aussi »), et la traiter en bloc fichier ferait muter du texte que
 * personne n'a écrit comme tel. La règle ci-dessous ne prend donc QUE les liens
 * qui pointent vers un fichier de page — les autres restent des paragraphes,
 * intacts. Un `[rapport.pdf](https://exemple.org/…)` écrit par Numo reste un
 * lien de texte : c'en est un.
 *
 * `size` et `mime` ne survivent pas au markdown (rien ne les y porte), et c'est
 * écrit avec les autres pertes assumées, en tête de lib/pages-markdown.ts. Ils
 * ne sont pas du contenu : la vue les relit du serveur si un jour elle en a
 * besoin, et sans eux la ligne dit déjà le nom et donne le fichier.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageFile: {
      /** Poser un bloc fichier. Sans `src`, c'est un emplacement en attente de
          son téléversement (`uploadId`). */
      insertPageFile: (attrs: {
        src?: string | null;
        name?: string | null;
        size?: number | null;
        mime?: string | null;
        uploadId?: string | null;
      }) => ReturnType;
    };
  }
}

export const PageFile = Node.create({
  name: "pageFile",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-src"),
        renderHTML: (attributes) =>
          attributes.src ? { "data-src": attributes.src as string } : {},
      },
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-name"),
        renderHTML: (attributes) =>
          attributes.name ? { "data-name": attributes.name as string } : {},
      },
      size: {
        default: null,
        parseHTML: (element) => {
          const raw = Number(element.getAttribute("data-size"));
          return Number.isFinite(raw) && raw > 0 ? raw : null;
        },
        renderHTML: (attributes) =>
          attributes.size ? { "data-size": String(attributes.size) } : {},
      },
      mime: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-mime"),
        renderHTML: (attributes) =>
          attributes.mime ? { "data-mime": attributes.mime as string } : {},
      },
      /** Hors document — cf. le même attribut sur le bloc image. */
      uploadId: { default: null, rendered: false },
    };
  },

  parseHTML() {
    // Un `div` et non un `p` : la règle du paragraphe happerait la balise et en
    // jetterait les attributs au passage (cf. blocks/types.ts).
    return [{ tag: 'div[data-type="pageFile"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-type": "pageFile" }];
  },

  addCommands() {
    return {
      insertPageFile:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "pageFile", attrs }),
    };
  },
});

export const fileBlock: PageBlock = {
  id: "file",
  nodeName: "pageFile",
  extensions: [PageFile],
  icon: Paperclip,
  labelKey: "blockFile",
  descriptionKey: "blockFileHint",
  slash: {
    group: "advanced",
    order: 6,
    keywords: [
      "file",
      "fichier",
      "attachment",
      "pièce jointe",
      "piece jointe",
      "upload",
      "pdf",
      "document",
    ],
  },
  turnInto: false,
  isActive: (editor) => editor.isActive("pageFile"),
  markdown: {
    sample: "[report.pdf](/api/projects/00000000-0000-4000-8000-000000000000/pages/files/22222222-2222-4222-8222-222222222222)",
    toMarkdown: (state: MarkdownState, node: MarkdownNode) => {
      const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
      if (!src) return;
      const name =
        (typeof node.attrs.name === "string" && node.attrs.name.trim()) || "file";
      state.write(`[${state.esc(name)}](${src})`);
      state.closeBlock(node);
    },
    fromMarkdown: (markdownit) => fileMarkdownIt(markdownit as MarkdownIt),
  },
};

/* ── La règle markdown-it (sens lecture) ──────────────────────────────────── */

// Forme minimale des pièces de markdown-it qu'on touche — même parti pris que
// blocks/subpage.ts : le paquet est une dépendance transitive de
// tiptap-markdown, on ne s'y accroche pas par ses types.
interface MdToken {
  type: string;
  content: string;
  block: boolean;
  children?: MdToken[] | null;
  attrGet?(name: string): string | null;
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

/** `&`, `<`, `"` dans un nom de fichier : rares, et suffisants pour casser la
    balise qu'on fabrique. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Un paragraphe qui ne contient QUE le lien d'un fichier de page devient le HTML
 * que le nœud sait relire. Comme pour la sous-page, on passe par un `html_block`
 * : le chemin de lecture de tiptap-markdown est markdown-it → HTML → `parseHTML`.
 */
function fileMarkdownIt(md: MarkdownIt): void {
  md.core.ruler.after("inline", "minddy-page-file", (state) => {
    const tokens = state.tokens;
    for (let i = tokens.length - 2; i >= 1; i--) {
      if (
        tokens[i].type !== "inline" ||
        tokens[i - 1].type !== "paragraph_open" ||
        tokens[i + 1].type !== "paragraph_close"
      ) {
        continue;
      }
      const children = tokens[i].children;
      // Exactement `[texte](url)`, et rien autour : trois jetons, pas un de
      // plus. Un lien au milieu d'une phrase reste un lien de texte.
      if (!children || children.length !== 3) continue;
      const [open, text, close] = children;
      if (
        open.type !== "link_open" ||
        text.type !== "text" ||
        close.type !== "link_close"
      ) {
        continue;
      }
      const href = open.attrGet?.("href") ?? null;
      if (!pageFileIdFromSrc(href)) continue;

      const token = new state.Token("html_block", "", 0);
      token.content =
        `<div data-type="pageFile" data-src="${escapeAttribute(href as string)}" ` +
        `data-name="${escapeAttribute(text.content)}"></div>\n`;
      token.block = true;
      tokens.splice(i - 1, 3, token);
    }
  });
}
