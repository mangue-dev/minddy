import type { Editor, NodeViewRenderer } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { SigmaIcon } from "@hugeicons/core-free-icons";
import katex from "katex";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

/**
 * EQUATIONS, inline and as a block, rendered with KaTeX.
 *
 * The nodes are the ones of `@tiptap/extension-mathematics`: their schema
 * (`latex` attribute, `span[data-type="inline-math"]` and
 * `div[data-type="block-math"]`), commands and input rules (`$$x$$` typed in a
 * line, `$$$x$$$` alone on one). What this file adds is what Minddy needs
 * around them:
 *
 * - the MARKDOWN in both directions. The package's own Markdown hooks target
 *   `@tiptap/markdown`; this editor serializes with tiptap-markdown, so the
 *   rules live here. Inline math is `$latex$`, block math a `$$` fence on its
 *   own lines. Reading follows Pandoc's `tex_math_dollars`: no whitespace just
 *   inside the delimiters and no digit right after the closing `$`, so
 *   “costs $5 and $10” stays text;
 * - a node view that renders with `throwOnError: false` (invalid LaTeX shows
 *   KaTeX's red source instead of breaking the line), says when an equation is
 *   empty, and lets a wide block scroll;
 * - the hook that opens the LaTeX editor on click or ↵
 *   (components/editor/math-edit-menu.tsx): the registry is headless, so the
 *   surface sets `storage.blockMath.edit`, like the image picker.
 */

declare module "@tiptap/core" {
  interface Storage {
    blockMath: MathEditStorage;
  }
}

export interface MathEditStorage {
  /** Opens the LaTeX editor for the equation at `pos`. Set by the surface. */
  edit: ((pos: number) => void) | null;
  markdown?: unknown;
}

export const INLINE_MATH_NODE = "inlineMath";
export const BLOCK_MATH_NODE = "blockMath";

/** The icon of equations, shared with the selection toolbar. */
export const MATH_ICON = SigmaIcon;

export function isMathNode(node: PMNode | null | undefined): boolean {
  const name = node?.type.name;
  return name === INLINE_MATH_NODE || name === BLOCK_MATH_NODE;
}

/* ── Labels of the node view ────────────────────────────────────────────── */

/** Set by the editor from the catalog (the registry has no translator). */
const labels = { empty: "Empty equation" };

