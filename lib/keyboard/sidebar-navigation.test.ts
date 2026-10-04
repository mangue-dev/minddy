// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateSidebarOption } from "./sidebar-navigation";

beforeEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(Element.prototype, "checkVisibility", {
    configurable: true,
    value() { return !this.closest('[style*="display: none"]'); },
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true, value: vi.fn(),
  });
});

describe("sidebar shortcut activation", () => {
  it.each(["home", "project", "secondary"])("activates and wraps through %s options", (level) => {
    const marker = level === "secondary" ? "data-sidebar-filter-result" : "data-sidebar-navigation-item";
    document.body.innerHTML = `<aside data-sidebar-navigation>
      <div data-sidebar-panel="${level}">
        <button ${marker}>First</button>
        <button ${marker} aria-current="true">Current</button>
        <button ${marker}>Last</button>
      </div>
    </aside>`;
    const [first, current, last] = Array.from(document.querySelectorAll("button"));
    const clicked = vi.fn();
    document.body.addEventListener("click", clicked);
    expect(activateSidebarOption(1)).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(clicked.mock.calls[0][0].target).toBe(last);
    expect(clicked.mock.calls[0][0].shiftKey).toBe(false);
    activateSidebarOption(1);
    expect(document.activeElement).toBe(first);
    activateSidebarOption(-1);
    expect(document.activeElement).toBe(last);
    activateSidebarOption(-1);
    expect(document.activeElement).toBe(current);
    document.body.removeEventListener("click", clicked);
  });

  it("skips hidden, exiting, disabled, collapsed and offscreen options and unrelated results", () => {
    document.body.innerHTML = `<aside data-sidebar-navigation>
      <div aria-hidden="true"><button data-sidebar-navigation-item>Old panel</button></div>
      <div inert><button data-sidebar-filter-result>Retained panel</button></div>
      <div hidden><button data-sidebar-filter-result>Collapsed page</button></div>
      <div style="display: none"><button data-sidebar-filter-result>Inactive tab</button></div>
      <button data-sidebar-filter-result disabled>Disabled</button>
      <a data-sidebar-navigation-item aria-disabled="true">Unavailable</a>
      <button data-sidebar-navigation-item id="available">Available</button>
      <button>More actions</button>
    </aside>
    <div class="sidebar-nav-panel" data-open="false"><aside data-sidebar-navigation>
      <button data-sidebar-navigation-item>Hidden sidebar</button>
    </aside></div>
    <button data-sidebar-filter-result>Inbox result outside sidebar</button>`;
    const available = document.getElementById("available");
    expect(activateSidebarOption(1)).toBe(true);
    expect(document.activeElement).toBe(available);
    activateSidebarOption(1);
    expect(document.activeElement).toBe(available);
  });

  it("navigates the rendered page-tree order and ignores nested action buttons", () => {
    document.body.innerHTML = `<aside data-sidebar-navigation>
      <a href="#parent" data-sidebar-filter-result aria-current="page"><span>Parent</span></a>
      <a href="#child" data-sidebar-filter-result>Expanded child</a>
      <button aria-expanded="false">Expand another page</button>
      <a href="#sibling" data-sidebar-filter-result>Sibling</a>
    </aside>`;
    activateSidebarOption(1);
    expect(document.activeElement?.getAttribute("href")).toBe("#child");
    activateSidebarOption(1);
    expect(document.activeElement?.getAttribute("href")).toBe("#sibling");
  });

  it("starts at the appropriate end without selection and handles empty lists", () => {
    expect(activateSidebarOption(1)).toBe(false);
    document.body.innerHTML = `<aside data-sidebar-navigation>
      <button data-sidebar-navigation-item>First</button>
      <button data-sidebar-navigation-item>Last</button>
    </aside>`;
    activateSidebarOption(-1);
    expect(document.activeElement?.textContent).toBe("Last");
    (document.activeElement as HTMLElement).blur();
    activateSidebarOption(1);
    expect(document.activeElement?.textContent).toBe("First");
  });
});
