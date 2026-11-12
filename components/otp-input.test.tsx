// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OtpInput } from "./otp-input";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("lets go of the field when the code is complete, and takes it back after a rejected code", async () => {
  const onComplete = vi.fn();
  let reject!: () => void;
  function Challenge() {
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    reject = () => { setBusy(false); setCode(""); };
    return createElement(OtpInput, {
      value: code, onChange: setCode, disabled: busy, autoFocus: true,
      onComplete: (value: string) => { setBusy(true); onComplete(value); },
    });
  }
  await act(() => root.render(createElement(Challenge)));
  const input = container.querySelector("input")!;
  input.focus();

  await act(() => type(input, "123456"));
  expect(onComplete).toHaveBeenCalledExactlyOnceWith("123456");
  expect(document.activeElement).not.toBe(input);

  await act(() => reject());
  expect(document.activeElement).toBe(input);
});
