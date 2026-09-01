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

  it("keeps project data and menu state wired through both sidebar branches", () => {
    expect(shell.match(/currentProject=\{currentProject\}/g)).toHaveLength(2);
    expect(shell.match(/projects=\{projects\}/g)).toHaveLength(2);
    expect(sidebar.match(/onMenuOpenChange=\{handleMenuOpenChange\}/g)).toHaveLength(3);
    expect(shell).toContain("pinned={zenSidebarLayerOpen}");
    expect(shell).toContain("onLayerOpenChange={setZenSidebarLayerOpen}");
  });

  it("keeps the current project tab when building switch destinations", () => {
    expect(sidebar).toContain("projectTabHref(pathname, project.id)");
  });
});
