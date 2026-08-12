import { ListTodo } from "lucide-react";
import {
  ScratchpadTaskItemBase,
  ScratchpadTaskList,
} from "@/components/scratchpad/task-nodes";
import type { PageBlock } from "@/components/pages/blocks/types";

/**
 * Les tâches d'une page sont EXACTEMENT celles du carnet : les quatre états du
 * plan (`[ ]` / `[~]` / `[x]` / `[-]`), leur attribut `state` et leur round-trip
 * markdown viennent de components/scratchpad/task-nodes.ts, qui a été séparé de
 * sa vue pour ça.
 *
 * Ne rien redéfinir ici, jamais : deux définitions des quatre états, c'est deux
 * grammaires de tâche dans le même produit, et un jour un `[~]` qui se relit
 * `[ ]` d'un côté seulement.
 *
 * Ce fichier ne pose donc AUCUNE vue — plus depuis MIN-274. La vue est celle du
 * carnet (components/scratchpad/task-item-view.tsx), menu ⋯ compris, et elle
 * tire le baril `mangue-ui` : la nommer ici rendrait le registre entier
 * inimportable hors navigateur (projection markdown, outils MCP, tests — cf.
 * lib/cx.ts). C'est l'éditeur de page qui l'injecte au montage,
 * `pageExtensions({ nodeViews: { taskItem } })`, comme il le fait déjà pour la
 * pilule de mention.
 */
export const taskListBlock: PageBlock = {
  id: "taskList",
  nodeName: "taskList",
  extensions: [ScratchpadTaskList, ScratchpadTaskItemBase],
  icon: ListTodo,
  labelKey: "blockTaskList",
  slash: {
    group: "lists",
    order: 2,
    keywords: ["task", "tâche", "tache", "todo", "à faire", "a faire", "checkbox", "check"],
  },
  turnInto: (editor) => editor.chain().focus().toggleTaskList().run(),
  isActive: (editor) => editor.isActive("taskList"),
  shortcut: { keys: "Mod-Shift-9", display: "⌘⇧9" },
  // La sérialisation est celle du carnet, portée par les nœuds eux-mêmes — d'où
  // l'absence de `toMarkdown` ici. Le `sample` est ce qui le PROUVE : il
  // traverse un vrai éditeur dans lib/pages-blocks.test.ts.
  markdown: { sample: "- [~] A task" },
};
