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
const topBar = readFileSync(
  join(process.cwd(), "components/app-top-bar.tsx"),
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

  it("shows the split context control (home + current project)", () => {
    const contextRow = sidebar.slice(sidebar.indexOf("function ProjectContextRow"));
    expect(contextRow).toContain("<ProjectOrb");
    expect(contextRow).toContain("<ChevronLeft");
    expect(contextRow).toContain("<ChevronDown");
    expect(contextRow).toContain("<DropdownMenuTrigger");
  });

  it("keeps project data and menu state wired through the persistent sidebar", () => {
    expect(shell.match(/<AppSidebar\s/g)).toHaveLength(1);
    expect(shell.match(/currentProject=\{currentProject\}/g)).toHaveLength(1);
    expect(shell.match(/projects=\{projects\}/g)).toHaveLength(1);
    // Two nav panels share the wiring: the project panel of the route, and
    // the home panel the back rows lift to from a project page.
    expect(sidebar.match(/<SidebarNav\s/g)).toHaveLength(2);
    expect(sidebar.match(/onMenuOpenChange=\{handleMenuOpenChange\}/g)).toHaveLength(3);
    expect(shell).toContain("pinned={sidebarLayerOpen}");
    expect(shell).toContain("onLayerOpenChange={setSidebarLayerOpen}");
    expect(shell).toContain("homeSections={homeDesktopSections}");
  });

  it("keeps the back rows sidebar-only: they lift a level, they never navigate", () => {
    expect(sidebar).not.toContain("router.push");
    expect(sidebar).toContain("onClick={goBack}");
    expect(sidebar).toContain("onClick={onBack}");
  });

  it("hosts the inbox in the top bar independently of sidebar expansion", () => {
    expect(shell).toMatch(/<AppTopBar\b[^>]*inbox=\{inboxItem\}/);
    expect(topBar).toMatch(/<AppTopActions\b[^>]*inbox=\{inbox\}/);
    expect(shell).toContain("<InboxPopover open={inboxOpen} onOpenChange={setInboxOpen}");
    expect(sidebar).toContain("onLayerOpenChange?.(open)");
  });

  it("keeps the current project tab when building switch destinations", () => {
    expect(sidebar).toContain("projectTabHref(pathname, project.id)");
  });
});
