// @vitest-environment jsdom
// Space on a hovered card opens it, wherever focus was left by an earlier
// click; only a control the keyboard focused inside the card keeps Space.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useIssueFieldShortcuts } from "@/components/issue-field-shortcuts";
import { trackKeyboardModality } from "@/lib/keyboard-modality";

let container: HTMLDivElement;
let root: Root;
let stopModality: () => void;
const openA = vi.fn();
const openB = vi.fn();

function Card({ name, onOpen }: { name: string; onOpen: () => void }) {
  const { containerProps } = useIssueFieldShortcuts(true, { " ": onOpen });
  return (
    // The drag wrapper: the card's own focus stop, around the region.
    <div tabIndex={0} data-testid={`${name}-wrapper`}>
      <div {...containerProps} data-testid={name}>
        <button type="button" data-testid={`${name}-status`} />
      </div>
    </div>
  );
}

const byId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement;

/** jsdom never matches `:hover`: mark the hovered region by hand. */
const nativeMatches = Element.prototype.matches;
function hover(id: string | null) {
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    if (selector !== ":hover") return nativeMatches.call(this, selector);
    return id !== null && this.contains(byId(id));
  });
}

function press(target: Element, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  stopModality = trackKeyboardModality();
  act(() =>
    root.render(
      <>
        <Card name="a" onOpen={openA} />
        <Card name="b" onOpen={openB} />
        <button type="button" data-testid="toolbar" />
      </>,
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
  stopModality();
  openA.mockReset();
  openB.mockReset();
});

it("opens the hovered card when an earlier click left focus on a button elsewhere", () => {
  window.dispatchEvent(new Event("pointerdown"));
  hover("b");
  for (const focused of ["toolbar", "a-status"]) {
    byId(focused).focus();
    const event = press(byId(focused), " ");
    // Taken by the hovered card, so the focused button is not pressed.
    expect(event.defaultPrevented).toBe(true);
  }
  expect(openB).toHaveBeenCalledTimes(2);
  expect(openA).not.toHaveBeenCalled();
});

it("opens the hovered card when a click left focus on one of its own buttons", () => {
  window.dispatchEvent(new Event("pointerdown"));
  hover("b");
  byId("b-status").focus();
  expect(press(byId("b-status"), " ").defaultPrevented).toBe(true);
  expect(openB).toHaveBeenCalledTimes(1);
});

it("leaves Space to a button the keyboard focused inside the card", () => {
  hover(null);
  press(document.body, "Tab");
  byId("b-status").focus();
  expect(press(byId("b-status"), " ").defaultPrevented).toBe(false);
  expect(openB).not.toHaveBeenCalled();
});

it("opens the card from its own focus stop after Tab", () => {
  hover(null);
  press(document.body, "Tab");
  byId("b-wrapper").focus();
  expect(press(byId("b-wrapper"), " ").defaultPrevented).toBe(true);
  expect(openB).toHaveBeenCalledTimes(1);
});
