import { describe, expect, it } from "vitest";
import { planTitleEnter } from "@/lib/keyboard/title-enter";

const key = (over: Partial<Parameters<typeof planTitleEnter>[0]> = {}) => ({
  key: "Enter",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe("planTitleEnter on a creation surface", () => {
  const create = { canSubmit: true } as const;

  it("jumps to the description on Enter when the account sends with ⌘/Ctrl + Enter", () => {
    expect(planTitleEnter(key(), { ...create, mode: "mod-enter" })).toBe("jump");
  });

  it("submits on Enter when the account sends with Enter", () => {
    expect(planTitleEnter(key(), { ...create, mode: "enter" })).toBe("submit");
  });

  it("submits on ⌘/Ctrl + Enter in both modes", () => {
    for (const mode of ["mod-enter", "enter"] as const) {
      expect(planTitleEnter(key({ metaKey: true }), { ...create, mode })).toBe("submit");
      expect(planTitleEnter(key({ ctrlKey: true }), { ...create, mode })).toBe("submit");
    }
  });

  it("always jumps on Shift + Enter", () => {
    for (const mode of ["mod-enter", "enter"] as const) {
      expect(planTitleEnter(key({ shiftKey: true }), { ...create, mode })).toBe("jump");
    }
  });

  it("treats a phone's Enter as the field's next key", () => {
    expect(planTitleEnter(key(), { ...create, mode: "enter", mobile: true })).toBe("jump");
  });
});

describe("planTitleEnter on an edit surface", () => {
  const edit = { canSubmit: false } as const;

  it("jumps to the description on Enter, whatever the send mode", () => {
    expect(planTitleEnter(key(), { ...edit, mode: "enter" })).toBe("jump");
    expect(planTitleEnter(key({ shiftKey: true }), { ...edit, mode: "mod-enter" })).toBe("jump");
  });

  it("leaves the field on ⌘/Ctrl + Enter", () => {
    expect(planTitleEnter(key({ metaKey: true }), { ...edit, mode: "mod-enter" })).toBe("blur");
  });
});

it("ignores other keys and an IME composition", () => {
  const state = { canSubmit: true, mode: "enter" } as const;
  expect(planTitleEnter(key({ key: "a" }), state)).toBe("ignore");
  expect(planTitleEnter(key({ isComposing: true }), state)).toBe("ignore");
});
