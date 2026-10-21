import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const shell = readFileSync(join(process.cwd(), "components/app-shell-chrome.tsx"), "utf8");

/** The source of one `const name = useCallback(...)`, up to its dependency list. */
function callback(name: string): string {
  const start = shell.indexOf(`const ${name} = useCallback(`);
  expect(start, name).toBeGreaterThan(-1);
  return shell.slice(start, shell.indexOf("\n  );\n", start));
}

// Which projects are visible is pinned by `visibleNavigationProjects`
// (lib/use-hidden-projects.test.tsx); this pins that ⌘K reads it (MIN-751).
describe("command palette and hidden projects", () => {
  it("resolves pages, tickets and objectives through the visible projects only", () => {
    expect(shell).toContain("new Map(switcherProjects.map((p) => [p.id, p]))");
    for (const name of ["buildPageItem", "buildDataGroups"]) {
      const source = callback(name);
      expect(source, name).toContain("paletteProjectById.get(");
      expect(source, name).not.toMatch(/[^.\w]projectById\.get\(/);
    }
  });

  it("lists only visible projects in the project switch and navigation groups", () => {
    const projectsGroup = shell.slice(shell.indexOf('key: "projects",'), shell.indexOf("for (const p of switcherProjects)"));
    expect(projectsGroup).toContain("items: switcherProjects.map(");
    expect(shell).not.toContain("for (const p of projects)");
  });
});
