// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { revealCaretClearOfFade } from "./use-scroll-fade";

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

/** A scroller of 100px over 300px of text; jsdom has no layout of its own. */
function scroller(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.append(el);
  let top = 0;
  Object.defineProperty(el, "clientHeight", { value: 100 });
  Object.defineProperty(el, "scrollHeight", { value: 300 });
  Object.defineProperty(el, "scrollTop", { get: () => top, set: (next: number) => { top = next; } });
  return el;
}

function placeCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

it("scrolls to the very bottom while typing at the end, which lifts the trailing fade", () => {
  const el = scroller("<div>first</div><div>last line</div>");
  placeCaret(el.lastChild!.firstChild!, "last line".length);
  revealCaretClearOfFade(el, 20);
  expect(el.scrollTop).toBe(300);
});

it("counts an empty line after the caret as the end", () => {
  const el = scroller("<div>first</div><div><br></div>");
  placeCaret(el.lastChild!, 0);
  revealCaretClearOfFade(el, 20);
  expect(el.scrollTop).toBe(300);
});

it("leaves the scroll alone when the caret is not in the scroller", () => {
  const el = scroller("<div>text</div>");
  const outside = document.body.appendChild(document.createElement("p"));
  outside.textContent = "elsewhere";
  placeCaret(outside.firstChild!, 2);
  revealCaretClearOfFade(el, 20);
  expect(el.scrollTop).toBe(0);
});
