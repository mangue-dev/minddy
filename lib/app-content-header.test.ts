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
const billing = readFileSync(
  join(process.cwd(), "app/(app)/billing/page.tsx"),
  "utf8",
);
const statistics = readFileSync(
  join(process.cwd(), "app/(app)/statistics/page.tsx"),
  "utf8",
);
const admin = readFileSync(
  join(process.cwd(), "components/admin/admin-dashboard.tsx"),
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
    expect(source).toContain("h-[var(--app-content-header-height)] shrink-0");
    expect(source).toContain("overflow-x-auto overflow-y-hidden");
    expect(source).toContain("overscroll-x-contain");
    expect(source).toContain("items-center px-[var(--app-content-header-pad-x)]");
  });

  it("keeps the pane radius low while clearing its corner pills", () => {
    // The radius is a tuned value, not derived: 26px would be the exact
    // concentric radius (arc center on the pills' cap center), and it read as
    // too round. 20px stays above the ~16px floor where the arc would cross a
    // 32px pill, and curves away from the pills on the diagonal.
    expect(styles).toContain("--app-pane-radius: 20px;");
  });

  it("gives its pills the same visible margin on the top and both sides", () => {
    // Half the strip minus the 16px radius of a 32px pill = the pills'
    // vertical centering margin, so with the 1px pane border the visible
    // margin is 10px on the top and both sides, on every page.
    expect(styles).toContain(
      "--app-content-header-pad-x: calc(\n    (var(--app-content-header-height) - 32px) / 2\n  );",
    );
    expect(source).toContain("px-[var(--app-content-header-pad-x)]");
  });

  it("owns equal edge padding instead of letting pages widen it", () => {
    const files = [
      ...tsxFiles(join(process.cwd(), "app/(app)")),
      ...tsxFiles(join(process.cwd(), "components")),
    ];
    const overrides = files.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /<AppContentHeader[^>]*contentClassName="[^"]*px-/m.test(content);
    });

    expect(overrides).toEqual([]);
  });

  it("moves the macOS window from empty space without swallowing controls", () => {
    expect(source).toContain("app-content-header sticky");
    expect(styles).toMatch(
      /html\[data-desktop-platform="darwin"\] \.app-content-header\s*\{\s*-webkit-app-region:\s*drag;/,
    );
    expect(styles).toMatch(
      /html\[data-desktop-platform="darwin"\] \.app-content-header[\s\S]*?:is\([\s\S]*?button,[\s\S]*?\)\s*\{\s*-webkit-app-region:\s*no-drag;/,
    );
    expect(styles).toMatch(
      /html\[data-desktop-app\] \.sidebar-nav-panel\s*\{\s*-webkit-app-region:\s*no-drag;/,
    );
  });

  it("keeps the trash content pane under the shared action header", () => {
    expect(trash).toContain("<AppContentHeader");
    expect(trash).not.toContain('<header className="flex h-[60px]');
  });

  it("redirects the former inbox page to the popover without a page header", () => {
    expect(inbox).toContain('redirect("/home?inbox=1")');
    expect(inbox).not.toContain("<AppContentHeader");
  });

  it("uses fixed headers and faded scroll panes on account-level pages", () => {
    for (const page of [billing, statistics, admin]) {
      expect(page).toContain("<AppContentHeader");
      expect(page).toContain("useScrollFade<HTMLDivElement>()");
      expect(page).toContain("{...contentFade.scrollProps}");
    }

    expect(billing).toContain('t("manageSubscription")');
    expect(billing).not.toContain('t("pageTitle")');
    expect(statistics).not.toContain('t("subtitle")');
    expect(admin).not.toContain('className="md:hidden"\n          contentClassName');
  });

  it("keeps every shared-height application strip on an audited chrome contract", () => {
    const files = [
      ...tsxFiles(join(process.cwd(), "app/(app)")),
      ...tsxFiles(join(process.cwd(), "components")),
    ];
    const strips = files.flatMap((file) => {
      const content = readFileSync(file, "utf8");
      return [...content.matchAll(/<[^>]+h-\[var\(--app-content-header-height\)\][^>]*>/gs)].map(
        ([tag]) => ({ file, tag }),
      );
    });
    expect(strips.length).toBeGreaterThanOrEqual(5);
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
