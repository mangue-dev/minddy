import { CodeBlock } from "@tiptap/extension-code-block";
import { Code2 } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/** Pas de coloration syntaxique en v1 (elle demanderait lowlight/shiki dans le
    bundle de l'éditeur) : le bloc garde sa langue en attribut, donc l'ajouter
    plus tard ne touchera ni le stockage ni le markdown. */
export const codeBlock: PageBlock = {
  id: "codeBlock",
  nodeName: "codeBlock",
  extensions: [CodeBlock],
  icon: Code2,
  labelKey: "blockCode",
  descriptionKey: "blockCodeHint",
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
