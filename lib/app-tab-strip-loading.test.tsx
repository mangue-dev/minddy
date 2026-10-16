// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppTabSkeleton } from "@/components/app-tab-skeleton";

describe("AppTabSkeleton", () => {
  it("announces the loading tab list and draws shimmering placeholder tabs, not a spinner", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<AppTabSkeleton label="Loading…" />);
    const status = container.querySelector("[data-app-tab-skeleton]");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-label")).toBe("Loading…");
    const placeholders = status?.querySelectorAll(".app-tab-skeleton") ?? [];
    expect(placeholders).toHaveLength(3);
    expect([...placeholders].every((node) => node.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
