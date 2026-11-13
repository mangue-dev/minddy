// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { trackPressState } from "./press-state";

function pointer(type: string, target: Element, x = 10, y = 10, pointerType = "touch") {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientX: x, clientY: y, pointerType });
  target.dispatchEvent(event);
}

afterEach(() => document.body.replaceChildren());

it("marks the control under a held finger, and releases it on lift, scroll or drift", () => {
  const stop = trackPressState();
  const button = document.createElement("button");
  const icon = document.createElement("span");
  button.append(icon);
  document.body.append(button);

  pointer("pointerdown", icon);
  expect(button.hasAttribute("data-pressed")).toBe(true);
  pointer("pointerup", icon);
  expect(button.hasAttribute("data-pressed")).toBe(false);

  pointer("pointerdown", icon);
  pointer("pointermove", icon, 40, 10);
  expect(button.hasAttribute("data-pressed")).toBe(false);

  // A mouse keeps its hover and :active styles.
  pointer("pointerdown", icon, 10, 10, "mouse");
  expect(button.hasAttribute("data-pressed")).toBe(false);

  button.disabled = true;
  pointer("pointerdown", icon);
  expect(button.hasAttribute("data-pressed")).toBe(false);
  stop();
});
