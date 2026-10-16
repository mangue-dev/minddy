import { describe, expect, it, vi } from "vitest";
import { CompleteScopedRowsError, readCompleteScopedRows } from "./complete-scoped-rows";

const id = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const source = Array.from({ length: 1206 }, (_, index) => ({ id: id(index + 1) }));

describe("complete scoped UUID collections", () => {
  it.each([250, 1000])("does not mistake a lower server cap of %i for completion", async (cap) => {
    const read = vi.fn(async (after: string | null) => {
      const remaining = source.filter((row) => !after || row.id > after);
      return { data: remaining.slice(0, cap), error: null, count: remaining.length };
    });
    expect(await readCompleteScopedRows(read, (row) => row.id)).toEqual(source);
    expect(read).toHaveBeenCalledTimes(Math.ceil(source.length / cap));
    expect(read.mock.calls.map(([after]) => after)).toEqual(Array.from({ length: Math.ceil(source.length / cap) },
      (_, index) => index ? id(index * cap) : null));
  });

  it("uses an empty final batch when exact counts are unavailable", async () => {
    const read = vi.fn(async (after: string | null) => ({
      data: source.filter((row) => !after || row.id > after).slice(0, 250), error: null,
    }));
    expect(await readCompleteScopedRows(read, (row) => row.id)).toEqual(source);
    expect(read).toHaveBeenCalledTimes(6);
  });

  it.each([0, 250, 1000, 2000])("finishes %i exact-count rows without another empty request", async (size) => {
    const rows = Array.from({ length: size }, (_, index) => ({ id: id(index + 1) }));
    const read = vi.fn(async (after: string | null) => {
      const remaining = rows.filter((row) => !after || row.id > after);
      return { data: remaining.slice(0, 250), error: null, count: remaining.length };
    });
    expect(await readCompleteScopedRows(read, (row) => row.id)).toEqual(rows);
    expect(read).toHaveBeenCalledTimes(Math.max(1, size / 250));
  });

  it.each([
    { label: "duplicate identities", rows: [source[0], source[0]], count: 2 },
    { label: "decreasing identities", rows: [source[1], source[0]], count: 2 },
    { label: "non-UUID identities", rows: [{ id: "private-row" }], count: 1 },
    { label: "fractional counts", rows: [source[0]], count: 1.5 },
    { label: "counts smaller than the batch", rows: [source[0]], count: 0 },
    { label: "empty batches with remaining rows", rows: [], count: 1 },
  ])("rejects $label without publishing a partial collection", async ({ rows, count }) => {
    const read = vi.fn(async () => ({ data: rows, error: null, count }));
    await expect(readCompleteScopedRows(read, (row) => row.id)).rejects.toBeInstanceOf(CompleteScopedRowsError);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("rejects a repeated older page after an accepted cursor", async () => {
    const read = vi.fn(async () => ({ data: [source[0]], error: null, count: 2 }));
    await expect(readCompleteScopedRows(read, (row) => row.id)).rejects.toThrow("Unable to read a complete scoped collection");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("retains only a database schema code after a later page fails", async () => {
    const read = vi.fn().mockResolvedValueOnce({ data: [source[0]], error: null, count: 2 })
      .mockResolvedValueOnce({ data: null, error: { code: "42703", message: "Private SQL and content" } });
    const error = await readCompleteScopedRows(read, (row: { id: string }) => row.id).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(CompleteScopedRowsError);
    expect((error as CompleteScopedRowsError).databaseError).toEqual({ code: "42703" });
    expect(String(error)).not.toContain("Private SQL");
    expect(JSON.stringify(error)).not.toContain("Private SQL");
  });

  it("never returns earlier rows after a later decode rejects", async () => {
    const read = vi.fn().mockResolvedValueOnce({ data: [source[0]], error: null, count: 2 })
      .mockRejectedValueOnce(new Error("Private encrypted content"));
    await expect(readCompleteScopedRows(read, (row: { id: string }) => row.id))
      .rejects.toThrow("Unable to read a complete scoped collection");
  });
});
