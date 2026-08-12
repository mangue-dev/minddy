import { Paragraph } from "@tiptap/extension-paragraph";
import { Pilcrow } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/** Le bloc par défaut : c'est lui que `Entrée` crée, et c'est vers lui que
    « transformer en » ramène. Rien de spécial à sérialiser — un paragraphe est
    du markdown nu. */
export const paragraphBlock: PageBlock = {
  id: "paragraph",
  nodeName: "paragraph",
  extensions: [Paragraph],
  icon: Pilcrow,
  labelKey: "blockParagraph",
  slash: {
    group: "basic",
    order: 0,
    keywords: ["paragraph", "paragraphe", "text", "texte", "plain"],
  },
  turnInto: (editor) => editor.chain().focus().setParagraph().run(),
  isActive: (editor) => editor.isActive("paragraph"),
  shortcut: { keys: "Mod-Alt-0", display: "⌘⌥0" },
  markdown: { sample: "Some text" },
};
