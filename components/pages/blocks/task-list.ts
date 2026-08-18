import { ListTodo } from "lucide-react";
import {
  ScratchpadTaskItemBase,
  ScratchpadTaskList,
} from "@/components/scratchpad/task-nodes";
import type { PageBlock } from "@/components/pages/blocks/types";

/**
 * The tasks on a page are EXACTLY those in the notebook: the four states of the
 * plan (`[ ]` / `[~]` / `[x]` / `[-]`), their `state` attribute and their round-trip
 * markdown come from components/scratchpad/task-nodes.ts, which was separated from
 * its view for that.
 *
 * Do not redefine anything here, ever: two definitions of the four states are two
 * task grammars in the same product, and one day a `[~]` which rereads
 * `[ ]` on one side only.
 *
 * This file therefore poses NO view — no longer since MIN-274. The view is that of the
 * notebook (components/scratchpad/task-item-view.tsx), menu ⋯ included, and it
 * pulls the barrel `mangue-ui`: naming it here would make the entire register
 * unimportable outside the browser (markdown projection, MCP tools, tests — cf.
 * lib/cx.ts). It is the page editor who injects it during editing,
 * `pageExtensions({ nodeViews: { taskItem } })`, as it already does for the
 * mention pill.
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
  // The serialization is that of the notebook, carried by the nodes themselves — hence
  // the absence of `toMarkdown` here. The `sample` is what PROVES it: it
  // pass through a real editor in lib/pages-blocks.test.ts.
  markdown: { sample: "- [~] A task" },
};
