import { describe, expect, it } from "vitest";
import { splitShortcut } from "./kbd";

describe("splitShortcut", () => {
  it.each([
    ["⌘⇧L", ["⌘", "⇧", "L"]],
    ["⇧P", ["⇧", "P"]],
    ["⌘⌥C", ["⌘", "⌥", "C"]],
    ["Ctrl+Shift+L", ["Ctrl", "Shift", "L"]],
    ["⌘↵", ["⌘", "↵"]],
    ["⇧", ["⇧"]],
    ["C", ["C"]],
    ["", []],
  ])("splits %s into one cap per key", (shortcut, keys) => {
    expect(splitShortcut(shortcut)).toEqual(keys);
  });
});
