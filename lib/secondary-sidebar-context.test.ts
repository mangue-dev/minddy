import { describe, expect, it } from "vitest";

import {
  routeHasSecondaryNav,
  sidebarPanelForRoute,
} from "./secondary-sidebar-context";
import { readFileSync } from "node:fs";

describe("routeHasSecondaryNav", () => {
  it("reserves the secondary sidebar while the trash route hydrates", () => {
    expect(routeHasSecondaryNav("/trash")).toBe(true);
  });

  it("offers navigation actions for links and declared row destinations", () => {
    const sidebar = readFileSync("components/secondary-sidebar.tsx", "utf8");
    expect(sidebar).toContain('"a[href], [data-navigation-href]"');
    expect(sidebar).toContain("useNavigationContextActions(navigationMenu?.href)");
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
