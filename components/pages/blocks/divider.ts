import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { Minus } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/**
 * Le seul bloc du catalogue qui ne se « transforme » pas : un séparateur n'a pas
 * de contenu, donc rien à convertir depuis un paragraphe — il s'INSÈRE. D'où
 * `turnInto: false`, et l'`insert` explicite qui va avec.
 *
 * C'est exactement le cas que le descripteur doit savoir dire : sans lui, le
 * séparateur apparaîtrait dans « transformer en » et y avalerait le texte.
 */
export const dividerBlock: PageBlock = {
  id: "divider",
  nodeName: "horizontalRule",
  extensions: [HorizontalRule],
  icon: Minus,
  labelKey: "blockDivider",
  descriptionKey: "blockDividerHint",
  slash: {
    group: "advanced",
    order: 2,
    keywords: ["divider", "séparateur", "separateur", "rule", "hr", "line", "---"],
  },
  turnInto: false,
  insert: (editor, range) =>
    editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  isActive: (editor) => editor.isActive("horizontalRule"),
  markdown: { sample: "---" },
};
