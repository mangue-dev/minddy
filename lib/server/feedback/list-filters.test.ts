import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { parseFeedbackListFilters } from "@/lib/feedback-list-filters";
import { countFeedbackForObjective, listTeamFeedback } from "./team-queries";
import { GET } from "@/app/api/projects/[id]/feedback/route";

const state = vi.hoisted(() => ({ client: null as SupabaseClient | null, member: true }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => state.client }));
vi.mock("./team-guard", () => ({ requireProjectMember: async () => state.member ? { ok: true } : { ok: false, response: NextResponse.json({}, { status: 403 }) } }));
vi.mock("./boards", () => ({ getBoardForProject: async () => ({ enabled: true }) }));
vi.mock("./identity-content", () => ({ decodeFeedbackIdentityRow: async (row: unknown) => row }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
const goal = "11111111-1111-4111-8111-111111111111";
const category = "22222222-2222-4222-8222-222222222222";
const post = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, project_id: "project", objective_id: goal, author_id: null, author: null,
  title: id, body: "", submitted_title: id, submitted_body: "",
  translated_title: null, translated_body: null, moderation_reason: null, embedding: null,
  status: "open", source: "board", review_state: "published", is_public: true,
  vote_count: 10, created_at: "2026-10-11", deleted_at: null, merged_into_id: null,
  suggested_merge_into_id: null, feedback_post_categories: [{ category_id: category }, { category_id: "other" }],
  ...overrides,
});
function client(rows: ReturnType<typeof post>[]) {
  return { from: vi.fn(() => {
    const filters: ((row: ReturnType<typeof post>) => boolean)[] = [];
    let cap = Infinity;
    let head = false;
    const query = {
      select(_columns: string, options?: { head?: boolean }) { head = options?.head === true; return query; },
      eq(column: string, value: unknown) { filters.push((row) => row[column as keyof typeof row] === value); return query; },
      is(column: string, value: unknown) { return query.eq(column, value); },
      in(column: string, values: unknown[]) {
        filters.push((row) => column === "filter_categories.category_id"
          ? row.feedback_post_categories.some((c) => values.includes(c.category_id))
          : values.includes(row[column as keyof typeof row]));
        return query;
      },
      or(expression: string) {
        const column = expression.split(".")[0];
        const ids = expression.slice(expression.indexOf("(") + 1, -1).split(",");
        filters.push((row) => row[column as keyof typeof row] === null || ids.includes(row[column as keyof typeof row] as string));
        return query;
      },
      order: () => query,
      limit(n: number) { cap = n; return query; },
      then(resolve: (result: unknown) => unknown) { return Promise.resolve({ data: head ? null : rows.filter((row) => filters.every((f) => f(row))).slice(0, cap), count: rows.filter((row) => filters.every((f) => f(row))).length, error: null }).then(resolve); },
    };
    return query;
  }) } as unknown as SupabaseClient;
}
beforeEach(() => { state.member = true; vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false"); state.client = client([]); });

afterEach(() => vi.unstubAllEnvs());

describe("team feedback list filters", () => {
  it("counts all live canonical requests beyond list limits while excluding foreign and merged rows", async () => {
    state.client = client([...Array.from({ length: 1500 }, (_, i) => post(`live-${i}`)),
      post("trashed", { deleted_at: "2026-10-11" }), post("merged", { merged_into_id: "canonical" }),
      post("foreign", { project_id: "other" }), post("other-objective", { objective_id: null })]);
    expect(await countFeedbackForObjective("project", goal)).toBe(1500);
  });

  it("filters before the 500-row cap and preserves all categories on matching requests", async () => {
    state.client = client([...Array.from({ length: 520 }, (_, i) => post(`board-${i}`)),
      post("matching", { source: "api", is_public: false, objective_id: null, status: "shipped" }),
      post("trashed", { source: "api", deleted_at: "2026-10-11" }),
      post("foreign", { project_id: "other", source: "api" })]);
    const rows = await listTeamFeedback("project", { filters: {
      source: ["api"], visibility: ["private"], objective: [goal, null], author: [null],
      category: [category], review: ["published"], statuses: ["shipped"],
    } });
    expect(rows.map((row) => row.id)).toEqual(["matching"]);
    expect(rows[0].category_ids).toEqual([category, "other"]);
    expect(rows[0]).not.toHaveProperty("filter_categories");
  });

  it("deduplicates visibility parameters and filters before the row cap", async () => {
    state.client = client([...Array.from({ length: 520 }, (_, i) => post(`private-${i}`, { is_public: false })), post("public-match")]);
    const filters = parseFeedbackListFilters(new URLSearchParams("visibility=public&visibility=public"));
    expect(filters).toEqual({ visibility: ["public"] });
    const response = await GET(new NextRequest("https://minddy.example/api/projects/project/feedback?visibility=public&visibility=public"), { params: Promise.resolve({ id: "project" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).posts.map((row: { id: string }) => row.id)).toEqual(["public-match"]);
    expect(parseFeedbackListFilters(new URLSearchParams("visibility=public&visibility=private&visibility=public")))
      .toEqual({ visibility: ["public", "private"] });
  });

  it("accepts repeated optional identifiers and rejects invalid values before querying", async () => {
    expect(parseFeedbackListFilters(new URLSearchParams(`objective=${goal}&objective=none&source=api&statuses=shipped`)))
      .toEqual({ objective: [goal, null], source: ["api"], statuses: ["shipped"] });
    for (const search of ["objective=bad", "author=bad", "category=none", "source=github", "review=rejected", "statuses=done", "visibility=secret"]) {
      const response = await GET(new NextRequest(`https://minddy.example/api/projects/project/feedback?${search}`), { params: Promise.resolve({ id: "project" }) });
      expect(response.status).toBe(400);
    }
    expect(state.client!.from).not.toHaveBeenCalled();
  });

  it("requires membership before reading a filtered team list", async () => {
    state.member = false;
    const response = await GET(new NextRequest(`https://minddy.example/api/projects/project/feedback?objective=${goal}`), { params: Promise.resolve({ id: "project" }) });
    expect(response.status).toBe(403);
    expect(state.client!.from).not.toHaveBeenCalled();
  });
});
