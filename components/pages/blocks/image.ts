import { Node } from "@tiptap/core";
import { ImageIcon } from "lucide-react";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

/**
 * Le bloc IMAGE (MIN-280) — un nœud atomique de BLOC, qui ne porte qu'une
 * adresse, un texte alternatif et une largeur.
 *
 * Trois décisions valent d'être écrites, parce qu'aucune n'est évidente à la
 * relecture :
 *
 * **1. Un bloc, pas une image en ligne.** Markdown, lui, n'a que l'image en
 * ligne (`![…](…)` vit dans un paragraphe). Ce n'est pas une contradiction : le
 * nœud est déclaré `group: "block"`, et l'analyseur DOM de ProseMirror, quand il
 * rencontre un `<img>` dans un `<p>`, ferme le paragraphe et pose le bloc — le
 * texte qui précédait et celui qui suit restent deux paragraphes. Rien n'est
 * perdu, et une image collée au milieu d'une phrase par Numo remonte donc à sa
 * propre ligne. C'est le comportement qu'on veut : dans une page, une capture
 * d'écran est un bloc qu'on déplace, pas une lettre du paragraphe.
 *
 * **2. `src` porte l'URL de la ROUTE, jamais le chemin du bucket ni une URL
 * signée** (le pourquoi, en entier, est dans lib/page-files.ts). Une image dont
 * le `src` est une URL EXTERNE est un cas parfaitement normal — Numo écrit
 * `![graphe](https://…)`, et ça marche : ce bloc ne suppose nulle part que le
 * fichier soit à nous.
 *
 * **3. La LARGEUR est un pourcentage de la colonne, pas des pixels.** Une page
 * se lit sur un écran de portable comme sur un 27 pouces ; une image posée à
 * 640 px déborde de l'un et flotte au milieu de l'autre. Le pourcentage tient
 * dans les deux, et c'est aussi le seul réglage qui reste juste quand la colonne
 * de texte change de largeur.
 *
 * `uploadId` est l'exception qui confirme le reste : le seul attribut qui n'a de
 * sens qu'ici et maintenant. Il tient le temps du téléversement — la vue le lit
 * pour afficher l'aperçu local et l'avancement (components/pages/blocks/image-view.tsx),
 * et il retombe à `null` dès que le `src` définitif arrive.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageImage: {
      /** Poser un bloc image. Sans `src`, c'est un emplacement en attente de
          son téléversement (`uploadId`). */
      insertPageImage: (attrs: {
        src?: string | null;
        alt?: string | null;
        width?: number | null;
        uploadId?: string | null;
      }) => ReturnType;
    };
  }
}

/** Bornes de la largeur, en pourcentage de la colonne de texte. En deçà de 10 %
    une image n'est plus qu'un point ; au-delà de 100 % elle déborderait. */
export const IMAGE_MIN_WIDTH = 10;
export const IMAGE_MAX_WIDTH = 100;

/** La largeur telle qu'on accepte de la ranger : un entier borné, ou `null`
    (« pleine colonne », l'absence de réglage plutôt qu'un 100 écrit partout). */
export function clampImageWidth(value: unknown): number | null {
  const width = typeof value === "string" ? Number(value) : value;
  if (typeof width !== "number" || !Number.isFinite(width)) return null;
  const rounded = Math.round(width);
  if (rounded >= IMAGE_MAX_WIDTH) return null;
  return Math.max(IMAGE_MIN_WIDTH, rounded);
}

export const PageImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      // La LÉGENDE, et le texte alternatif : un seul champ, parce que markdown
      // n'en a qu'un (`![légende](…)`) et qu'en avoir deux dans le nœud aurait
      // voulu dire en perdre un à chaque aller-retour. Une bonne légende est un
      // bon texte alternatif — c'est même la seule définition utilisable des
      // deux.
      alt: { default: null },
      width: {
        default: null,
        parseHTML: (element) => clampImageWidth(element.getAttribute("data-width")),
        renderHTML: (attributes) =>
          attributes.width ? { "data-width": String(attributes.width) } : {},
      },
      // Hors document : jamais rendu en HTML, donc jamais relu. Un
      // téléversement ne survit pas au rechargement de la page, et c'est très
      // bien — ce qui survit, lui, est ce qui a un `src`.
      uploadId: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", HTMLAttributes];
  },

  addCommands() {
    return {
      insertPageImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "image", attrs }),
    };
  },
});

export const imageBlock: PageBlock = {
  id: "image",
  nodeName: "image",
  extensions: [PageImage],
  icon: ImageIcon,
  labelKey: "blockImage",
  descriptionKey: "blockImageHint",
  slash: {
    group: "advanced",
    order: 5,
    keywords: [
      "image",
      "img",
      "photo",
      "picture",
      "capture",
      "screenshot",
      "capture d'écran",
      "illustration",
    ],
  },
  // Une image ne se « transforme » pas depuis un paragraphe : il n'y a aucun
  // texte à convertir en fichier. Elle s'insère, comme la sous-page.
  turnInto: false,
  isActive: (editor) => editor.isActive("image"),
  markdown: {
    sample: "![A screenshot](/api/projects/00000000-0000-4000-8000-000000000000/pages/files/11111111-1111-4111-8111-111111111111)",
    toMarkdown: (state: MarkdownState, node: MarkdownNode) => {
      const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
      const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
      // Un emplacement dont le téléversement n'a pas abouti n'écrit RIEN plutôt
      // qu'un `![](…)` vide : le markdown est ce que lit Numo, et une image sans
      // adresse n'y est ni du contenu ni une information.
      if (!src) return;
      state.write(`![${state.esc(alt)}](${src})`);
      state.closeBlock(node);
    },
  },
};
