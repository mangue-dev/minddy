import { describe, expect, it, vi } from "vitest";
import { commentDisplay } from "./comment-live";

describe("Numo comment persistence", () => {
  it("writes a completed page reply to the page comment table", async () => {
    const updates: Record<string, unknown>[] = [];
    const from = vi.fn((table: string) => ({
      update(fields: Record<string, unknown>) {
        updates.push(fields);
        return {
          eq: async () => ({ error: null }),
        };
      },
      table,
    }));

    const display = commentDisplay({ from } as never, "comment-id", "page_comments");
    await display.finish("Finished reply");

    expect(from).toHaveBeenCalledWith("page_comments");
    expect(updates).toEqual([
      {
        body: "Finished reply",
        assistant_status: "done",
        assistant_tool: null,
      },
    ]);
  });
});
