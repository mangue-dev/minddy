// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";

import { keepFieldFocusOnPress } from "./keep-field-focus";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const outside = document.createElement("div");
document.body.append(outside);

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
});

function renderComposer() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <div data-testid="composer" onMouseDown={keepFieldFocusOnPress}>
        <textarea aria-label="field" />
        <button type="button">Send</button>
        <span>padding</span>
        {createPortal(<button type="button">Menu item</button>, outside)}
      </div>,
    );
  });
  const field = host.querySelector("textarea")!;
  const send = host.querySelector("button")!;
  return { field, send, padding: host.querySelector("span")!, menuItem: outside.querySelector("button")! };
}

function press(element: Element): boolean {
  const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("keepFieldFocusOnPress", () => {
  it("keeps the focus in the field when one of the composer's buttons is pressed", () => {
    const { field, send } = renderComposer();
    field.focus();
    expect(press(send)).toBe(true);
  });

  it("leaves a press alone when the field does not have the focus", () => {
    const { send } = renderComposer();
    expect(press(send)).toBe(false);
  });

  it("leaves presses outside a button, and in a portalled menu, alone", () => {
    const { field, padding, menuItem } = renderComposer();
    field.focus();
    expect(press(padding)).toBe(false);
    expect(press(menuItem)).toBe(false);
  });
});
