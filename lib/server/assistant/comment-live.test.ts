import { afterEach, describe, expect, it, vi } from "vitest";
import { commentDisplay } from "./comment-live";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function fixture(failFirst = false, row: Record<string, unknown> = { id: "comment-id", assistant_status: "working" }) {
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn(() => ({
    update(fields: Record<string, unknown>) {
      const filters: [string, unknown][] = [];
      const query = {
        eq(column: string, value: unknown) { filters.push([column, value]); return query; },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const failed = failFirst && updates.length === 0;
          if (!failed && filters.every(([column, value]) => row[column] === value)) {
            updates.push(fields);
            Object.assign(row, fields);
          } else if (failed) updates.push(fields);
          return Promise.resolve({ error: failed ? { code: "UNAVAILABLE" } : null }).then(resolve, reject);
        },
      };
      return query;
    },
  }));
  return { updates, from, row, service: { from } as never };
}

describe("Numo encrypted comment snapshots", () => {
  it("writes a completed page reply to the page comment repository", async () => {
    const test = fixture();
    await commentDisplay(test.service, "comment-id", "page_comments").finish("Finished reply");
    expect(test.from).toHaveBeenCalledWith("page_comments");
    expect(test.updates).toEqual([{ body: "Finished reply", assistant_status: "done", assistant_tool: null }]);
  });

  it("serializes throttled snapshots before the final answer without broadcasting plaintext", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const test = fixture();
    const display = commentDisplay(test.service, "comment-id");
    display.stream("Partial");
    display.stream("Throttled partial");
    display.tool("search");
    await display.finish("Complete answer");
    expect(test.updates).toEqual([{ body: "Partial" }, { body: "", assistant_tool: "search" },
      { body: "Complete answer", assistant_status: "done", assistant_tool: null }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recovers from a failed intermediate write but reports failed final persistence", async () => {
    const intermediate = fixture(true);
    const display = commentDisplay(intermediate.service, "comment-id");
    display.stream("Partial");
    await expect(display.finish("Final")).resolves.toBeUndefined();
    expect(intermediate.updates.at(-1)?.body).toBe("Final");
    const final = fixture(true);
    await expect(commentDisplay(final.service, "comment-id").finish("Final")).rejects.toThrow("Unable to persist");
    await expect(commentDisplay(fixture(true).service, "comment-id").fail()).rejects.toThrow("Unable to persist");
  });

  it("never lets a late failure blank an answer that is already done", async () => {
    const test = fixture();
    const display = commentDisplay(test.service, "comment-id");
    await display.finish("Complete answer");
    await display.fail();
    await commentDisplay(test.service, "comment-id").finish("A second outcome");
    expect(test.row).toMatchObject({ body: "Complete answer", assistant_status: "done" });
    expect(test.updates).toEqual([{ body: "Complete answer", assistant_status: "done", assistant_tool: null }]);
  });
});
