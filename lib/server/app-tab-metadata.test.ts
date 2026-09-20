import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAppTabMetadataLocations, readAppTabMetadata } from "./app-tab-metadata";

const project = "10000000-0000-4000-8000-000000000001";
const page = "20000000-0000-4000-8000-000000000001";
const objective = "30000000-0000-4000-8000-000000000001";
const pr = "40000000-0000-4000-8000-000000000001";
const routine = "50000000-0000-4000-8000-000000000001";

describe("application tab metadata", () => {
  it("rejects unbounded and external destinations before querying", () => {
    for (const value of [null, {}, ["https://example.com"], Array(101).fill("/all")]) {
      expect(parseAppTabMetadataLocations(value)).toBeNull();
    }
    expect(parseAppTabMetadataLocations(["/all", "/all"])).toEqual(["/all"]);
  });

  it("projects only requested labels through the authenticated RLS client", async () => {
    const selected: [string, string, string[]][] = [];
    const returned = {
      pages: [{ id: page, project_id: project, title: "Page", icon: null }],
      objectives: [{ id: objective, project_id: project, name: "Goal", color: null }],
      pull_requests: [{ id: pr, number: 42, title: "Stored pull request" }],
      agent_routines: [{ id: routine, title: "Routine" }],
    };
    const from = vi.fn((table: keyof typeof returned) => ({ select: (columns: string) => ({
      in: async (column: string, ids: string[]) => {
        expect(column).toBe("id");
        selected.push([table, columns, ids]);
        return { data: returned[table], error: null };
      },
    }) }));
    const result = await readAppTabMetadata({ from } as unknown as SupabaseClient, [
      `/projects/${project}/pages/${page}`,
      `/projects/${project}?objective=${objective}`,
      `/pull-requests?pr=${pr}`,
      `/routines?routine=${routine}`,
    ]);
    expect(selected).toEqual([
      ["pages", "id,project_id,title,icon", [page]],
      ["objectives", "id,project_id,name,color", [objective]],
      ["pull_requests", "id,number,title", [pr]],
      ["agent_routines", "id,title", [routine]],
    ]);
    expect(result.pullRequests).toEqual(returned.pull_requests);
    expect(result.pages).toEqual(returned.pages);
  });

  it("does not query ordinary routes or non-UUID selections", async () => {
    const from = vi.fn();
    expect(await readAppTabMetadata({ from } as unknown as SupabaseClient, ["/all", "/home", "/pull-requests?pr=bad"]))
      .toEqual({ pages: [], objectives: [], pullRequests: [], routines: [] });
    expect(from).not.toHaveBeenCalled();
  });

  it("does not label a project URL using a row from another project", async () => {
    const from = () => ({ select: () => ({ in: async () => ({
      data: [{ id: page, project_id: "other", title: "Wrong project", icon: null }], error: null,
    }) }) });
    expect((await readAppTabMetadata({ from } as unknown as SupabaseClient, [`/projects/${project}/pages/${page}`])).pages).toEqual([]);
  });

  it("fails the bounded read when the database fails", async () => {
    const from = () => ({ select: () => ({ in: async () => ({ data: null, error: { message: "unavailable" } }) }) });
    await expect(readAppTabMetadata({ from } as unknown as SupabaseClient, [`/pull-requests?pr=${pr}`])).rejects.toThrow("labels could not be loaded");
  });
});
