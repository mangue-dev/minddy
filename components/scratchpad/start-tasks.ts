import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { isQuestionHeading, type PlanTaskState } from "@/lib/plan";
import type { ScratchpadTaskLine } from "@/lib/scratchpad";

/** Rank (1–3) of a title node. */
export const nodeRank = (node: { attrs: { level?: unknown } }): number =>
  Math.min(6, Math.max(1, Number(node.attrs.level) || 1));

/**
 * The OWN text of a task: that of its first paragraph, not that of
 * whatever it carries.
 *
 * `node.textContent` of a `taskItem` concatenates its descendants — text of the
 * task AND its subtasks, pasted without separator. This is what came out of the
 * notebook when we copied a children's task: a single line, "restart the
 * croncheck the logs notify Marc".
 */
export function taskOwnText(node: PMNode): string {
  const first = node.firstChild;
  return (first?.isTextblock ? first.textContent : node.textContent).trim();
}

/**
 * A task and EVERYTHING it carries, flat and deep (root at 0).
 *
 * The rule of hierarchy: the parent takes its children, the child does not take
 * its parent. The number of levels is not limited — a subtask of
 * subtask is a subtask.
 *
 * `map` is used to output the task in its state AFTER the gesture: a handover
 * starts the work, and the copied markdown must say “in progress” what the
 * notebook already says “in progress”.
 */
export function taskItemLines(
  node: PMNode,
  map?: (state: PlanTaskState) => PlanTaskState
): ScratchpadTaskLine[] {
  const lines: ScratchpadTaskLine[] = [];
  const push = (item: PMNode, depth: number) => {
    const state = (item.attrs.state ?? "pending") as PlanTaskState;
    lines.push({ depth, state: map ? map(state) : state, text: taskOwnText(item) });
    item.forEach((child) => {
      if (child.type.name !== "taskList") return;
      child.forEach((sub) => {
        if (sub.type.name === "taskItem") push(sub, depth + 1);
      });
    });
  };
  push(node, 0);
  return lines;
}

/**
 * Makes all NOT YET STARTED tasks in the interval
 * [from, to) — including subtasks, at all levels — “in progress”. This is the counterpart, at
 * the scale of a task, a section or the entire notebook, of what the
 * rule says: to entrust work to an agent is to begin it, and to entrust a
 * parent is to entrust what he or she is carrying.
 *
 * A task already in progress, checked or canceled does not move, and the boxes in a
 * "Questions" section either — they are questions, not work (even
 * rule that `parsePlan`, which the counter and the welcome overview already follow).
 *
 * Everything is ONE transaction: a single Ctrl-Z puts the whole thing back, and autosave
 * only sees one change. Returns the number of tasks moved.
 */
export function startPendingTasks(
  editor: Editor,
  from: number,
  to: number
): number {
  const { state } = editor;
  const tr = state.tr;
  let moved = 0;
  // The scan starts from the START of the document, no `from`: the target interval
  // can start inside a “Questions” section opened above.
  let questionRank: number | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const rank = nodeRank(node);
      if (questionRank !== null && rank <= questionRank) questionRank = null;
      if (isQuestionHeading(node.textContent)) questionRank = rank;
      return false;
    }
    if (node.type.name !== "taskItem") return true;
    if (questionRank !== null || pos < from || pos >= to) return true;
    // Changing an attribute does not change the size of the node, therefore the positions
    // already noted remain valid from one step to the next — including those of the
    // subtasks, into which we continue to descend.
    if (node.attrs.state === "pending") {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, state: "in_progress" });
      moved += 1;
    }
    return true;
  });
  if (moved > 0) editor.view.dispatch(tr);
  return moved;
}
