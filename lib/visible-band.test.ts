import { describe, expect, it } from "vitest";
import { caretMenuPosition } from "./visible-band";

const base = { width: 288, height: 240, viewportWidth: 390, edge: 8, gap: 6 };

describe("caretMenuPosition", () => {
  it("opens below the caret when the menu fits there", () => {
    const position = caretMenuPosition({ ...base, caret: { top: 100, bottom: 120, left: 40 }, band: { top: 0, bottom: 844 } });
    expect(position).toEqual({ top: 126, left: 40 });
  });

  it("opens above the caret when the keyboard leaves no room below", () => {
    // A 844px phone with a 336px keyboard and its 44px editor toolbar: the
    // caret at 400 has 50px left below it, 390px above.
    const position = caretMenuPosition({ ...base, caret: { top: 400, bottom: 420, left: 40 }, band: { top: 0, bottom: 464 } });
    expect(position.top).toBe(400 - 6 - 240);
  });

  it("stays inside the visible band and the window's width", () => {
    const position = caretMenuPosition({ ...base, caret: { top: 150, bottom: 170, left: 300 }, band: { top: 0, bottom: 300 } });
    expect(position.top + base.height).toBeLessThanOrEqual(300 - base.edge);
    expect(position.top).toBeGreaterThanOrEqual(base.edge);
    expect(position.left).toBe(390 - 288 - 8);
  });
});
