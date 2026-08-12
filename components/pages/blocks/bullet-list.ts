import { BulletList, ListItem } from "@tiptap/extension-list";
import { List } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/** `ListItem` est apporté ici ET par la liste numérotée : c'est le même nœud
    pour les deux, et le registre dédoublonne par nom d'extension. Chaque bloc
    déclare donc de quoi tenir DEBOUT SEUL — retirer l'un ne casse pas l'autre. */
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
