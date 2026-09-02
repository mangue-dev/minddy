import { describe, expect, it, vi } from "vitest";

import {
  pageHref,
  pagesHref,
  pushPagesHistory,
  replacePagesHistory,
} from "./pages-navigation";

describe("pages navigation", () => {
  it("builds encoded canonical page URLs", () => {
    expect(pagesHref("project/id")).toBe("/projects/project%2Fid/pages");
    expect(pageHref("project/id", "page?one")).toBe(
      "/projects/project%2Fid/pages/page%3Fone",
    );
  });

  it("updates browser history without requesting an RSC route", () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();

    pushPagesHistory("/projects/p/pages/one", { pushState });
    replacePagesHistory("/projects/p/pages/two", { replaceState });

    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/projects/p/pages/one",
    );
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/projects/p/pages/two",
    );
  });
});
