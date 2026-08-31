import { describe, expect, it } from "vitest";

import { routeHasSecondaryNav } from "./secondary-sidebar-context";

describe("routeHasSecondaryNav", () => {
  it("reserves the secondary sidebar while the trash route hydrates", () => {
    expect(routeHasSecondaryNav("/trash")).toBe(true);
  });
});
