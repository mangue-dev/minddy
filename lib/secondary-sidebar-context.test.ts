import { describe, expect, it } from "vitest";

import {
  navigationEndsBrowseNow,
  routeHasSecondaryNav,
  sidebarLocationKey,
  sidebarPanelForRoute,
} from "./secondary-sidebar-context";
import { readFileSync } from "node:fs";

describe("routeHasSecondaryNav", () => {
  it("reserves the secondary sidebar while the trash route hydrates", () => {
    expect(routeHasSecondaryNav("/trash")).toBe(true);
  });

  it("hosts the objectives bar on an objective's board, not on the plain board", () => {
    expect(routeHasSecondaryNav("/projects/p", "o")).toBe(true);
    expect(routeHasSecondaryNav("/projects/p")).toBe(false);
    expect(routeHasSecondaryNav("/projects/p/pages/x", "o")).toBe(true);
  });

  it("offers navigation actions for links and declared row destinations", () => {
    const sidebar = readFileSync("components/secondary-sidebar.tsx", "utf8");
    expect(sidebar).toContain('"a[href], [data-navigation-href]"');
    expect(sidebar).toContain("useNavigationContextActions(menu?.href)");
  });
});

describe("sidebarPanelForRoute", () => {
  // A project's level-3 page: tickets, pages, triage…
  const projectSubPage = { hasBackRow: true, hasProject: true };

  it("shows the teleported bar at the route's own level", () => {
    expect(sidebarPanelForRoute(projectSubPage.hasBackRow, projectSubPage.hasProject, 0)).toBe(
      "secondary",
    );
  });

  it("steps back to the project panel without navigating", () => {
    expect(sidebarPanelForRoute(projectSubPage.hasBackRow, projectSubPage.hasProject, 1)).toBe(
      "project",
    );
  });

  it("steps back once more to the home panel", () => {
    expect(sidebarPanelForRoute(projectSubPage.hasBackRow, projectSubPage.hasProject, 2)).toBe(
      "home",
    );
  });

  it("keeps a project root at its own panel and lifts to home on one press", () => {
    expect(sidebarPanelForRoute(false, true, 0)).toBe("project");
    expect(sidebarPanelForRoute(false, true, 1)).toBe("home");
  });

  it("lifts a global page straight to the home panel", () => {
    expect(sidebarPanelForRoute(true, false, 0)).toBe("secondary");
    expect(sidebarPanelForRoute(true, false, 1)).toBe("home");
  });

  it("keeps the home routes at the home panel", () => {
    expect(sidebarPanelForRoute(false, false, 0)).toBe("home");
  });
});

describe("sidebar browse anchoring (MIN-877)", () => {
  it("tells an objective's board from the plain board, and ignores the objective elsewhere", () => {
    expect(sidebarLocationKey("/projects/p", "o")).not.toBe(sidebarLocationKey("/projects/p", null));
    expect(sidebarLocationKey("/projects/p/pages", "o")).toBe(sidebarLocationKey("/projects/p/pages", null));
  });

  it("ends the browse at once only for a destination on the current location", () => {
    const objectives = sidebarLocationKey("/projects/p/objectives", null);
    expect(navigationEndsBrowseNow("/projects/p/objectives", objectives)).toBe(true);
    expect(navigationEndsBrowseNow("/projects/p/objectives?sort=name#top", objectives)).toBe(true);
    expect(navigationEndsBrowseNow("/projects/p", objectives)).toBe(false);

    const objectiveBoard = sidebarLocationKey("/projects/p", "o");
    expect(navigationEndsBrowseNow("/projects/p?objective=o", objectiveBoard)).toBe(true);
    expect(navigationEndsBrowseNow("/projects/p", objectiveBoard)).toBe(false);
  });
});
