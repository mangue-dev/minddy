import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { listRunEvents } from "./run-event-store";

function client(error: { message: string } | null = null) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    order: () => query,
    gt: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    in: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
      data: [{ id: "event-1", seq: 3, type: "summary",
        payload: { text: "private" }, created_at: "2026-01-01",
        run: { project_id: "project-1" } }],
      error,
    })),
  };
  return {
    filters,
    service: { from: () => query } as unknown as SupabaseClient,
  };
}

describe("agent run event read boundary", () => {
  it("binds the run and project before returning event content", async () => {
    const { filters, service } = client();
    const rows = await listRunEvents(service,
      { id: "run-1", project_id: "project-1" },
      { after: 2, types: ["summary"] });
    expect(filters).toEqual([
      ["run_id", "run-1"], ["run.project_id", "project-1"],
      ["seq", 2], ["type", ["summary"]],
    ]);
    expect(rows).toEqual([{
      id: "event-1", seq: 3, type: "summary",
      payload: { text: "private" }, created_at: "2026-01-01",
    }]);
  });

  it("fails on a storage error instead of returning an empty transcript", async () => {
    const { service } = client({ message: "storage error" });
    await expect(listRunEvents(service,
      { id: "run-1", project_id: "project-1" })).rejects.toThrow(
        "Unable to read agent run events");
  });
});
