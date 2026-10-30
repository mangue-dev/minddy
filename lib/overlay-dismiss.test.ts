// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenOutsideClick } from "./overlay-dismiss";

let content: HTMLElement;
let outside: HTMLElement;
let stop: () => void;
let onOutside: ReturnType<typeof vi.fn<(event: MouseEvent) => void>>;

function press(target: Element) {
  target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = `
    <div data-slot="dialog-content"><p id="in-dialog"></p></div>
    <button id="trigger" aria-controls="pop"><span id="trigger-label"></span></button>
    <div id="outside"></div>
    <div data-slot="popover-content" id="pop"><span id="inside"></span></div>
    <div data-slot="popover-content" id="above"><span id="in-above"></span></div>`;
  content = document.getElementById("pop")!;
  outside = document.getElementById("outside")!;
  onOutside = vi.fn<(event: MouseEvent) => void>();
  stop = listenOutsideClick(content, onOutside);
});
afterEach(() => stop());

describe("listenOutsideClick", () => {
  it("reports a press outside the popover", () => {
    press(outside);
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it("reports it even when the page stops the click", () => {
    outside.addEventListener("click", (event) => event.stopPropagation());
    outside.addEventListener("pointerdown", (event) => event.stopPropagation());
    press(outside);
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it("ignores the popover itself, its trigger and a layer opened above it", () => {
    press(document.getElementById("inside")!);
    press(document.getElementById("trigger-label")!);
    press(document.getElementById("in-above")!);
    expect(onOutside).not.toHaveBeenCalled();
  });

  it("closes on a click elsewhere in a dialog below it", () => {
    press(document.getElementById("in-dialog")!);
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it("ignores the click that ends the press which opened it", () => {
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onOutside).not.toHaveBeenCalled();
  });
});
