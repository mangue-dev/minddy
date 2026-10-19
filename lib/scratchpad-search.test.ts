// @vitest-environment jsdom
//
// Notebook tasks in the command palette (MIN-725): the rows found in the
// Markdown, and the task item each one opens in a REAL notebook editor.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { BlockFlash, FLASH_MS, blockFlashKey, flashBlockAt } from "@/components/pages/block-flash";
import { ScratchpadParagraph } from "@/components/scratchpad/scratchpad-paragraph";
import { ScratchpadTaskItemBase, ScratchpadTaskList } from "@/components/scratchpad/task-nodes";
import { scratchpadSearchTasks } from "@/lib/scratchpad-search";
import { findTaskItemPos } from "@/lib/task-sections";

const openEditors: Editor[] = [];

afterEach(() => {
  for (const editor of openEditors.splice(0)) editor.destroy();
});

function notebook(content: string) {
  const editor = new Editor({
    element: document.createElement("div"),
    content,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, paragraph: false }),
      ScratchpadParagraph,
      ScratchpadTaskList,
      ScratchpadTaskItemBase,
      BlockFlash,
      Markdown.configure({ html: false, linkify: true }),
    ] as never,
  });
  openEditors.push(editor);
  return editor;
}

const NOTE = [
  "- [ ] Call the **bank**",
  "",
  "## Release",
  "",
  "- [x] Freeze the branch",
  "- [ ] Write the [changelog](https://example.com)",
  "  - [~] Collect the screenshots",
  "",
  "```",
  "- [ ] not a task",
  "```",
  "",
  "## Questions",
  "",
  "- [ ] Ship on Friday?",
  "",
  "## Later",
  "",
  "- [-] Dropped idea",
  "- [ ] Archive old boards",
  "",
].join("\n");

const noLabels = () => undefined;

describe("scratchpadSearchTasks", () => {
  it("keeps the remaining work as plain text, with its section", () => {
    expect(scratchpadSearchTasks(NOTE, noLabels, "Unavailable")).toEqual([
      { index: 0, text: "Call the bank", section: null },
      { index: 2, text: "Write the changelog", section: "Release" },
      { index: 3, text: "Collect the screenshots", section: "Release" },
      { index: 6, text: "Archive old boards", section: "Later" },
    ]);
  });

  it("never prints the stored label of a typed mention", () => {
    const note = [
      "## Sync with [@Old team](mention:project/p1)",
      "",
      "- [ ] Ask [@Old name](mention:member/u1) about [@Secret](mention:page/x1)",
      "- [ ] Review [@Stale](mention:issue/i1)",
    ].join("\n");
    const labels: Record<string, string | null> = {
      "project:p1": "Website",
      "member:u1": "Camille Roy",
      "page:x1": null,
    };
    const rows = scratchpadSearchTasks(note, (type, id) => labels[`${type}:${id}`], "Unavailable");
    expect(rows).toEqual([
      { index: 0, text: "Ask @Camille Roy about @Unavailable", section: "Sync with @Website" },
      { index: 1, text: "Review @…", section: "Sync with @Website" },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/Old|Secret|Stale/);
  });

  it("finds nothing in an empty or task-less note", () => {
    expect(scratchpadSearchTasks("", noLabels, "Unavailable")).toEqual([]);
    expect(scratchpadSearchTasks("# Notes\n\nJust prose.", noLabels, "Unavailable")).toEqual([]);
  });
});

describe("findTaskItemPos", () => {
  it("lands each row on its own task item in the notebook", () => {
    const editor = notebook(NOTE);
    for (const row of scratchpadSearchTasks(NOTE, noLabels, "Unavailable")) {
      const pos = findTaskItemPos(editor, row.index);
      expect(pos).not.toBeNull();
      const item = editor.state.doc.nodeAt(pos!);
      expect(item?.type.name).toBe("taskItem");
      // A parent item also holds its subtasks: compare its own first line.
      expect(item?.firstChild?.textContent).toBe(row.text);
      // Where the notebook puts the caret: the end of that task's own line.
      editor.commands.setTextSelection(pos! + 2 + item!.firstChild!.content.size);
      const { $from } = editor.state.selection;
      expect($from.parent.textContent).toBe(row.text);
      expect($from.parentOffset).toBe($from.parent.content.size);
    }
  });

  it("blinks the task the palette opened, and only that one", () => {
    vi.useFakeTimers();
    try {
      const editor = notebook(NOTE);
      const pos = findTaskItemPos(editor, 2)!;
      const unflash = flashBlockAt(editor, pos);
      const lit = blockFlashKey.getState(editor.state)!.find();
      expect(lit).toHaveLength(1);
      expect(editor.state.doc.nodeAt(lit[0].from)?.firstChild?.textContent).toBe("Write the changelog");
      expect((editor.view.nodeDOM(pos) as HTMLElement).classList.contains("page-block-target")).toBe(true);
      vi.advanceTimersByTime(FLASH_MS);
      expect(blockFlashKey.getState(editor.state)!.find()).toHaveLength(0);
      unflash();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null past the last task or for an invalid index", () => {
    const editor = notebook("- [ ] Only one\n");
    expect(findTaskItemPos(editor, 1)).toBeNull();
    expect(findTaskItemPos(editor, -1)).toBeNull();
    expect(findTaskItemPos(editor, 0.5)).toBeNull();
  });
});
