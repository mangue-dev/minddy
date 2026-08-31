import { Code2 } from "lucide-react";
import { HighlightedCodeBlock } from "@/components/code-block-lowlight";
import type { PageBlock } from "@/components/pages/blocks/types";

/** Syntax highlighting comes from lowlight (see components/code-block-lowlight):
    the block keeps its language as an attribute, so storage and markdown are
    unaffected by the rendering layer. */
export const codeBlock: PageBlock = {
  id: "codeBlock",
  nodeName: "codeBlock",
  extensions: [HighlightedCodeBlock],
  icon: Code2,
  labelKey: "blockCode",
  slash: {
    group: "advanced",
    order: 2,
    keywords: ["code", "snippet", "pre", "```"],
  },
  turnInto: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  isActive: (editor) => editor.isActive("codeBlock"),
  shortcut: { keys: "Mod-Alt-C", display: "⌘⌥C" },
  markdown: { sample: "```ts\nconst answer = 42\n```" },
};
