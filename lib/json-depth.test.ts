import { describe, expect, it } from "vitest";

import { exceedsJsonDepth, MAX_PAGE_JSON_DEPTH } from "@/lib/json-depth";

/**
 * MIN-348 — the terminal which must hold where `JSON.stringify` falls.
 *
 * The control which counts is the last: on the document which raised the
 * previous guardrail, this one responds, and it responds `true`.
 */

/** An object of `depth` levels: `{v:{v:{…}}}`, constructed without recursion. */
function nest(depth: number): unknown {
  let node: unknown = {};
  for (let i = 1; i < depth; i++) node = { v: node };
  return node;
}

describe("exceedsJsonDepth", () => {
  it("laisse passer ce qui tient sous le plafond", () => {
    expect(exceedsJsonDepth({}, 3)).toBe(false);
    expect(exceedsJsonDepth({ a: { b: "c" } }, 3)).toBe(false);
    expect(exceedsJsonDepth(nest(MAX_PAGE_JSON_DEPTH), MAX_PAGE_JSON_DEPTH)).toBe(false);
  });

  it("compte les tableaux comme des niveaux — un doc ProseMirror en est fait", () => {
    expect(exceedsJsonDepth({ content: [{ content: [{}] }] }, 3)).toBe(true);
    expect(exceedsJsonDepth({ content: [{ content: [{}] }] }, 5)).toBe(false);
  });

  it("refuse un document plus profond que le plafond", () => {
    expect(exceedsJsonDepth(nest(MAX_PAGE_JSON_DEPTH + 1), MAX_PAGE_JSON_DEPTH)).toBe(
      true
    );
  });

  it("répond là où JSON.stringify lève, sans faire tomber le process", () => {
    const bomb = nest(200_000);
    expect(() => JSON.stringify(bomb)).toThrow(RangeError);
    expect(exceedsJsonDepth(bomb, MAX_PAGE_JSON_DEPTH)).toBe(true);
  });

  it("ne tourne pas en rond sur un objet cyclique — la profondeur le coupe", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(exceedsJsonDepth(cycle, 10)).toBe(true);
  });
});
