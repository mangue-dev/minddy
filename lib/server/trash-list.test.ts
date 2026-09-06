import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isBlankTrashPage, listTrash } from "./trash";

const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      let columns: string[] = [];
      const query = {
        select: (value: string) => { columns = value.split(",").map((column) => column.trim()); return query; },
        in: () => query, is: () => query, not: () => query, eq: () => query,
        order: () => query, limit: () => query,
        then: (resolve: (value: unknown) => unknown) => resolve({
          data: table === "pages" && columns.includes("id")
            ? h.rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])))
            : [],
        }),
      };
      return query;
    },
  }),
}));

describe("isBlankTrashPage", () => {
  it("hides an abandoned page draft", () => {
    expect(
      isBlankTrashPage(
        {
          title: "  ",
          icon: null,
          content: { type: "doc", content: [{ type: "paragraph" }] },
        },
        false,
      ),
    ).toBe(true);
  });

  it("keeps an untitled page that contains text", () => {
    expect(
      isBlankTrashPage(
        {
          title: "",
          icon: null,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Notes" }],
              },
            ],
          },
        },
        false,
      ),
    ).toBe(false);
  });

  it("keeps a blank page that owns deleted subpages", () => {
    expect(
      isBlankTrashPage(
        { title: "", icon: null, content: { type: "doc", content: [] } },
        true,
      ),
    ).toBe(false);
  });

  it("keeps an empty database even without a title or entries", () => {
    expect(isBlankTrashPage({ title: "", icon: null, content: null, database_schema: [] }, false)).toBe(false);
  });

  it("keeps a page with a title or icon", () => {
    expect(isBlankTrashPage({ title: "Plan", icon: null }, false)).toBe(false);
    expect(isBlankTrashPage({ title: "", icon: "📄" }, false)).toBe(false);
  });

  it.each([42, 0, false, "", null])("keeps an untitled entry with a stored cell value of %s", (value) => {
    expect(isBlankTrashPage({ title: "", content: null, property_values: { column: value } }, false)).toBe(false);
  });

  it("includes stored entry values in the actual trash list projection", async () => {
    h.rows = [
      { id: "entry", project_id: "project", deleted_at: "2026-09-06T00:00:00Z", deleted_by: null, title: "", content: null, database_schema: null, property_values: { amount: 0 } },
      { id: "draft", project_id: "project", deleted_at: "2026-09-06T00:00:00Z", deleted_by: null, title: "", content: null, database_schema: null, property_values: {} },
    ];
    const session = { from: () => ({ select: () => ({ is: async () => ({ data: [{ id: "project", name: "Project", owner_id: "actor" }] }) }) }) };
    const items = await listTrash("actor", session as unknown as SupabaseClient);
    expect(items.map((item) => item.id)).toEqual(["entry"]);
  });
});
