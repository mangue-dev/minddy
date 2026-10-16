import { describe, expect, it, vi } from "vitest";
import type { PageSearchHit, SearchIndexPage } from "./types";
import { withPageContentHits } from "./palette-page-hits";

type Row = { id: string; entityType?: string; data?: unknown; description?: string };

const hit = (id: string, excerpt: string): PageSearchHit => ({
  id, project_id: "project", parent_id: null, title: `Title ${id}`, icon: null,
  updated_at: "2026-10-01T00:00:00Z", excerpt, rank: 1,
});

describe("withPageContentHits", () => {
  const issue: Row = { id: "issue-1", entityType: "issue", data: { id: "1" } };
  const known: Row = { id: "wiki-p1", entityType: "page", data: { id: "p1" } };
  const other: Row = { id: "wiki-p2", entityType: "page", data: { id: "p2" } };
  const rows = [issue, known, other];

  it("returns the same model when there are no hits", () => {
    const extra = vi.fn();
    expect(withPageContentHits(rows, [], extra)).toBe(rows);
    expect(extra).not.toHaveBeenCalled();
  });

  it("adds the excerpt to matching pages only and keeps every other row", () => {
    const next = withPageContentHits(rows, [hit("p1", "cited in the body")], () => null);
    expect(next[0]).toBe(issue);
    expect(next[1]).toEqual({ ...known, description: "cited in the body" });
    expect(next[2]).toBe(other);
    expect(rows[1].description).toBeUndefined();
  });

  it("appends pages that only the content search found, in server order", () => {
    const extra = vi.fn((page: SearchIndexPage): Row | null =>
      page.id === "gone" ? null : { id: `wiki-${page.id}`, entityType: "page", data: page });
    const next = withPageContentHits(rows, [hit("p9", "x"), hit("gone", "y"), hit("p8", "z")], extra);
    expect(next.slice(0, 3)).toEqual(rows);
    expect(next.slice(3).map((row) => row.id)).toEqual(["wiki-p9", "wiki-p8"]);
    expect(extra).toHaveBeenCalledWith({
      id: "p9", project_id: "project", title: "Title p9", icon: null, updated_at: "2026-10-01T00:00:00Z",
    });
  });
});
