import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => ({
  projects: new Map<string, string>(),
  pages: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/server/api-auth", () => ({ verifiedSessionUserId: vi.fn() }));
vi.mock("@/lib/server/route-refs", () => ({
  resolveProjectSegment: async (segment: string) => refs.projects.get(segment) ?? null,
  resolveRouteRef: async (_table: "pages", ref: string) => refs.pages.get(ref) ?? null,
}));

import { hasServerSeedRoute, serverSeedPaths } from "./server-seed";

const P = "9e3d0c35-c1d7-4d2a-983d-8190638cc887";
const PAGE = "82a6b365-a512-426e-a841-743e3075ef7a";
const api = `/api/projects/${P}`;
/** The page's own reads, without the shell's. */
const pageReads = async (location: string) => {
  const shell = new Set(await serverSeedPaths("/settings", null));
  return (await serverSeedPaths(location, null)).filter((path) => !shell.has(path));
};

beforeEach(() => {
  refs.projects = new Map([["aur-9e3d0c35", P]]);
  refs.pages = new Map([["82a6b365", PAGE]]);
});

describe("reads a page load carries (MIN-880)", () => {
  it("names each project page's reads before its first content", async () => {
    expect(await pageReads("/projects/aur-9e3d0c35/objectives")).toEqual([
      `${api}/feedback/counts`, `${api}/objectives`, `${api}/issues`, `${api}/members`, `${api}/issue-relations`, `${api}/pages`,
    ]);
    expect(await pageReads("/projects/aur-9e3d0c35/pages")).toEqual([`${api}/feedback/counts`, `${api}/pages`]);
    expect(await pageReads("/projects/aur-9e3d0c35/pages/82a6b365")).toEqual([
      `${api}/feedback/counts`, `${api}/pages`, `${api}/pages/${PAGE}`,
    ]);
    expect(await pageReads("/projects/aur-9e3d0c35/triage")).toContain(`${api}/integrations`);
  });

  it("carries the team list only for a bare feedback URL, whose read the server knows exactly", async () => {
    const list = `${api}/feedback?statuses=open&statuses=planned&statuses=in_progress&prepare=unresolved.top.0`;
    expect(await pageReads("/projects/aur-9e3d0c35/feedback")).toContain(list);
    expect(await pageReads("/projects/aur-9e3d0c35/feedback?post=abc")).not.toContain(list);
  });

  it("carries the statistics only on the general tab of project settings", async () => {
    expect(await pageReads("/projects/aur-9e3d0c35/settings")).toContain(`${api}/pull-request-stats`);
    expect(await pageReads("/projects/aur-9e3d0c35/settings?tab=general")).toContain(`${api}/pull-request-stats`);
    expect(await pageReads("/projects/aur-9e3d0c35/settings?tab=members")).toEqual([`${api}/feedback/counts`]);
  });

  it("reads nothing for a project or page this account cannot resolve, or an unknown section", async () => {
    expect(await pageReads("/projects/xyz-00000000/objectives")).toEqual([]);
    expect(await pageReads("/projects/aur-9e3d0c35/pages/ffffffff")).toEqual([`${api}/feedback/counts`, `${api}/pages`]);
    expect(await pageReads("/projects/aur-9e3d0c35/pages-print")).toEqual([]);
    expect(await pageReads("/projects/aur-9e3d0c35/triage/82a6b365")).toEqual([]);
  });

  it("names the routines and admin reads", async () => {
    expect(await pageReads("/routines")).toEqual(["/api/routines", "/api/agent/models"]);
    expect(await pageReads("/admin")).toEqual(["/api/admin/capabilities", "/api/admin/overview"]);
  });

  it("has a route for every read it names", async () => {
    const locations = ["/all", "/routines", "/admin", "/projects/aur-9e3d0c35", "/projects/aur-9e3d0c35/objectives",
      "/projects/aur-9e3d0c35/feedback", "/projects/aur-9e3d0c35/triage", "/projects/aur-9e3d0c35/settings",
      "/projects/aur-9e3d0c35/pages/82a6b365"];
    for (const location of locations) {
      for (const path of await serverSeedPaths(location, "Europe/Paris")) expect(hasServerSeedRoute(path), path).toBe(true);
    }
  });
});
