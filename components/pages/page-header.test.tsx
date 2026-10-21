// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageHeader } from "./page-header";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/pages/emoji-picker", () => ({ EmojiPicker: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

async function mount() {
  const onEnter = vi.fn();
  const onDown = vi.fn();
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(PageHeader,
    { title: "東京", icon: null, onTitleChange: vi.fn(), onIconChange: vi.fn(), onEnter, onDown })));
  const field = document.querySelector("textarea")!;
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
  return { field, onEnter, onDown };
}

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => { target.dispatchEvent(event); });
  return event;
}

describe("page title shortcuts and IME composition (MIN-706)", () => {
  it("leaves Enter and ↓ to the input method while it composes", async () => {
    const { field, onEnter, onDown } = await mount();
    expect(press(field, "Enter", { isComposing: true }).defaultPrevented).toBe(false);
    expect(press(field, "ArrowDown", { isComposing: true }).defaultPrevented).toBe(false);
    // Safari: the committing Enter arrives after compositionend, as keyCode 229.
    expect(press(field, "Enter", { keyCode: 229 }).defaultPrevented).toBe(false);
    expect(onEnter).not.toHaveBeenCalled();
    expect(onDown).not.toHaveBeenCalled();
  });

  it("keeps Enter and ↓ as navigation once the candidate is committed", async () => {
    const { field, onEnter, onDown } = await mount();
    expect(press(field, "Enter").defaultPrevented).toBe(true);
    expect(onEnter).toHaveBeenCalledOnce();
    expect(press(field, "ArrowDown").defaultPrevented).toBe(true);
    expect(onDown).toHaveBeenCalledOnce();
  });
});
