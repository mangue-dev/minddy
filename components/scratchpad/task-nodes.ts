// The TWO task nodes in the notebook, without a line of React: the schema, the
// attributes and round-trip markdown. The view (checkbox, menu ⋯, shortcuts
// hover) lives in scratchpad-task.tsx, which grafts its `addNodeView` onto
// `ScratchpadTaskItemBase`.
//
// This division is not cosmetic: it is what makes the round-trip
// TESTABLE (lib/scratchpad-nesting.test.ts mounts a real editor on these two
// nodes, under jsdom, without having to mount React). Subtasks were getting lost
// between the markdown and the editor without anything saying it — the only thing that
// see it, it's a round trip played in full.

import { TaskItem, TaskList } from "@tiptap/extension-list";
import type { PlanTaskState } from "@/lib/plan";
import { TASK_MARKER_BY_STATE } from "@/lib/scratchpad";
import { scratchpadTaskMarkdownIt } from "@/components/scratchpad/task-markdown";

/**
 * The notebook task: the FOUR states of the plan (instead of the binary `checked` of
 * TipTap), carried by the `state` attribute and serialized in `[ ]`/`[~]`/`[x]`/`[-]`.
 *
 * `nested: true` is not a detail: it is what gives the node the `content`
 * `paragraph block*`, therefore the right to carry a sublist. Without it, a stuck subtask has nowhere to land and the notebook flattens. It is
 * placed HERE, on the base node, so that the view (scratchpad-task.tsx) only has
 * at `extend` — `configure` itself being a `extend`, the option follows.
 */
export const ScratchpadTaskItemBase = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      state: {
        default: "pending" as PlanTaskState,
        // Entry at the end of the task = a NEW task, therefore “to be done”: without
        // that, `splitListItem` copies the attributes of the cut line and the
        // next one is already checked (crossed out, counted as done). This is the
        // same setting as the `checked` attribute of the upstream TaskItem.
        keepOnSplit: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-state") ?? "pending",
        renderHTML: (attributes: { state?: string }) => ({
          "data-state": attributes.state ?? "pending",
        }),
      },
    };
  },

  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(state: any, node: any) {
          const s = node.attrs.state as PlanTaskState;
          state.write(`${TASK_MARKER_BY_STATE[s] ?? "[ ]"} `);
          state.renderContent(node);
        },
        // Our markdown-it rule sets data-type/data-state directly, so the
        // default checkbox DOM rewrite must not run.
        parse: { updateDOM() {} },
      },
    };
  },
}).configure({ nested: true });

export const ScratchpadTaskList = TaskList.extend({
  /**
 * `tight` — the list is written WITHOUT a blank line between its items.
 *
 * prosemirror-markdown reads this attribute on the node, and otherwise falls back to a
 * option that tiptap-markdown never informs: a list without `tight` part
 * therefore in “loose” list. tiptap-markdown does set the attribute — but
 * only on `bulletList` and `orderedList` (`MarkdownTightLists`), never
 * on `taskList`, which it does not know. The notebook thus recorded a blank line
 * between EACH task, invisible on the screen and very real in the
 * markdown — this is what the copied prompt, the agent and the MCP read.
 *
 * `rendered: false`: this is an instruction to serialization, it has nothing to
 * do in the editor's DOM nor in an HTML clipboard.
 */
  addAttributes() {
    return {
      ...this.parent?.(),
      tight: { default: true, rendered: false },
    };
  },

  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(
          this: { editor: { storage: Record<string, any> } },
          state: any,
          node: any
        ) {
          return state.renderList(
            node,
            "  ",
            () =>
              (this.editor.storage.markdown.options.bulletListMarker || "-") + " "
          );
        },
        parse: {
          setup(markdownit: unknown) {
            scratchpadTaskMarkdownIt(markdownit as never);
          },
        },
      },
    };
  },
});
