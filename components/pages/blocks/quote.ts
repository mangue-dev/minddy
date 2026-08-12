import { Blockquote } from "@tiptap/extension-blockquote";
import { TextQuote } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

export const quoteBlock: PageBlock = {
  id: "quote",
  nodeName: "blockquote",
  extensions: [Blockquote],
  icon: TextQuote,
  labelKey: "blockQuote",
  slash: {
    group: "advanced",
    order: 0,
    keywords: ["quote", "citation", "blockquote", "cite", ">"],
  },
  turnInto: (editor) => editor.chain().focus().toggleBlockquote().run(),
  isActive: (editor) => editor.isActive("blockquote"),
  shortcut: { keys: "Mod-Shift-B", display: "⌘⇧B" },
  markdown: { sample: "> A quote" },
};
