import { describe, expect, it } from "vitest";

import {
  triageScoreComparator,
  triageScoreOrder,
  TRIAGE_NEUTRAL_SCORE,
} from "./triage-score-order";

/**
 * The score-driven ordering (MIN-566, MIN-576) — the ONE home shared by the
 * server's reorder and the board's Smart view sort, so the two can never
 * drift. Pinned here: score descends, unscored tickets read as neutral
 * (never a guess), ties fold to age then position.
 */

const ticket = (id: string, overrides: { created_at?: string; position?: number } = {}) => ({
  id,
  created_at: overrides.created_at ?? "2026-09-10T10:00:00Z",
  position: overrides.position ?? 0,
});

describe("triageScoreComparator", () => {
  it("orders by score, highest first", () => {
    const scores = new Map([["a", 1], ["b", 5], ["c", 3]]);
    const ordered = triageScoreOrder([ticket("a"), ticket("b"), ticket("c")], scores);
    expect(ordered.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("reads a missing or null score as neutral, never as a guess", () => {
    const scores = new Map<string, number | null>([["b", 5], ["c", null]]);
    const ordered = triageScoreOrder([ticket("a"), ticket("b"), ticket("c")], scores);
    // a (neutral 3) and c (null → neutral) tie; b stays on top.
    expect(ordered.map((t) => t.id)).toEqual(["b", "a", "c"]);
    expect(TRIAGE_NEUTRAL_SCORE).toBe(3);
  });

  it("breaks ties by age (oldest first), then position", () => {
    const scores = new Map<string, number | null>();
    const ordered = triageScoreOrder(
      [
        ticket("a", { created_at: "2026-09-10T10:00:00Z", position: 5 }),
        ticket("b", { created_at: "2026-09-01T10:00:00Z", position: 9 }),
        ticket("c", { created_at: "2026-09-01T10:00:00Z", position: 2 }),
      ],
      scores
    );
    expect(ordered.map((t) => t.id)).toEqual(["c", "b", "a"]);
  });

  it("stays a pure comparator — usable directly by the view sort", () => {
    const scores = new Map([["b", 5]]);
    const compare = triageScoreComparator<{ id: string; created_at: string; position: number }>(scores);
    expect(
      compare(
        { id: "a", created_at: "2026-09-10T10:00:00Z", position: 1 },
        { id: "b", created_at: "2026-09-01T10:00:00Z", position: 2 }
      )
    ).toBeGreaterThan(0);
  });
});
