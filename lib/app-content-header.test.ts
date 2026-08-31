import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/app-content-header.tsx"),
  "utf8",
);
const styles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const inbox = readFileSync(
  join(process.cwd(), "app/(app)/inbox/page.tsx"),
  "utf8",
);
const trash = readFileSync(
  join(process.cwd(), "app/(app)/trash/page.tsx"),
  "utf8",
);

function tsxFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("application content header", () => {
  it("stays above the scrolling content pane", () => {
    expect(source).toContain("sticky top-0 z-[35]");
    expect(source).toContain("bg-background");
  });

  it("keeps its fixed geometry and horizontal overflow behavior", () => {
    expect(source).toContain("h-[60px] shrink-0");
    expect(source).toContain("overflow-x-auto overflow-y-hidden");
    expect(source).toContain("overscroll-x-contain");
  });

  it("moves the macOS window from empty space without swallowing controls", () => {
    expect(source).toContain("app-content-header sticky");
    expect(styles).toMatch(
      /html\[data-desktop-platform="darwin"\] \.app-content-header\s*\{\s*-webkit-app-region:\s*drag;/,
    );
    expect(styles).toMatch(
      /html\[data-desktop-platform="darwin"\] \.app-content-header[\s\S]*?:is\([\s\S]*?button,[\s\S]*?\)\s*\{\s*-webkit-app-region:\s*no-drag;/,
    );
  });

  it("covers every application content pane with a 60 px action header", () => {
    expect(inbox).toContain("<AppContentHeader");
    expect(trash).toContain("<AppContentHeader");
    expect(inbox).not.toContain('<header className="flex h-[60px]');
    expect(trash).not.toContain('<header className="flex h-[60px]');
  });

  it("keeps every 60 px application strip on an audited chrome contract", () => {
    const files = [
      ...tsxFiles(join(process.cwd(), "app/(app)")),
      ...tsxFiles(join(process.cwd(), "components")),
    ];
    const strips = files.flatMap((file) => {
      const content = readFileSync(file, "utf8");
      return [...content.matchAll(/<[^>]+h-\[60px\][^>]*>/gs)].map(
        ([tag]) => ({ file, tag }),
      );
    });
    const contracts = [
      "app-content-header",
      "compact-window-controls-clearance",
      "secondary-sidebar-header",
      "secondary-sidebar-header-placeholder",
      "sidebar-brand-row",
    ];

    expect(
      strips.filter(({ tag }) => !contracts.some((name) => tag.includes(name))),
    ).toEqual([]);
  });
});
