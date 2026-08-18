import { CodeBlock } from "@tiptap/extension-code-block";
import { Code2 } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/** No syntax highlighting in v1 (it would require lowlight/shiki in the editor bundle): the block keeps its language as an attribute, so adding it later will not affect storage or markdown. */
export const codeBlock: PageBlock = {
  id: "codeBlock",
  nodeName: "codeBlock",
  extensions: [CodeBlock],
  icon: Code2,
  labelKey: "blockCode",
  slash: {
    group: "advanced",
    order: 1,
    keywords: ["code", "snippet", "pre", "```"],
  },
  turnInto: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  isActive: (editor) => editor.isActive("codeBlock"),
  shortcut: { keys: "Mod-Alt-C", display: "⌘⌥C" },
  markdown: { sample: "```ts\nconst answer = 42\n```" },
};
