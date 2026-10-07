import { readFileSync } from "node:fs";
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

describe("application content header", () => {
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
    // The floating panel is collected BEFORE the header in layout order, so
    // its no-drag cannot dig the header's drag rect over the overlap: while
    // the panel is shown, the header must give up its window handle.
    expect(styles).toMatch(
      /html\[data-desktop-platform="darwin"\] body\[data-sidebar-floating="true"\]\s*\.app-content-header\s*\{\s*-webkit-app-region:\s*no-drag;/,
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

});
