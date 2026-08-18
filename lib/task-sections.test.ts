// @vitest-environment jsdom
//
// The section of a task, played on a REAL page document.
//
// This is the only channel through which a task entrusted to an agent takes away something
// locate (MIN-274): “restart the cron” under “Deployment” is not there
// same task as under “Ideas”. Nothing indicates the error if this path is
// mislead — the prompt still leaves, it just describes something else. Gentle
// file: we create the actual layout of the pages, we write markdown, and we
// asks each task in the document where it believes it lives.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import { taskSectionHeadings } from "@/lib/task-sections";

/** A PAGE editor without a node view, and the markdown loaded into it. */
function pageWith(markdown: string): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: pageExtensions({ headless: true }) as never,
  });
  editor.commands.setContent(markdown);
  return editor;
}

/** The section of the `n`-th task of the document, in reading order. */
function sectionOf(editor: Editor, index: number): string[] {
  const found: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "taskItem") found.push(pos);
    return true;
  });
  return taskSectionHeadings(editor, found[index]);
}

describe("la section d'une tâche de page", () => {
  it("porte la chaîne ENTIÈRE des titres qui la contiennent", () => {
    const editor = pageWith(
      "# Pull requests\n\n## Sidebar\n\n- [ ] relancer le cron\n"
    );
    expect(sectionOf(editor, 0)).toEqual(["# Pull requests", "## Sidebar"]);
    editor.destroy();
  });

  it("ne prend pas la section d'à côté pour la sienne", () => {
    const editor = pageWith(
      [
        "# Post-mortem",
        "",
        "## Ce qui a cassé",
        "",
        "- [x] identifier la requête",
        "",
        "## Suites",
        "",
        "- [ ] relancer le cron",
        "",
      ].join("\n")
    );
    expect(sectionOf(editor, 0)).toEqual([
      "# Post-mortem",
      "## Ce qui a cassé",
    ]);
    // The previous section is CLOSED by its sister of the same rank: the second
    // task was never part of it.
    expect(sectionOf(editor, 1)).toEqual(["# Post-mortem", "## Suites"]);
    editor.destroy();
  });

  it("ne donne rien à une tâche écrite avant tout titre", () => {
    const editor = pageWith("- [ ] écrire le compte-rendu\n\n# Plus tard\n");
    expect(sectionOf(editor, 0)).toEqual([]);
    editor.destroy();
  });

  it("donne à une SOUS-tâche la section de son parent", () => {
    const editor = pageWith(
      "## Suites\n\n- [ ] relancer le cron\n  - [ ] vérifier les logs\n"
    );
    // The subtask is NESTED (otherwise the case would prove nothing):
    // it is from its first level block that we go back, not from itself.
    const depths: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "taskItem")
        depths.push(editor.state.doc.resolve(pos).depth);
      return true;
    });
    expect(depths[1]).toBeGreaterThan(depths[0]);

    expect(sectionOf(editor, 0)).toEqual(["## Suites"]);
    expect(sectionOf(editor, 1)).toEqual(["## Suites"]);
    editor.destroy();
  });

  it("rend le vide plutôt que de deviner, hors du document", () => {
    const editor = pageWith("# Titre\n\n- [ ] une tâche\n");
    expect(taskSectionHeadings(editor, undefined)).toEqual([]);
    expect(taskSectionHeadings(editor, -1)).toEqual([]);
    expect(
      taskSectionHeadings(editor, editor.state.doc.content.size + 10)
    ).toEqual([]);
    editor.destroy();
  });
});