export function setMathLabels(next: { empty: string }): void {
  labels.empty = next.empty;
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

/** Renders `latex` into `target`. Never throws: a parse error is drawn by
    KaTeX itself (`throwOnError: false`), anything else falls back to text. */
export function renderMath(latex: string, target: HTMLElement, displayMode: boolean): void {
  try {
    katex.render(latex, target, { throwOnError: false, displayMode });
  } catch {
    target.textContent = latex;
  }
}

/** The KaTeX error for `latex`, or `null` when it renders. */
export function mathError(latex: string, displayMode: boolean): string | null {
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function mathNodeView(displayMode: boolean): NodeViewRenderer {
  return ({ node }) => {
    const dom = document.createElement(displayMode ? "div" : "span");
    dom.dataset.type = displayMode ? "block-math" : "inline-math";
    dom.className = displayMode ? "page-math page-math-block" : "page-math page-math-inline";
    // A wide display equation scrolls inside its block rather than widening
    // the page column.
    const target = displayMode ? document.createElement("div") : dom;
    if (displayMode) {
      target.className = "page-math-scroll";
      dom.append(target);
    }
    let current = node;
    const render = () => {
      const latex = String(current.attrs.latex ?? "");
      dom.setAttribute("data-latex", latex);
      if (!latex.trim()) {
        dom.classList.add("is-empty");
        target.textContent = labels.empty;
        return;
      }
      dom.classList.remove("is-empty");
      renderMath(latex, target, displayMode);
    };
    render();
    return {
      dom,
      update(next) {
        if (next.type !== current.type) return false;
        const changed = next.attrs.latex !== current.attrs.latex;
        current = next;
        if (changed) render();
        return true;
      },
      // KaTeX owns the subtree; nothing in it is document content.
      ignoreMutation: () => true,
    };
  };
}

/* ── Markdown: writing ──────────────────────────────────────────────────── */

function latexOf(node: MarkdownNode): string {
  return typeof node.attrs.latex === "string" ? node.attrs.latex.trim() : "";
}

function inlineMathToMarkdown(state: MarkdownState, node: MarkdownNode): void {
  const latex = latexOf(node);
  // An empty equation is not content: it writes nothing.
  if (latex) state.write(`$${latex}$`);
}

function blockMathToMarkdown(state: MarkdownState, node: MarkdownNode): void {
  const latex = latexOf(node);
  if (!latex) return;
  // The code block's pattern: each line goes through `text`, so a fence in a
  // list item or a quote keeps that container's prefix on every line.
  state.write("$$\n");
  state.text(latex, false);
  state.write("\n");
  state.write("$$");
  state.closeBlock(node);
}

/* ── Markdown: the inline delimiter rule ────────────────────────────────── */

const SPACE = /\s/;
const DIGIT = /[0-9]/;

/**
 * The inline equation that starts at `pos` in `src`, or `null`.
 *
 * `$$latex$$` inside a line is read as an inline equation too (agents write
 * it); `$latex$` follows Pandoc's rule: a non-space right after the opening
 * `$`, a non-space right before the closing one, and no digit after it. The
 * closing `$` is the NEXT unescaped one: when it does not qualify the opening
 * `$` is plain text, which is what keeps “$5 and $10 or $x$” two prices and
 * one equation.
 */
export function matchInlineMath(
  src: string,
  pos: number,
  max = src.length
): { end: number; latex: string } | null {
  if (src[pos] !== "$") return null;
  if (src[pos + 1] === "$") {
    for (let i = pos + 2; i < max - 1; i += 1) {
      if (src[i] === "\\") {
        i += 1;
        continue;
      }
      if (src[i] === "$") {
        if (src[i + 1] !== "$") return null;
        const latex = src.slice(pos + 2, i).trim();
        return latex ? { end: i + 2, latex } : null;
      }
    }
    return null;
  }
  const first = src[pos + 1];
  if (first === undefined || pos + 1 >= max || SPACE.test(first)) return null;
  for (let i = pos + 1; i < max; i += 1) {
    if (src[i] === "\\") {
      i += 1;
      continue;
    }
    if (src[i] !== "$") continue;
    if (SPACE.test(src[i - 1])) return null;
    if (i + 1 < max && DIGIT.test(src[i + 1])) return null;
    return { end: i + 1, latex: src.slice(pos + 1, i) };
  }
  return null;
}

/**
 * Markdown text in which no `$` opens an equation any more: each `$` that
 * would is written `\$`. A text node that says “$x$” literally (typed, not an
 * equation) must read back as text, and an escaped dollar reads back as a
 * dollar. Prices are left alone, since they never match.
 *
 * Escaping one opener can turn a later `$` into the closer of an earlier one,
 * so the scan starts over after each escape until nothing matches.
 */
export function escapeMathDelimiters(markdown: string): string {
  if (!markdown.includes("$")) return markdown;
  let out = markdown;
  for (;;) {
    let escaped = false;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] === "\\") {
        i += 1;
        continue;
      }
      if (out[i] === "$" && matchInlineMath(out, i)) {
        out = `${out.slice(0, i)}\\${out.slice(i)}`;
        escaped = true;
        break;
      }
    }
    if (!escaped) return out;
  }
}

/**
 * Serializes one text node through `write`, then escapes the dollars of what
 * it wrote (see `escapeMathDelimiters`). It runs on the Markdown the text
 * produced, after the serializer's own escaping, so the backslashes it reads
 * are the ones a parser will see.
 */
export function writeTextEscapingMath(state: MarkdownState, write: () => void): void {
  const writer = state as MarkdownState & { out: string };
  // Flush what is pending (a closed block, a container prefix) first, so the
  // slice below holds this text alone.
  writer.write("");
  const start = writer.out.length;
  write();
  const written = writer.out.slice(start);
  if (written.includes("$")) {
    writer.out = writer.out.slice(0, start) + escapeMathDelimiters(written);
  }
}

/* ── Markdown: reading (markdown-it) ────────────────────────────────────── */

