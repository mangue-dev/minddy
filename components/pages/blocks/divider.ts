import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { Minus } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/**
 * The only block in the catalog that does not “transform”: a separator has no
 * content, so nothing to convert from a paragraph — it INSERTS. Hence
 * `turnInto: false`, and the explicit `insert` that goes with it.
 *
 * This is exactly the case that the descriptor must know to say: without it, the
 * separator would appear in "transform to" and swallow the descriptor there. text.
 */
export const dividerBlock: PageBlock = {
  id: "divider",
  nodeName: "horizontalRule",
  extensions: [HorizontalRule],
  icon: Minus,
  labelKey: "blockDivider",
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
