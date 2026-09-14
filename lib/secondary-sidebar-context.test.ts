import { describe, expect, it } from "vitest";

import { routeHasSecondaryNav } from "./secondary-sidebar-context";
import { readFileSync } from "node:fs";

describe("routeHasSecondaryNav", () => {
  it("reserves the secondary sidebar while the trash route hydrates", () => {
    expect(routeHasSecondaryNav("/trash")).toBe(true);
  });

  it("reserves the secondary sidebar on the canonical Numo route", () => {
    expect(routeHasSecondaryNav("/numo")).toBe(true);
  });

  it("offers navigation actions for links and declared row destinations", () => {
    const sidebar = readFileSync("components/secondary-sidebar.tsx", "utf8");
    expect(sidebar).toContain('"a[href], [data-navigation-href]"');
    expect(sidebar).toContain("useNavigationContextActions(navigationMenu?.href)");
  });
});
