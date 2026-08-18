import { describe, expect, it } from "vitest";
import { createTraceRing, TRACE_WINDOW_MS } from "./trace";

/**
 * The spinning buffer of the trace (MIN-307). What matters: it doesn't grow,
 * it doesn't lose the end, and its dump is read — it's a tool that you open after
 *, on a machine where the fault has just occurred.
 */
describe("createTraceRing", () => {
  it("garde la fenêtre courante et jette ce qui l'a quittée", () => {
    const ring = createTraceRing(1_000);
    ring.push({ t: 0, kind: "vieux" });
    ring.push({ t: 500, kind: "milieu" });
    ring.push({ t: 1_200, kind: "recent" });

    expect(ring.entries(1_200).map((e) => e.kind)).toEqual([
      "milieu",
      "recent",
    ]);
  });

  it("borne aussi le NOMBRE de lignes — une rafale ne gonfle pas sans fin", () => {
    const ring = createTraceRing(TRACE_WINDOW_MS, 3);
    for (let i = 0; i < 50; i++) ring.push({ t: i, kind: `m${i}` });

    const kept = ring.entries(50);
    expect(kept).toHaveLength(3);
    // These are the LAST ones we keep: the fault has just occurred.
    expect(kept.map((e) => e.kind)).toEqual(["m47", "m48", "m49"]);
  });

  it("horodate en secondes relatives à la plus ancienne ligne gardée", () => {
    const ring = createTraceRing(10_000);
    ring.push({ t: 4_000, kind: "catchUp", detail: { keys: 85, cache: 312 } });
    ring.push({ t: 4_120, kind: "longtask", detail: { ms: 143 } });

    expect(ring.format(4_200)).toBe(
      "   0.000s catchUp keys=85 cache=312\n   0.120s longtask ms=143"
    );
  });

  it("le dit quand il n'y a rien à lire", () => {
    expect(createTraceRing().format(0)).toBe("(trace vide)");
  });
});
