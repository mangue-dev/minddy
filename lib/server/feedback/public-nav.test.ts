import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-342 — la navigation du site public listait les vues partagées PROTÉGÉES
 * par mot de passe, avec leur nom et leur token. La page de ces vues, elle, ne
 * dit rien d'elle-même tant qu'on n'a pas le mot de passe (pas même son nom) :
 * l'onglet annulait cette discrétion, et donnait l'URL par-dessus.
 */

interface ShareRow {
  token: string;
  level: "public" | "password";
  views: { id: string; name: string; project_id: string };
}

let shares: ShareRow[] = [];
let board: Record<string, unknown> | null = null;
/** Les filtres `.eq()` réellement posés — la garde EST le filtre. */
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
    // Ni le nom, ni le token : la requête les écarte à la source plutôt que de
    // les lire pour les jeter ensuite.
    expect(filters).toContainEqual(["level", "public"]);
    expect(JSON.stringify(tabs)).not.toContain("tok-locked");
    expect(JSON.stringify(tabs)).not.toContain("Interne");
  });

  it("rend une navigation vide quand la seule vue partagée est verrouillée", async () => {
    shares = shares.filter((s) => s.level === "password");
    // Un seul onglet restant (le board) = rien à montrer.
    expect(
      await getPublicSiteTabs({
        projectId: "proj",
        feedbackLabel: "Retours",
        current: { kind: "feedback" },
      })
    ).toEqual([]);
  });
});
