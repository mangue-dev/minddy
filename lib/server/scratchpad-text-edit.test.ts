import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("./encryption/scratchpad-content", () => ({
  decodeScratchpadRow: async (row: Record<string, unknown>) => row,
  encodeScratchpadContent: async (content: string) => ({ content }),
}));
vi.mock("@/lib/server/stat-events", () => ({ insertStatEvents: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));

const { editScratchpadText } = await import("./scratchpad");

/** One user's note row, with a hook that lets "the user" write between a read and the CAS. */
let row: { user_id: string; content: string; rev: number; updated_at: string } | null;
let beforeWrite: (() => void) | null;

function client(): SupabaseClient {
  return {
    from: () => {
      const filters: Record<string, unknown> = {};
      let update: Record<string, unknown> | null = null;
      const query = {
        select: () => query,
        update(values: Record<string, unknown>) {
          update = values;
          return query;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        async maybeSingle() {
          if (!update) return { data: row && { ...row }, error: null };
          beforeWrite?.();
          beforeWrite = null;
          if (!row || row.rev !== filters.rev) return { data: null, error: null };
          row = { ...row, ...(update as { content: string; rev: number }) };
          return { data: { ...row }, error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

const tools = { read: "get_scratchpad", replaceWhole: "set_scratchpad" };

beforeEach(() => {
  row = { user_id: "u1", content: "## Today\n\n- [ ] Write specs\n- [ ] Promote me\n- [ ] Ship", rev: 4, updated_at: "2026-10-27" };
  beforeWrite = null;
});

describe("editScratchpadText", () => {
  it("rewrites and removes passages in one CAS write", async () => {
    const result = await editScratchpadText(client(), "u1", [
      { oldString: "Write specs", newString: "Write the API specs" },
      { oldString: "- [ ] Promote me\n", newString: "" },
    ], tools);
    expect(result.status).toBe("ok");
    expect(row).toMatchObject({ rev: 5, content: "## Today\n\n- [ ] Write the API specs\n- [ ] Ship" });
  });

  it("keeps the user's concurrent edit elsewhere by matching on the fresh note", async () => {
    beforeWrite = () => {
      row = { ...row!, content: `${row!.content}\n- [ ] Added in the app`, rev: 5 };
    };
    const result = await editScratchpadText(client(), "u1", [{ oldString: "Ship", newString: "Ship it" }], tools);
    expect(result.status).toBe("ok");
    expect(row!.content).toBe("## Today\n\n- [ ] Write specs\n- [ ] Promote me\n- [ ] Ship it\n- [ ] Added in the app");
    expect(row!.rev).toBe(6);
  });

  it("writes nothing when one passage no longer matches", async () => {
    const result = await editScratchpadText(client(), "u1", [
      { oldString: "Ship", newString: "Ship it" },
      { oldString: "Gone", newString: "x" },
    ], tools);
    expect(result).toMatchObject({ status: "refused", code: "text_not_found" });
    expect(row!.rev).toBe(4);
  });

  it("refuses to patch an empty note and points at the full write", async () => {
    row = null;
    const result = await editScratchpadText(client(), "u1", [{ oldString: "a", newString: "b" }], tools);
    expect(result).toMatchObject({ status: "refused", message: expect.stringContaining("set_scratchpad") });
  });
});
