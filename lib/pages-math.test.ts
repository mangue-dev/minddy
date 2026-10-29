// @vitest-environment jsdom
//
// Equations (components/pages/blocks/math.ts): their Markdown in both
// directions, the dollar rule that keeps prices text, and the selection helper
// the toolbar calls.
import { describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { pageExtensions } from "@/components/pages/page-extensions";
import {
  escapeMathDelimiters,
  inlineMathActive,
  matchInlineMath,
  mathError,
  toggleInlineMath,
} from "@/components/pages/blocks/math";
import { bodyFromMarkdown, bodyToMarkdown } from "@/lib/pages-markdown";

function roundTrip(markdown: string, profile?: "page" | "document" | "notebook"): string {
  return bodyToMarkdown(bodyFromMarkdown(markdown, profile), profile);
}

function nodesOf(json: JSONContent, type: string): JSONContent[] {
  const found: JSONContent[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === type) found.push(node);
    node.content?.forEach(visit);
  };
  visit(json);
  return found;
}

const latexOf = (json: JSONContent, type: string) =>
  nodesOf(json, type).map((node) => node.attrs?.latex);

describe("equations in Markdown", () => {
  it("read `$latex$` as an inline equation and write it back", () => {
    const markdown = "Mass and energy: $E = mc^2$, always.";
    expect(latexOf(bodyFromMarkdown(markdown), "inlineMath")).toEqual(["E = mc^2"]);
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("read a `$$` fence as a block equation, multi-line LaTeX included", () => {
    const markdown = "$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$";
    expect(latexOf(bodyFromMarkdown(markdown), "blockMath")).toEqual([
      "\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}",
    ]);
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("read the one-line `$$ x $$` and an inline `$$x$$` agents write", () => {
    expect(latexOf(bodyFromMarkdown("$$ x^2 $$"), "blockMath")).toEqual(["x^2"]);
    expect(roundTrip("$$ x^2 $$")).toBe("$$\nx^2\n$$");
    const inline = bodyFromMarkdown("Then $$y = 2x$$ follows.");
    expect(latexOf(inline, "inlineMath")).toEqual(["y = 2x"]);
    expect(bodyToMarkdown(inline)).toBe("Then $y = 2x$ follows.");
  });

  it("write the JSON nodes as `$…$` and a `$$` fence", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Let " },
            { type: "inlineMath", attrs: { latex: "\\alpha" } },
            { type: "text", text: " be small." },
          ],
        },
        { type: "blockMath", attrs: { latex: "\\sum_{i=1}^n i" } },
      ],
    };
    expect(bodyToMarkdown(doc)).toBe("Let $\\alpha$ be small.\n\n$$\n\\sum_{i=1}^n i\n$$");
  });

  it("keep a block equation inside a list item", () => {
    const markdown = "- A step\n\n  $$\n  x + 1\n  $$";
    expect(latexOf(bodyFromMarkdown(markdown), "blockMath")).toEqual(["x + 1"]);
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("exist in the document set too (descriptions, notebook)", () => {
    const markdown = "Inline $a^2$ here.\n\n$$\nb^2\n$$";
    expect(roundTrip(markdown, "document")).toBe(markdown);
    expect(latexOf(bodyFromMarkdown(markdown, "notebook"), "inlineMath")).toEqual(["a^2"]);
  });

  it("write nothing for an empty equation", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "blockMath", attrs: { latex: "  " } },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    };
    expect(bodyToMarkdown(doc)).toBe("Before\n\nAfter");
  });
});

describe("dollars that are not equations", () => {
  it("leave prices as text, both ways", () => {
    for (const markdown of [
      "It costs $5 and $10.",
      "Between $5 and $ 10, more or less.",
      "A budget of $1,000 to $2,000.",
    ]) {
      const json = bodyFromMarkdown(markdown);
      expect(nodesOf(json, "inlineMath"), markdown).toEqual([]);
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });

  it("follow Pandoc: no space inside the delimiters, no digit after the closer", () => {
    expect(matchInlineMath("$x$", 0)?.latex).toBe("x");
    expect(matchInlineMath("$ x$", 0)).toBeNull();
    expect(matchInlineMath("$x $", 0)).toBeNull();
    expect(matchInlineMath("$x$5", 0)).toBeNull();
    expect(matchInlineMath("$x$.", 0)?.latex).toBe("x");
    expect(matchInlineMath("$\\$5$", 0)?.latex).toBe("\\$5");
    // Two prices and one equation.
    const json = bodyFromMarkdown("From $5 and $10 to $x$.");
    expect(latexOf(json, "inlineMath")).toEqual(["x"]);
  });

  it("escape a literal `$x$` typed as text so it reads back as text", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Write $x$ for math." }] }],
    };
    const markdown = bodyToMarkdown(doc);
    expect(markdown).toBe("Write \\$x$ for math.");
    const back = bodyFromMarkdown(markdown);
    expect(nodesOf(back, "inlineMath")).toEqual([]);
    expect(bodyToMarkdown(back)).toBe(markdown);
    expect(nodesOf(back, "text").map((node) => node.text).join("")).toBe("Write $x$ for math.");
  });

  it("escape again when one escape makes a later dollar a closer", () => {
    // `$a $b$c`: only `$b$` matches at first; once it is escaped, `$a $b$`
    // would close on the remaining dollar unless it is escaped too.
    const escaped = escapeMathDelimiters("$a \\$b$c");
    for (let i = 0; i < escaped.length; i += 1) {
      if (escaped[i] === "\\") {
        i += 1;
        continue;
      }
      expect(matchInlineMath(escaped, i), escaped).toBeNull();
    }
  });

  it("leave dollars in code alone", () => {
    for (const markdown of ["Run `echo $HOME$` now.", "```sh\necho $$\n$$\n```"]) {
      const json = bodyFromMarkdown(markdown);
      expect(nodesOf(json, "inlineMath"), markdown).toEqual([]);
      expect(nodesOf(json, "blockMath"), markdown).toEqual([]);
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });

  it("keep an unclosed fence as text", () => {
    const json = bodyFromMarkdown("$$\nno end");
    expect(nodesOf(json, "blockMath")).toEqual([]);
  });
});

