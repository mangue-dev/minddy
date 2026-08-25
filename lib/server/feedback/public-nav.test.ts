import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-342 — the public site navigation once listed password-PROTECTED shared
 * views, name and token included. Their page says nothing about itself until
 * unlocked (not even its name): the tab voided that discretion and handed out
 * the URL on top. Published pages get the same discretion.
 */

interface ShareRow {
  token: string;
  level: "public" | "password";
  views?: { id: string; name: string; project_id: string } | null;
  pages?: { id: string; title: string; project_id: string } | null;
}

let shares: ShareRow[] = [];
let board: Record<string, unknown> | null = null;
/** The `.eq()`/`.is()` filters actually installed — the guard IS the filter. */
let filters: [string, unknown][] = [];

vi.mock("@/lib/server/feedback/boards", () => ({
  getPublicBoardForProject: async () => board,
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
        is: (col: string, value: unknown) => {
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
    show_pages: false,
    token: "board-token",
    visible_view_ids: ["view-open", "view-locked"],
    visible_page_ids: [],
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
  it("does not list locked views, even when checked in the settings", async () => {
    const tabs = await getPublicSiteTabs({
      projectId: "proj",
      feedbackLabel: "Feedback",
      untitledLabel: "Untitled page",
      current: { kind: "feedback" },
    });
    expect(tabs.map((t) => t.href)).toEqual(["/f/board-token", "/share/tok-open"]);
    // Neither the name nor the token: the query discards them at the source
    // rather than read them and then throw them away.
    expect(filters).toContainEqual(["level", "public"]);
    expect(JSON.stringify(tabs)).not.toContain("tok-locked");
    expect(JSON.stringify(tabs)).not.toContain("Interne");
  });

  it("renders an empty navigation when the only shared view is locked", async () => {
    shares = shares.filter((s) => s.level === "password");
    // Only one tab remaining (the board) = nothing to show.
    expect(
      await getPublicSiteTabs({
        projectId: "proj",
        feedbackLabel: "Feedback",
        untitledLabel: "Untitled page",
        current: { kind: "feedback" },
      })
    ).toEqual([]);
  });

  it("lists checked public pages as tabs, after the shared views", async () => {
    board = { ...board, show_pages: true, visible_page_ids: ["page-doc"] };
    shares.push({
      token: "tok-page",
      level: "public",
      pages: { id: "page-doc", title: "Guide", project_id: "proj" },
    });
    const tabs = await getPublicSiteTabs({
      projectId: "proj",
      feedbackLabel: "Feedback",
      untitledLabel: "Untitled page",
      current: { kind: "page", shareToken: "tok-page" },
    });
    expect(tabs.map((t) => t.href)).toEqual([
      "/f/board-token",
      "/share/tok-open",
      "/p/tok-page",
    ]);
    // The published page itself is the current surface → its tab is active.
    expect(tabs[2]).toEqual({ label: "Guide", href: "/p/tok-page", active: true });
  });

  it("does not list protected pages, even when checked in the settings", async () => {
    board = { ...board, show_pages: true, visible_page_ids: ["page-secret"] };
    shares.push({
      token: "tok-secret",
      level: "password",
      pages: { id: "page-secret", title: "Confidentiel", project_id: "proj" },
    });
    const tabs = await getPublicSiteTabs({
      projectId: "proj",
      feedbackLabel: "Feedback",
      untitledLabel: "Untitled page",
      current: { kind: "feedback" },
    });
    // Same MIN-342 discretion as views: no name, no token in the payload.
    expect(JSON.stringify(tabs)).not.toContain("tok-secret");
    expect(JSON.stringify(tabs)).not.toContain("Confidentiel");
  });

  it("keeps pages opt-in: unchecked pages stay out, the switch silences all of them", async () => {
    board = {
      ...board,
      show_pages: false,
      visible_page_ids: ["page-doc"],
    };
    shares.push({
      token: "tok-page",
      level: "public",
      pages: { id: "page-doc", title: "Guide", project_id: "proj" },
    });
    const tabs = await getPublicSiteTabs({
      projectId: "proj",
      feedbackLabel: "Feedback",
      untitledLabel: "Untitled page",
      current: { kind: "feedback" },
    });
    // The switch is off: a stale selection must not resurrect the tabs.
    expect(tabs.map((t) => t.href)).toEqual(["/f/board-token", "/share/tok-open"]);

    board = { ...board, show_pages: true, visible_page_ids: [] };
    const withoutPage = await getPublicSiteTabs({
      projectId: "proj",
      feedbackLabel: "Feedback",
      untitledLabel: "Untitled page",
      current: { kind: "feedback" },
    });
    expect(withoutPage.map((t) => t.href)).toEqual([
      "/f/board-token",
      "/share/tok-open",
    ]);
  });

  it("falls back to the untitled label for a page without a title", async () => {
    board = { ...board, show_pages: true, visible_page_ids: ["page-doc"] };
    shares.push({
      token: "tok-page",
      level: "public",
      pages: { id: "page-doc", title: "", project_id: "proj" },
    });
    const tabs = await getPublicSiteTabs({
      projectId: "proj",
      feedbackLabel: "Feedback",
      untitledLabel: "Untitled page",
      current: { kind: "feedback" },
    });
    expect(tabs.at(-1)).toMatchObject({ label: "Untitled page", href: "/p/tok-page" });
  });

  it("renders an empty navigation when neither family is armed", async () => {
    board = { ...board, show_views: false };
    expect(
      await getPublicSiteTabs({
        projectId: "proj",
        feedbackLabel: "Feedback",
        untitledLabel: "Untitled page",
        current: { kind: "feedback" },
      })
    ).toEqual([]);
  });
});
