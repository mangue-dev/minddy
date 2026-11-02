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
    expect(sidebar).toContain("icon={ArrowLeft01Icon}");
    expect(sidebar).toContain("icon={Home01Icon}");
    expect(sidebar).toContain("<DropdownMenuTrigger");
  });

  it("shows the split context control (home + current project)", () => {
    const contextRow = sidebar.slice(sidebar.indexOf("function ProjectContextRow"));
    expect(contextRow).toContain("icon={ArrowLeft01Icon}");
    expect(contextRow).toContain("<ProjectTriggerContent project={currentProject} />");
    // Desktop picks from the shared switcher; the mobile sheet from a dialog.
    expect(contextRow).toContain("<ProjectSwitcher currentProject={currentProject}");
    expect(contextRow).toContain("<Dialog open={pickerOpen}");
  });

  it("puts the project switcher beside the back row of a project's pages", () => {
    const backRow = sidebar.slice(sidebar.indexOf("<SidebarBackRow label={back.label}"));
    expect(backRow).toMatch(/trailing=\{currentProject && projectSegmentFromPath\(pathname\)/);
    expect(backRow).toContain("objectiveBoard={objectiveBoard}");
    // The back button keeps its label whole next to the switcher.
    expect(sidebar).toContain('trailing != null ? "max-w-1/2 shrink-0" : "w-full"');
  });

  it("keeps project data and menu state wired through the persistent sidebar", () => {
    expect(shell.match(/<AppSidebar\s/g)).toHaveLength(1);
    expect(shell.match(/currentProject=\{currentProject\}/g)).toHaveLength(1);
    // The switcher lists my visible projects plus the one on screen (MIN-692).
    expect(shell.match(/projects=\{switcherProjects\}/g)).toHaveLength(1);
    // Two nav panels share the wiring: the project panel of the route, and
    // the home panel the back rows lift to from a project page.
    expect(sidebar.match(/<SidebarNav\s/g)).toHaveLength(2);
    // …plus the switcher beside the back row of a project's pages.
    expect(sidebar.match(/onMenuOpenChange=\{handleMenuOpenChange\}/g)).toHaveLength(3);
    expect(sidebar).toContain("<SidebarFrame id={railId} onLayerOpenChange={handleMenuOpenChange}>");
    expect(sidebar).toContain("<SidebarFooter portalOwner={id} mobile={mobile} onMenuOpenChange={onLayerOpenChange}");
    expect(shell).toContain("pinned={sidebarLayerOpen}");
    expect(shell).toContain("onLayerOpenChange={setSidebarLayerOpen}");
    expect(shell).toContain("homeSections={homeDesktopSections}");
  });

  it("keeps the back rows sidebar-only: they lift a level, they never navigate", () => {
    expect(sidebar).not.toContain("router.push");
    expect(sidebar).toContain("<SidebarBackRow label={back.label} onBack={goBack}");
    expect(sidebar).toContain("onClick={onBack}");
  });

  it("hosts the inbox in the top bar independently of sidebar expansion", () => {
    expect(shell).toMatch(/<AppTopBar\b[^>]*inbox=\{inboxItem\}/);
    expect(topBar).toMatch(/<AppTopActions\b[^>]*inbox=\{inbox\}/);
    expect(shell).toContain("<InboxPopover open={inboxOpen} onOpenChange={setInboxOpen}");
    expect(sidebar).toContain("onLayerOpenChange?.(open)");
  });

  it("keeps the current project tab when building switch destinations", () => {
    expect(sidebar).toContain("projectTabHref(pathname, project, objectiveBoard)");
  });
});
