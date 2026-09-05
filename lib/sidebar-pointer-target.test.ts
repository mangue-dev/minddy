// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isSidebarPointerTarget } from "./sidebar-pointer-target";

afterEach(() => document.body.replaceChildren());

describe("sidebar pointer targets", () => {
  it("includes nested help-menu content rendered through a portal", () => {
    document.body.innerHTML = '<aside id="rail"><button>Help</button></aside><div data-sidebar-owner="rail"><button><span>Feedback</span></button></div><main>Page</main>';
    const rail = document.querySelector("aside");
    expect(isSidebarPointerTarget(rail, rail?.firstChild ?? null)).toBe(true);
    expect(isSidebarPointerTarget(rail, document.querySelector("span"))).toBe(true);
    expect(isSidebarPointerTarget(rail, document.querySelector("span")?.firstChild ?? null)).toBe(true);
    expect(isSidebarPointerTarget(rail, document.querySelector("main"))).toBe(false);
  });

  it("does not treat another sidebar's portal or a lost pointer as internal", () => {
    document.body.innerHTML = '<aside id="rail"></aside><div data-sidebar-owner="other">Menu</div>';
    const rail = document.querySelector("aside");
    expect(isSidebarPointerTarget(rail, document.querySelector("div"))).toBe(false);
    expect(isSidebarPointerTarget(rail, null)).toBe(false);
    expect(isSidebarPointerTarget(rail, window)).toBe(false);
    expect(isSidebarPointerTarget(null, document.body)).toBe(false);
  });
});
