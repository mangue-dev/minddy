import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { routineOccurrenceSpend } from "./routine-spend";

describe("routine occurrence ledger reads", () => {
  it("uses the database aggregate and keeps platform spend separate from BYOK", async () => {
    const rpc = vi.fn(async () => ({ data: [{ conversation_id: "occurrence", total_cost: "2.07", platform_cost: "1.57" }], error: null }));
    const totals = await routineOccurrenceSpend({ rpc } as unknown as SupabaseClient, ["occurrence", "occurrence"]);
    expect(rpc).toHaveBeenCalledWith("get_numo_routine_occurrence_spend", { p_conversation_ids: ["occurrence"] });
    expect(totals.get("occurrence")).toEqual({ totalUsd: 2.07, platformUsd: 1.57 });
  });
  it("does not turn a failed ledger read into a zero spend", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "Database unavailable" } }));
    await expect(routineOccurrenceSpend({ rpc } as unknown as SupabaseClient, ["occurrence"]))
      .rejects.toThrow("Database unavailable");
  });
  it("skips reads when no occurrences exist", async () => {
    const rpc = vi.fn();
    expect(await routineOccurrenceSpend({ rpc } as unknown as SupabaseClient, [])).toEqual(new Map());
    expect(rpc).not.toHaveBeenCalled();
  });
});
