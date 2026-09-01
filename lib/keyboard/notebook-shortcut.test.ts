import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHEATSHEET } from "@/lib/keyboard/shortcuts";

const keyboardProvider = readFileSync(
  join(process.cwd(), "lib/keyboard/keyboard-context.tsx"),
  "utf8",
);
const trigger = readFileSync(
  join(process.cwd(), "components/scratchpad/scratchpad-trigger.tsx"),
  "utf8",
);

describe("task notebook shortcut", () => {
  it("uses Mod+Shift+K in behavior and every visible shortcut hint", () => {
    const notebook = CHEATSHEET.flatMap((section) => section.shortcuts).find(
      (shortcut) => shortcut.id === "nav.notes",
    );

    expect(notebook?.keys).toEqual([["mod", "⇧", "K"]]);
    expect(keyboardProvider).toContain('matchesModShiftCombo(e, "k")');
    expect(keyboardProvider).not.toContain('matchesModShiftCombo(e, "n")');
    expect(trigger).toContain('useModShiftShortcut("K")');
    expect(trigger).toContain('keys={[[modKey, "⇧", "K"]]}');
  });
});
