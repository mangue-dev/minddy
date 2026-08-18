import { describe, expect, it } from "vitest";
import { createPendingWrites } from "./pending-writes";

interface Row {
  id: string;
  status: string;
  updated_at: string;
}

const row = (id: string, status: string, updatedAt = "t0"): Row => ({
  id,
  status,
  updated_at: updatedAt,
});

/** Simulated clock: `clock.at` is the time that `now()` returns. */
function fixture(retentionMs = 30_000) {
  const clock = { at: 1_000 };
  const writes = createPendingWrites<Row>({
    now: () => clock.at,
    retentionMs,
  });
  return { clock, writes };
}

describe("createPendingWrites", () => {
  it("keeps the patch when the response was sent before confirmation", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at; // the GET leaves…
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });
    clock.at += 50;
    writes.settle(handle); // …and the PATCH is confirmed AFTER it leaves.

    // The response still has the old state: the overlay corrects it.
    expect(writes.apply([row("a", "todo")], startedAt)).toEqual([
      { id: "a", status: "done", updated_at: "t0" },
    ]);
  });

  it("releases the patch when the response was sent after confirmation", () => {
    const { clock, writes } = fixture();
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });
    clock.at += 50;
    writes.settle(handle);
    clock.at += 10;
    const startedAt = clock.at; // GET gone AFTER confirmation: it is authentic.

    const rows = [row("a", "todo")];
    expect(writes.apply(rows, startedAt)).toBe(rows);
  });

  it("oublie l'entrée immédiatement quand l'écriture échoue", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at;
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });
    clock.at += 50;
    writes.fail(handle);

    const rows = [row("a", "todo")];
    expect(writes.apply(rows, startedAt)).toBe(rows);
  });

  it("lets the latest write win for the same id", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at;
    writes.begin({ kind: "patch", id: "a", patch: { status: "in_progress" } });
    clock.at += 5;
    writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });

    expect(writes.apply([row("a", "todo")], startedAt)).toEqual([
      { id: "a", status: "done", updated_at: "t0" },
    ]);
  });

  it("purges confirmed entries after the retention period", () => {
    const { clock, writes } = fixture(30_000);
    const startedAt = clock.at;
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });
    clock.at += 50;
    writes.settle(handle, row("a", "done", "t1"));

    // Still there just after confirmation...
    expect(writes.apply([row("a", "todo")], startedAt)[0].status).toBe("done");
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t1" })).toBe(true);

    clock.at += 30_001;
    const rows = [row("a", "todo")];
    expect(writes.apply(rows, startedAt)).toBe(rows);
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t1" })).toBe(false);
  });

  // The broadcast starts from the TO COMMIT trigger: it typically arrives BEFORE the
  // HTTP response from the PATCH, therefore before any fingerprint has been memorized.
  it("recognizes the echo of an in-flight write without a fingerprint", () => {
    const { clock, writes } = fixture();
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });

    // No `settle` yet: neither id nor updated_at stored.
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t9" })).toBe(true);
    // A connecting line without `updated_at` also counts (issue_categories).
    expect(writes.wasJustWritten("a")).toBe(true);
    // Another line is not ours.
    expect(writes.wasJustWritten("b", { id: "b", updated_at: "t9" })).toBe(false);

    clock.at += 50;
    writes.settle(handle, row("a", "done", "t1"));
    // Confirmed: only the exact fingerprint now matches.
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t1" })).toBe(true);
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t2" })).toBe(false);
  });

  it("does not duplicate an insert already contained in the response", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at;
    writes.begin({ kind: "insert", row: row("new", "todo") });

    // Response without the line: we add it.
    expect(writes.apply([row("a", "todo")], startedAt).map((r) => r.id)).toEqual([
      "a",
      "new",
    ]);
    // Answer which already contains it: it is authentic, no duplicate.
    const withRow = [row("a", "todo"), row("new", "todo")];
    expect(writes.apply(withRow, startedAt)).toBe(withRow);
  });

  it("applies a remove and releases it once the response is current", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at;
    const handle = writes.begin({ kind: "remove", id: "a" });

    expect(writes.apply([row("a", "todo"), row("b", "todo")], startedAt)).toEqual([
      { id: "b", status: "todo", updated_at: "t0" },
    ]);

    clock.at += 50;
    writes.settle(handle);
    clock.at += 10;
    // The line has really disappeared on the server side: the following response is required.
    const rows = [row("b", "todo")];
    expect(writes.apply(rows, clock.at)).toBe(rows);
  });
});