// Minimal form of the markdown-it pieces this touches — same bias as
// components/scratchpad/task-markdown.ts: the package is a transitive
// dependency of tiptap-markdown, and nothing here relies on its types.
interface MdToken {
  content: string;
  markup: string;
  block: boolean;
  map: [number, number] | null;
}
interface MdInlineState {
  src: string;
  pos: number;
  posMax: number;
  push(type: string, tag: string, nesting: number): MdToken;
}
interface MdBlockState {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  sCount: number[];
  blkIndent: number;
  line: number;
  push(type: string, tag: string, nesting: number): MdToken;
}
interface MarkdownIt {
  inline: {
    ruler: {
      after(
        after: string,
        name: string,
        fn: (state: MdInlineState, silent: boolean) => boolean
      ): void;
    };
  };
  block: {
    ruler: {
      before(
        before: string,
        name: string,
        fn: (state: MdBlockState, startLine: number, endLine: number, silent: boolean) => boolean,
        options?: { alt: string[] }
      ): void;
    };
  };
  renderer: { rules: Record<string, (tokens: MdToken[], index: number) => string> };
}

const INLINE_TOKEN = "minddy_math_inline";
const BLOCK_TOKEN = "minddy_math_block";

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMathRule(state: MdInlineState, silent: boolean): boolean {
  const match = matchInlineMath(state.src, state.pos, state.posMax);
  if (!match) return false;
  if (!silent) {
    const token = state.push(INLINE_TOKEN, "span", 0);
    token.content = match.latex;
    token.markup = "$";
  }
  state.pos = match.end;
  return true;
}

/**
 * A `$$` fence: `$$` opens a line, and the block ends on the first line that
 * ends with `$$` (`$$ x $$` on one line works too). An unclosed fence is not
 * an equation, and the lines stay a paragraph.
 */
function blockMathRule(
  state: MdBlockState,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const end = state.eMarks[startLine];
  if (state.src.slice(start, start + 2) !== "$$") return false;
  const rest = state.src.slice(start + 2, end).trim();

  const lines: string[] = [];
  let last = startLine;
  let closed = false;
  if (rest.length >= 2 && rest.endsWith("$$")) {
    lines.push(rest.slice(0, -2));
    closed = true;
  } else {
    if (rest) lines.push(rest);
    for (let line = startLine + 1; line < endLine; line += 1) {
      // A line outdented out of the container (a list item) ends the search.
      if (state.sCount[line] < state.blkIndent) break;
      const from = state.bMarks[line] + Math.min(state.tShift[line], state.blkIndent);
      const text = state.src.slice(from, state.eMarks[line]);
      if (text.trimEnd().endsWith("$$")) {
        lines.push(text.trimEnd().slice(0, -2));
        last = line;
        closed = true;
        break;
      }
      lines.push(text);
    }
  }
  const latex = lines.join("\n").trim();
  if (!closed || !latex) return false;
  if (silent) return true;
  state.line = last + 1;
  const token = state.push(BLOCK_TOKEN, "div", 0);
  token.block = true;
  token.content = latex;
  token.markup = "$$";
  token.map = [startLine, state.line];
  return true;
}

// tiptap-markdown runs every `setup` before each parse, on the same instance.
const installed = new WeakSet<object>();

function mathMarkdownIt(md: MarkdownIt): void {
  if (installed.has(md)) return;
  installed.add(md);
  // After `escape`, so `\$` stays a dollar; before backticks, which never see
  // a `$` at the position this rule is tried (a code span is consumed from
  // its opening backtick).
  md.inline.ruler.after("escape", INLINE_TOKEN, inlineMathRule);
  md.block.ruler.before("fence", BLOCK_TOKEN, blockMathRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  // The reading path is markdown-it → HTML → the nodes' `parseHTML`.
  md.renderer.rules[INLINE_TOKEN] = (tokens, index) =>
    `<span data-type="inline-math" data-latex="${escapeAttribute(tokens[index].content)}"></span>`;
  md.renderer.rules[BLOCK_TOKEN] = (tokens, index) =>
    `<div data-type="block-math" data-latex="${escapeAttribute(tokens[index].content)}"></div>\n`;
}

/* ── The nodes ──────────────────────────────────────────────────────────── */

const PageInlineMath = InlineMath.extend({
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: { serialize: inlineMathToMarkdown, parse: {} },
    };
  },
  addNodeView() {
    return mathNodeView(false);
  },
});

