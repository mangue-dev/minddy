import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-342 — the public site navigation listed shared views PROTECTED
 * by password, with their name and token. The page of these views does not
 * say anything about itself as long as you do not have the password (not even its name):
 * the tab canceled this discretion, and gave the URL on top.
 */

interface ShareRow {
  token: string;
  level: "public" | "password";
  views: { id: string; name: string; project_id: string };
}

let shares: ShareRow[] = [];
let board: Record<string, unknown> | null = null;
/** The `.eq()` filters actually installed — the guard IS the filter. */
let filters: [string, unknown][] = [];

vi.mock("@/lib/server/feedback/boards", () => ({
  getBoardForProject: async () => board,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const api = {
        select: () => api,
        eq: (col: string, value: unknown) => {
          filters.push([col, value]);
          return api;
        },
        order: () => api,
        then: (resolve: (v: { data: ShareRow[]; error: null }) => unknown) =>
          Promise.resolve(
            resolve({
              data: shares.filter((s) =>
                filters.every(([col, value]) =>
                  col === "level" ? s.level === value : true
                )
              ),
              error: null,
            })
          ),
      };
      return api;
    },
  }),
}));

const { getPublicSiteTabs } = await import("@/lib/server/feedback/public-nav");

beforeEach(() => {
  filters = [];
  board = {
    enabled: true,
    show_views: true,
    token: "board-token",
    visible_view_ids: ["view-open", "view-locked"],
  };
  shares = [
    {
      token: "tok-open",
      level: "public",
      views: { id: "view-open", name: "Roadmap", project_id: "proj" },
    },
    {
      token: "tok-locked",
      level: "password",
      views: { id: "view-locked", name: "Interne", project_id: "proj" },
    },
  ];
});

describe("getPublicSiteTabs", () => {
  it("ne liste pas les vues verrouillées, même cochées dans les réglages", async () => {
    const tabs = await getPublicSiteTabs({
      projectId: "proj",
      feedbackLabel: "Retours",
      current: { kind: "feedback" },
    });
    expect(tabs.map((t) => t.href)).toEqual(["/f/board-token", "/share/tok-open"]);
    // Neither the name nor the token: the query discards them at the source rather than
    // read them and then throw them away.
    expect(filters).toContainEqual(["level", "public"]);
    expect(JSON.stringify(tabs)).not.toContain("tok-locked");
    expect(JSON.stringify(tabs)).not.toContain("Interne");
  });

  it("rend une navigation vide quand la seule vue partagée est verrouillée", async () => {
    shares = shares.filter((s) => s.level === "password");
    // Only one tab remaining (the board) = nothing to show.
    expect(
      await getPublicSiteTabs({
        projectId: "proj",
        feedbackLabel: "Retours",
        current: { kind: "feedback" },
      })
    ).toEqual([]);
  });
});
