import { describe, expect, it } from "vitest";
import { createTraceRing, TRACE_WINDOW_MS } from "./trace";

/**
 * Le tampon tournant de la trace (MIN-307). Ce qui compte : il ne grandit pas,
 * il ne perd pas la fin, et son dump se lit — c'est un outil qu'on ouvre après
 * coup, sur une machine où le défaut vient d'avoir lieu.
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
    // Ce sont les DERNIÈRES qu'on garde : le défaut vient de se produire.
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
