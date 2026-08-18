import { BulletList, ListItem } from "@tiptap/extension-list";
import { List } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/** `ListItem` is brought here AND by the numbered list: it is the same node
 for both, and the register duplicates by extension name. Each
 block therefore declares enough to stand STANDING ALONE — removing one does not break the other. */
export const bulletListBlock: PageBlock = {
  id: "bulletList",
  nodeName: "bulletList",
  extensions: [BulletList, ListItem],
  icon: List,
  labelKey: "blockBulletList",
  slash: {
    group: "lists",
    order: 0,
    keywords: ["list", "liste", "bullet", "puce", "unordered", "ul"],
  },
  turnInto: (editor) => editor.chain().focus().toggleBulletList().run(),
  isActive: (editor) => editor.isActive("bulletList"),
  shortcut: { keys: "Mod-Shift-8", display: "⌘⇧8" },
  markdown: { sample: "- An item" },
};
