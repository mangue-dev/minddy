// @vitest-environment jsdom
//
// The round trip markdown ⇄ notebook editor, played in full on a REAL
// TipTap editor (without React: the task view lives separately, see task-nodes.ts).
// This is the only place where you can see what the notebook actually RECORDS —
// on the screen, a subtask has the same head whether it is nested or not, and the
// two defects corrected here (“loose” list, tree flattened when gluing) are not
// read only in the markdown, that is to say in the agent who receives it.
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { ScratchpadParagraph } from "@/components/scratchpad/scratchpad-paragraph";
import {
  ScratchpadTaskItemBase,
  ScratchpadTaskList,
} from "@/components/scratchpad/task-nodes";
import { pasteScratchpadMarkdown } from "@/components/scratchpad/paste-markdown";
import {
  startPendingTasks,
  taskItemLines,
} from "@/components/scratchpad/start-tasks";
import { taskLinesMarkdown } from "@/lib/scratchpad";
import { parsePlan } from "@/lib/plan";

/**
 * Editors opened by the file. A `Editor` TipTap mounts a
 * `DOMObserver` from ProseMirror which reschedules with `setTimeout`; without
 * `destroy()`, this timer survives the file and wakes up once the
 * `document` of jsdom is unmounted — `ReferenceError: document is not defined`,
 * remounted by vitest as an unhandled error of the SUITE, on the file which
 * was running at that moment. It didn't always trigger: it needed
 * enough charge for the timer to miss its window. This is the file that
 * opens and closes.
 */
const openEditors: Editor[] = [];

afterEach(() => {
  for (const editor of openEditors.splice(0)) editor.destroy();
});

function makeEditor(content = "") {
  const editor = new Editor({
    element: document.createElement("div"),
    content,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, paragraph: false }),
      ScratchpadParagraph,
      ScratchpadTaskList,
      ScratchpadTaskItemBase,
      Markdown.configure({ html: false, linkify: true }),
    ] as never,
  });
  openEditors.push(editor);
  return editor;
}

function md(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}

/** The position and node of the `n`-th task of the document (document order). */
function taskAt(editor: Editor, n: number) {
  let seen = -1;
  let found: { pos: number; node: any } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "taskItem") return true;
    seen += 1;
    if (seen === n && !found) found = { pos, node };
    return true;
  });
  if (!found) throw new Error(`pas de tâche ${n}`);
  return found as { pos: number; node: any };
}

const NESTED = "- [ ] parent\n  - [~] child\n    - [x] grand\n- [ ] sib";

describe("scratchpad serialization", () => {
  it("n'insère pas de ligne blanche entre les tâches", () => {
    expect(md(makeEditor("- [ ] a\n- [~] b"))).toBe("- [ ] a\n- [~] b");
  });

  it("garde l'imbrication et son pas de deux espaces", () => {
    expect(md(makeEditor(NESTED))).toBe(NESTED);
  });

  it("is stable from one round trip to the next", () => {
    const once = md(makeEditor(NESTED));
    expect(md(makeEditor(once))).toBe(once);
  });

  it("relit les profondeurs comme parsePlan les compte", () => {
    expect(parsePlan(md(makeEditor(NESTED))).tasks.map((t) => t.depth)).toEqual([
      0, 1, 2, 0,
    ]);
  });
});

describe("pasting markdown into subtasks", () => {
  it("in an empty scratchpad", () => {
    const e = makeEditor("");
    expect(pasteScratchpadMarkdown(e, NESTED)).toBe(true);
    expect(md(e)).toBe(NESTED);
  });

  it("places the cursor in a prose paragraph — the list arrives as a block", () => {
    const e = makeEditor("intro");
    e.commands.focus("end");
    pasteScratchpadMarkdown(e, NESTED);
    expect(md(e)).toBe(`intro\n\n${NESTED}`);
  });

  it("places the cursor on the empty task just opened", () => {
    const e = makeEditor("- [ ] déjà là");
    e.commands.focus("end");
    e.commands.splitListItem("taskItem");
    pasteScratchpadMarkdown(e, NESTED);
    expect(md(e)).toBe(`- [ ] déjà là\n${NESTED}`);
  });

  it("laisse passer ce qui n'est aucune tâche", () => {
    const e = makeEditor("");
    expect(pasteScratchpadMarkdown(e, "juste du texte")).toBe(false);
    expect(md(e)).toBe("");
  });
});

describe("an action on a task carries its subtasks", () => {
  it("extracts the entire subtree, brought to the top level", () => {
    const e = makeEditor(NESTED);
    expect(taskLinesMarkdown(taskItemLines(taskAt(e, 0).node))).toBe(
      "- [ ] parent\n  - [~] child\n    - [x] grand"
    );
  });

  it("mais jamais son parent — l'enfant part seul, à plat", () => {
    const e = makeEditor(NESTED);
    expect(taskLinesMarkdown(taskItemLines(taskAt(e, 1).node))).toBe(
      "- [~] child\n  - [x] grand"
    );
  });

  it("does not append the children's text to the parent's", () => {
    const e = makeEditor(NESTED);
    expect(taskItemLines(taskAt(e, 0).node)[0].text).toBe("parent");
  });

  it("starting a parent starts what remains to do below it", () => {
    const e = makeEditor("- [ ] parent\n  - [ ] child\n  - [x] fait\n- [ ] sib");
    const { pos, node } = taskAt(e, 0);
    expect(startPendingTasks(e, pos, pos + node.nodeSize)).toBe(2);
    expect(md(e)).toBe("- [~] parent\n  - [~] child\n  - [x] fait\n- [ ] sib");
  });

  it("a parent already in progress still starts its descendants", () => {
    const e = makeEditor("- [~] parent\n  - [ ] child");
    const { pos, node } = taskAt(e, 0);
    expect(startPendingTasks(e, pos, pos + node.nodeSize)).toBe(1);
    expect(md(e)).toBe("- [~] parent\n  - [~] child");
  });

  it("but a child does not start its parent", () => {
    const e = makeEditor("- [ ] parent\n  - [ ] child");
    const { pos, node } = taskAt(e, 1);
    expect(startPendingTasks(e, pos, pos + node.nodeSize)).toBe(1);
    expect(md(e)).toBe("- [ ] parent\n  - [~] child");
  });
});
