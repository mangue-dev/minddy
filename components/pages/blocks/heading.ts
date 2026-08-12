import { Heading } from "@tiptap/extension-heading";
import { Heading1, Heading2, Heading3 } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/**
 * Trois BLOCS pour un seul NŒUD — c'est le cas qui a décidé de la forme du
 * descripteur : le catalogue parle en blocs (« titre 2 »), tiptap en nœuds
 * (`heading` + un niveau). Seul le titre 1 apporte l'extension ; les deux autres
 * s'y greffent, et le registre dédoublonne par nom d'extension.
 *
 * Trois niveaux, pas six : au-delà, un titre ne se distingue plus d'un
 * paragraphe gras, et le carnet a tranché pareil.
 */
const LEVELS = [1, 2, 3] as const;

function headingBlock(level: (typeof LEVELS)[number]): PageBlock {
  const icon = { 1: Heading1, 2: Heading2, 3: Heading3 }[level];
  return {
    // Pas de cast : `level` est une union littérale, donc TypeScript infère
    // `"heading1" | "heading2" | "heading3"` — et refuserait un niveau 4, dont
    // ni l'identité de bloc ni les clés i18n n'existent.
    id: `heading${level}`,
    nodeName: "heading",
    extensions: level === 1 ? [Heading.configure({ levels: [...LEVELS] })] : [],
    icon,
    labelKey: `blockHeading${level}`,
    slash: {
      group: "basic",
      order: level,
      keywords: [
        "heading",
        "title",
        "titre",
        "section",
        `h${level}`,
        `#`.repeat(level),
      ],
    },
    turnInto: (editor) => editor.chain().focus().setNode("heading", { level }).run(),
    isActive: (editor) => editor.isActive("heading", { level }),
    shortcut: { keys: `Mod-Alt-${level}`, display: `⌘⌥${level}` },
    markdown: { sample: `${"#".repeat(level)} A heading` },
  };
}

export const heading1Block = headingBlock(1);
export const heading2Block = headingBlock(2);
export const heading3Block = headingBlock(3);
