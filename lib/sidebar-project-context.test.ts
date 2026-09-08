import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  join(process.cwd(), "components/app-sidebar.tsx"),
  "utf8",
);
const shell = readFileSync(
  join(process.cwd(), "components/app-shell-chrome.tsx"),
  "utf8",
);

describe("primary sidebar project context", () => {
  it("replaces the project-mode Home row with a split context control", () => {
    expect(sidebar).toContain('item.key === "home-back" && currentProject');
    expect(sidebar).toContain("<ProjectContextRow");
    expect(sidebar).toContain("<ChevronLeft");
    expect(sidebar).toContain("<Home");
    expect(sidebar).toContain("<DropdownMenuTrigger");
  });

  it("shows only the current project orb in rail mode", () => {
    const contextRow = sidebar.slice(sidebar.indexOf("function ProjectContextRow"));
    expect(contextRow).toContain("collapsed ? (");
    expect(contextRow).toContain("<ProjectOrb");
    expect(contextRow.indexOf("collapsed ? (")).toBeLessThan(
      contextRow.indexOf("<ChevronLeft"),
    );
  });

  it("keeps project data and menu state wired through the persistent sidebar", () => {
    expect(shell.match(/<AppSidebar\s/g)).toHaveLength(1);
    expect(shell.match(/currentProject=\{currentProject\}/g)).toHaveLength(1);
    expect(shell.match(/projects=\{projects\}/g)).toHaveLength(1);
    expect(sidebar.match(/<SidebarNav\s/g)).toHaveLength(1);
    expect(sidebar.match(/onMenuOpenChange=\{handleMenuOpenChange\}/g)).toHaveLength(2);
    expect(shell).toContain("pinned={sidebarLayerOpen || inboxOpen}");
    expect(shell).toContain("onLayerOpenChange={setSidebarLayerOpen}");
    expect(shell).toContain("overlay={!sidebarHidden && secondaryNav}");
  });

  it("keeps the rail expanded while the inbox popover owns focus", () => {
    expect(shell).toContain("inboxOpen={inboxOpen}");
    expect(shell).toContain("<InboxPopover open={inboxOpen} onOpenChange={setInboxOpen}");
    expect(sidebar).toContain("!(hovered || focusWithin || menuOpen || inboxOpen)");
  });

  it("keeps the current project tab when building switch destinations", () => {
    expect(sidebar).toContain("projectTabHref(pathname, project.id)");
  });
});
