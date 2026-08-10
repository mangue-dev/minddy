import { ListItem, OrderedList } from "@tiptap/extension-list";
import { ListOrdered } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

export const orderedListBlock: PageBlock = {
  id: "orderedList",
  nodeName: "orderedList",
  extensions: [OrderedList, ListItem],
  icon: ListOrdered,
  labelKey: "blockOrderedList",
  descriptionKey: "blockOrderedListHint",
  slash: {
    group: "lists",
    order: 1,
    keywords: ["list", "liste", "numbered", "numérotée", "numerotee", "ordered", "ol", "1."],
  },
  turnInto: (editor) => editor.chain().focus().toggleOrderedList().run(),
  isActive: (editor) => editor.isActive("orderedList"),
  shortcut: { keys: "Mod-Shift-7", display: "⌘⇧7" },
  markdown: { sample: "1. An item" },
};
