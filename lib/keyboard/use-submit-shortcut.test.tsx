// @vitest-environment jsdom
//
// ⌘/Ctrl + Enter submits a creation dialog's form from anywhere in the dialog,
// not only from inside the form, and leaves a dialog opened on top alone.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSubmitShortcut } from "@/lib/keyboard/use-submit-shortcut";

let root: Root;
let host: HTMLElement;
const submitted = vi.fn();

function Harness() {
  const shortcut = useSubmitShortcut();
  return createElement(
    "div",
    { "data-slot": "dialog-content", onKeyDownCapture: shortcut.onKeyDownCapture },
    createElement("button", { type: "button", id: "outside-form" }, "Create in"),
    createElement(
      "form",
      {
        ref: shortcut.ref,
        onSubmit: (event: Event) => {
          event.preventDefault();
          submitted();
        },
      },
      createElement("button", { type: "submit" }, "Create"),
    ),
    createElement(
      "div",
      { "data-slot": "alert-dialog-content" },
      createElement("button", { type: "button", id: "nested" }, "Discard"),
    ),
  );
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  submitted.mockReset();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const pressSubmit = (target: Element) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true, cancelable: true }),
    );
  });

it("submits with the focus outside the form, elsewhere in the dialog", async () => {
  await pressSubmit(host.querySelector("#outside-form")!);
  expect(submitted).toHaveBeenCalledTimes(1);
});

it("leaves the keys of a dialog opened on top to that dialog", async () => {
  await pressSubmit(host.querySelector("#nested")!);
  expect(submitted).not.toHaveBeenCalled();
});
