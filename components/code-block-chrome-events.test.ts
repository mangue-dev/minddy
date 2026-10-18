// @vitest-environment jsdom
//
// Clicks in a code block's header belong to the header (MIN-728): a click on
// the language label or chevron, nested in the picker's button, used to reach
// ProseMirror, which took the focus back and closed the language menu.
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { stopCodeBlockChromeEvent } = await import("./code-block-node-view");

function eventOn(target: Element, type = "mousedown"): Event {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

it("keeps clicks anywhere in the header, and leaves the code to ProseMirror", () => {
  const view = document.createElement("div");
  view.innerHTML =
    '<div class="code-block-node-header"><button><span class="label">TypeScript</span><svg></svg></button></div>' +
    "<pre><code>const a = 1;</code></pre>";
  const label = view.querySelector(".label")!;
  const code = view.querySelector("code")!;

  expect(stopCodeBlockChromeEvent({ event: eventOn(label) })).toBe(true);
  expect(stopCodeBlockChromeEvent({ event: eventOn(view.querySelector("svg")!) })).toBe(true);
  expect(stopCodeBlockChromeEvent({ event: eventOn(code) })).toBe(false);
  expect(stopCodeBlockChromeEvent({ event: eventOn(label, "dragstart") })).toBe(false);
});
