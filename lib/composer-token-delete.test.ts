// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { deleteComposerTokenBeforeCaret } from "./composer-token-delete";

afterEach(() => {
  document.body.replaceChildren();
});

function skillToken(): HTMLSpanElement {
  const token = document.createElement("span");
  token.contentEditable = "false";
  token.dataset.skillPath = ".agents/skills/release/SKILL.md";
  return token;
}

describe("composer token deletion", () => {
  it("removes a skill and its separator without moving away from surrounding text", () => {
    const editor = document.createElement("div");
    const before = document.createTextNode("Use ");
    const token = skillToken();
    const after = document.createTextNode("\u00a0for this release");
    editor.append(before, token, after);
    document.body.append(editor);
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(after, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(
      deleteComposerTokenBeforeCaret(editor, selection, "[data-skill-path]"),
    ).toBe(true);
    expect(editor.querySelector("[data-skill-path]")).toBeNull();
    expect(editor.textContent).toBe("Use for this release");
    expect(selection.anchorNode).toBe(after);
    expect(selection.anchorOffset).toBe(0);
  });

  it("does not intercept ordinary text deletion", () => {
    const editor = document.createElement("div");
    const text = document.createTextNode("Release");
    editor.append(text);
    document.body.append(editor);
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(text, text.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(
      deleteComposerTokenBeforeCaret(editor, selection, "[data-skill-path]"),
    ).toBe(false);
    expect(editor.textContent).toBe("Release");
  });

  it("does not remove a separator when the preceding node is not a skill", () => {
    const editor = document.createElement("div");
    editor.append(document.createElement("span"), "\u00a0");
    document.body.append(editor);
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(editor, 2);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(
      deleteComposerTokenBeforeCaret(editor, selection, "[data-skill-path]"),
    ).toBe(false);
    expect(editor.textContent).toBe("\u00a0");
  });
});