describe("toggleInlineMath", () => {
  function editorWith(content: string | JSONContent) {
    return new Editor({
      element: document.createElement("div"),
      content,
      extensions: pageExtensions({ headless: true }),
    });
  }

  it("turns the selected text into an equation of that LaTeX, and back", () => {
    const editor = editorWith("Area a^2 here");
    try {
      // "a^2" sits at 6..9 inside the paragraph.
      editor.commands.setTextSelection({ from: 6, to: 9 });
      expect(toggleInlineMath(editor)).toBe(true);
      expect(latexOf(editor.getJSON(), "inlineMath")).toEqual(["a^2"]);
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect(inlineMathActive(editor)).toBe(true);

      expect(toggleInlineMath(editor)).toBe(true);
      expect(nodesOf(editor.getJSON(), "inlineMath")).toEqual([]);
      expect(editor.getText()).toBe("Area a^2 here");
      const { selection } = editor.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(editor.state.doc.textBetween(selection.from, selection.to)).toBe("a^2");
    } finally {
      editor.destroy();
    }
  });

  it("refuses an empty selection, a blank one, and code", () => {
    const editor = editorWith({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Text   here" }] },
        { type: "codeBlock", content: [{ type: "text", text: "code" }] },
      ],
    });
    try {
      editor.commands.setTextSelection(3);
      expect(toggleInlineMath(editor)).toBe(false);
      editor.commands.setTextSelection({ from: 5, to: 8 });
      expect(toggleInlineMath(editor)).toBe(false);
      const size = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: size - 4, to: size - 1 });
      expect(toggleInlineMath(editor)).toBe(false);
      expect(nodesOf(editor.getJSON(), "inlineMath")).toEqual([]);
    } finally {
      editor.destroy();
    }
  });
});

describe("the equation view and its editor hook", () => {
  function liveEditor(content: string) {
    return new Editor({
      element: document.createElement("div"),
      content,
      extensions: pageExtensions(),
    });
  }

  it("renders KaTeX, draws invalid LaTeX instead of throwing, and labels an empty one", () => {
    const editor = liveEditor("Inline $\\frac{$ here\n\n$$\nx^2\n$$");
    try {
      const dom = editor.view.dom;
      expect(dom.querySelector(".page-math-block .page-math-scroll .katex-display")).not.toBeNull();
      expect(dom.querySelector(".page-math-inline .katex-error")).not.toBeNull();
      expect(mathError("\\frac{", false)).toEqual(expect.any(String));
      expect(mathError("x^2", true)).toBeNull();

      editor.commands.insertContentAt(editor.state.doc.content.size, {
        type: "blockMath",
        attrs: { latex: "" },
      });
      expect(dom.querySelector(".page-math-block.is-empty")?.textContent).toBe("Empty equation");
    } finally {
      editor.destroy();
    }
  });

  it("opens the editor on a click or ↵ on an equation, only when editable", () => {
    const editor = liveEditor("$$\nx\n$$");
    const opened: number[] = [];
    editor.storage.blockMath.edit = (pos) => opened.push(pos);
    try {
      const node = editor.state.doc.nodeAt(0);
      const click = () =>
        editor.view.someProp("handleClickOn", (handle) =>
          handle(editor.view, 0, node!, 0, new MouseEvent("click"), true));
      expect(click()).toBe(true);
      expect(opened).toEqual([0]);
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);

      editor.commands.keyboardShortcut("Enter");
      expect(opened).toEqual([0, 0]);

      editor.setEditable(false);
      expect(click()).toBeFalsy();
      expect(opened).toEqual([0, 0]);
    } finally {
      editor.destroy();
    }
  });
});
