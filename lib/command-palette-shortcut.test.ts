import { describe, expect, it } from "vitest";
import { commandPaletteShortcut } from "./command-palette-shortcut";

function keyEvent(
  key: string,
  overrides: Partial<
    Pick<
      KeyboardEvent,
      "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target"
    >
  > = {},
) {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    ...overrides,
  } as Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target"
  >;
}

describe("commandPaletteShortcut", () => {
  it("toggles for the platform command shortcuts", () => {
    expect(commandPaletteShortcut(keyEvent("k", { metaKey: true }))).toBe("toggle");
    expect(commandPaletteShortcut(keyEvent("P", { ctrlKey: true }))).toBe("toggle");
  });

  it("opens for plain F outside an editing surface", () => {
    expect(commandPaletteShortcut(keyEvent("f"))).toBe("open");
    expect(
      commandPaletteShortcut(
        keyEvent("f", {
          target: { tagName: "BUTTON", isContentEditable: false } as HTMLElement,
        }),
      ),
    ).toBe("open");
  });

  it("leaves editing and modified shortcuts alone", () => {
    for (const target of [
      { tagName: "INPUT", isContentEditable: false },
      { tagName: "TEXTAREA", isContentEditable: false },
      { tagName: "DIV", isContentEditable: true },
    ]) {
      expect(
        commandPaletteShortcut(keyEvent("f", { target: target as HTMLElement })),
      ).toBeNull();
    }
    expect(commandPaletteShortcut(keyEvent("f", { altKey: true }))).toBeNull();
    expect(
      commandPaletteShortcut(keyEvent("k", { metaKey: true, shiftKey: true })),
    ).toBeNull();
  });

  it("ignores unrelated and synthetic key events", () => {
    expect(commandPaletteShortcut(keyEvent("Escape"))).toBeNull();
    expect(commandPaletteShortcut(keyEvent(undefined as unknown as string))).toBeNull();
  });
});
