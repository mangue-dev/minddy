import { Paragraph } from "@tiptap/extension-paragraph";
import { Pilcrow } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/** The default block: this is what `Enter` creates, and it is this that
 “transform into” brings back. Nothing special to serialize — a paragraph is KEEP_2_TOKEN of bare markdown. */
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
