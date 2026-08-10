// @vitest-environment jsdom
//
// L'aller-retour markdown ⇄ éditeur du carnet, joué en entier sur un VRAI
// éditeur TipTap (sans React : la vue de la tâche vit à part, cf. task-nodes.ts).
// C'est le seul endroit d'où l'on voit ce que le carnet ENREGISTRE vraiment —
// à l'écran, une sous-tâche a la même tête qu'elle soit imbriquée ou non, et les
// deux défauts corrigés ici (liste « lâche », arbre aplati au collage) ne se
// lisaient que dans le markdown, c'est-à-dire chez l'agent qui le reçoit.
import { describe, expect, it } from "vitest";
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

function makeEditor(content = "") {
  return new Editor({
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
}

function md(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}

/** La position et le nœud de la `n`-ième tâche du document (ordre du document). */
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

describe("sérialisation du carnet", () => {
  it("n'insère pas de ligne blanche entre les tâches", () => {
    expect(md(makeEditor("- [ ] a\n- [~] b"))).toBe("- [ ] a\n- [~] b");
  });

  it("garde l'imbrication et son pas de deux espaces", () => {
    expect(md(makeEditor(NESTED))).toBe(NESTED);
  });

  it("est stable d'un aller-retour au suivant", () => {
    const once = md(makeEditor(NESTED));
    expect(md(makeEditor(once))).toBe(once);
  });

  it("relit les profondeurs comme parsePlan les compte", () => {
    expect(parsePlan(md(makeEditor(NESTED))).tasks.map((t) => t.depth)).toEqual([
      0, 1, 2, 0,
    ]);
  });
});

describe("coller du markdown à sous-tâches", () => {
  it("dans un carnet vide", () => {
    const e = makeEditor("");
    expect(pasteScratchpadMarkdown(e, NESTED)).toBe(true);
    expect(md(e)).toBe(NESTED);
  });

  it("le curseur dans un paragraphe de prose — la liste arrive en bloc", () => {
    const e = makeEditor("intro");
    e.commands.focus("end");
    pasteScratchpadMarkdown(e, NESTED);
    expect(md(e)).toBe(`intro\n\n${NESTED}`);
  });

  it("le curseur sur la tâche vide qu'on vient d'ouvrir", () => {
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

describe("un geste sur une tâche emporte ses sous-tâches", () => {
  it("sort le sous-arbre entier, ramené au premier niveau", () => {
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

  it("ne colle pas le texte des enfants à celui du parent", () => {
    const e = makeEditor(NESTED);
    expect(taskItemLines(taskAt(e, 0).node)[0].text).toBe("parent");
  });

  it("démarrer un parent démarre ce qu'il reste à faire en dessous", () => {
    const e = makeEditor("- [ ] parent\n  - [ ] child\n  - [x] fait\n- [ ] sib");
    const { pos, node } = taskAt(e, 0);
    expect(startPendingTasks(e, pos, pos + node.nodeSize)).toBe(2);
    expect(md(e)).toBe("- [~] parent\n  - [~] child\n  - [x] fait\n- [ ] sib");
  });

  it("un parent déjà en cours démarre quand même sa descendance", () => {
    const e = makeEditor("- [~] parent\n  - [ ] child");
    const { pos, node } = taskAt(e, 0);
    expect(startPendingTasks(e, pos, pos + node.nodeSize)).toBe(1);
    expect(md(e)).toBe("- [~] parent\n  - [~] child");
  });

  it("mais un enfant ne démarre pas son parent", () => {
    const e = makeEditor("- [ ] parent\n  - [ ] child");
    const { pos, node } = taskAt(e, 1);
    expect(startPendingTasks(e, pos, pos + node.nodeSize)).toBe(1);
    expect(md(e)).toBe("- [ ] parent\n  - [~] child");
  });
});
