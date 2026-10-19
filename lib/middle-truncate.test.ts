import { describe, expect, it } from "vitest";
import { middleTruncate, middleTruncateByLength, splitExtension } from "./middle-truncate";

// Every character is 10 px wide: a 100 px line holds 10 characters.
const charWidth = () => 10;

describe("middleTruncate", () => {
  it("keeps a name that fits its two lines", () => {
    expect(middleTruncate("Spec v2.pdf", { width: 100, charWidth })).toBe("Spec v2.pdf");
  });

  it("cuts the middle and always keeps the whole extension", () => {
    const shown = middleTruncate("Capture d’écran 2026-10-19 à 11.webp", { width: 100, charWidth });
    expect(shown).toMatch(/…11\.webp$/);
    expect([...shown]).toHaveLength(20);
    expect(shown.startsWith("Capture d")).toBe(true);
  });

  it("cuts a name without extension the same way", () => {
    const shown = middleTruncate("a".repeat(40), { width: 100, charWidth });
    expect(shown).toBe(`${"a".repeat(17)}…aa`);
  });

  it("honours the number of lines", () => {
    expect([...middleTruncate("x".repeat(50) + ".csv", { width: 100, lines: 3, charWidth })]).toHaveLength(30);
  });
});

describe("middleTruncateByLength", () => {
  it("keeps the extension when cutting by characters", () => {
    expect(middleTruncateByLength("Very long quarterly report.xlsx", 16)).toBe("Very lon…rt.xlsx");
  });
});

describe("splitExtension", () => {
  it("separates the extension, not a dotfile", () => {
    expect(splitExtension("report.final.pdf")).toEqual(["report.final", ".pdf"]);
    expect(splitExtension(".env")).toEqual([".env", ""]);
    expect(splitExtension("Linear docs")).toEqual(["Linear docs", ""]);
  });
});