const PageBlockMath = BlockMath.extend({
  addStorage(): MathEditStorage {
    return { ...this.parent?.(), edit: null };
  },

  addNodeView() {
    return mathNodeView(true);
  },

  addKeyboardShortcuts() {
    return {
      // ↵ on a selected equation edits it, as a click does.
      Enter: () => {
        const { selection } = this.editor.state;
        const edit = this.editor.storage.blockMath?.edit;
        if (!edit || !(selection instanceof NodeSelection) || !isMathNode(selection.node)) {
          return false;
        }
        edit(selection.from);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey("pageMathEdit"),
        props: {
          handleClickOn(view, _pos, node, nodePos, _event, direct) {
            if (!direct || !view.editable || !isMathNode(node)) return false;
            const edit = editor.storage.blockMath?.edit;
            if (!edit) return false;
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
            edit(nodePos);
            return true;
          },
        },
      }),
    ];
  },
});

/* ── Selection helpers (the selection toolbar) ──────────────────────────── */

/** Whether the selection is an inline equation. */
export function inlineMathActive(editor: Editor): boolean {
  const { selection } = editor.state;
  return selection instanceof NodeSelection && selection.node.type.name === INLINE_MATH_NODE;
}

/**
 * Turns the selected text into an inline equation whose LaTeX is that text,
 * or a selected inline equation back into its LaTeX as text (selected).
 *
 * `false`, changing nothing, when there is nothing to turn: an empty or
 * whitespace-only selection, one spanning several blocks, or a schema without
 * inline equations.
 */
export function toggleInlineMath(editor: Editor): boolean {
  const type = editor.schema.nodes[INLINE_MATH_NODE];
  if (!type || !editor.isEditable) return false;
  const { state } = editor;
  const { selection } = state;

  if (selection instanceof NodeSelection && selection.node.type === type) {
    const latex = String(selection.node.attrs.latex ?? "");
    if (!latex) {
      return editor.chain().focus().deleteSelection().run();
    }
    const from = selection.from;
    const tr = state.tr.replaceWith(from, selection.to, state.schema.text(latex, selection.$from.marks()));
    tr.setSelection(TextSelection.create(tr.doc, from, from + latex.length));
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
    return true;
  }

  const { from, to, $from, $to, empty } = selection;
  if (empty || !$from.sameParent($to) || !$from.parent.inlineContent) return false;
  // A code block holds text only.
  if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) return false;
  const latex = state.doc
    .textBetween(from, to, "", (leaf) => (leaf.type === type ? String(leaf.attrs.latex ?? "") : ""))
    .trim();
  if (!latex) return false;
  const node = type.create({ latex });
  const tr = state.tr.replaceRangeWith(from, to, node);
  tr.setSelection(NodeSelection.create(tr.doc, from));
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
  return true;
}

/** Position of the empty block equation closest before `pos`, if any. */
function emptyBlockMathBefore(editor: Editor, pos: number): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, at) => {
    if (at > pos) return false;
    if (node.type.name === BLOCK_MATH_NODE && !String(node.attrs.latex ?? "").trim()) found = at;
    return true;
  });
  return found;
}

/* ── The descriptor ─────────────────────────────────────────────────────── */

export const mathBlock: PageBlock = {
  id: "equation",
  nodeName: BLOCK_MATH_NODE,
  // Both nodes ride with the block: inline equations exist wherever the block
  // set is mounted, which is everywhere text formatting is.
  extensions: [PageBlockMath, PageInlineMath],
  icon: MATH_ICON,
  labelKey: "blockEquation",
  slash: {
    group: "advanced",
    order: 2.5,
    keywords: [
      "equation",
      "math",
      "latex",
      "katex",
      "tex",
      "formula",
      "$$",
      "équation",
      "formule",
      "mathématiques",
      "gleichung",
      "formel",
      "ecuación",
      "fórmula",
      "equazione",
      "equação",
    ],
  },
  // An equation is not a reading of the current text; it is inserted, then
  // written in its own editor.
  turnInto: false,
  insert: (editor, range) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({ type: BLOCK_MATH_NODE, attrs: { latex: "" } })
      .run();
    const pos = emptyBlockMathBefore(editor, editor.state.selection.from);
    if (pos === null) return;
    editor.commands.setNodeSelection(pos);
    editor.storage.blockMath?.edit?.(pos);
  },
  isActive: (editor) => editor.isActive(BLOCK_MATH_NODE),
  markdown: {
    sample: "$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$",
    toMarkdown: blockMathToMarkdown,
    fromMarkdown: (markdownit) => mathMarkdownIt(markdownit as MarkdownIt),
  },
};
