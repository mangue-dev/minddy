import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("@/components/secondary-sidebar", () => ({ SecondarySidebar: () => null }));
vi.mock("@/components/app-content-header", () => ({ AppContentHeader: () => null }));
vi.mock("@/components/board-loading-skeleton", () => ({ BoardLoadingSkeleton: () => null }));
vi.mock("@/components/pull-requests/pr-loading-skeleton", () => ({ PullRequestsSkeleton: () => null }));

const { routeLoadingComponent } = await import("./route-loading-skeleton");

const APP = path.join(process.cwd(), "app/(app)");

/** Every `loading.tsx` of the authenticated app, as a route sample. */
function loadingFiles(dir = APP): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return loadingFiles(full);
    return entry.name === "loading.tsx" ? [full] : [];
  });
}

it("shows each segment's own loading boundary for a pending destination", async () => {
  const files = loadingFiles();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const segment = path.relative(APP, path.dirname(file)).split(path.sep).join("/");
    const pathname = `/${segment.replace("[id]", "project-1")}`;
    const { default: Loading } = await import(file);
    expect(routeLoadingComponent(pathname), pathname).toBe(Loading);
    // Deeper routes resolve to the nearest boundary, like Next does.
    expect(routeLoadingComponent(`${pathname}/child`), `${pathname}/child`).toBe(
      pathname === "/projects/project-1" ? null : Loading,
    );
  }
});

it("maps redirecting and boundary-less routes", async () => {
  const { default: SettingsLoading } = await import("@/app/(app)/settings/loading");
  expect(routeLoadingComponent("/statistics")).toBe(SettingsLoading);
  expect(routeLoadingComponent("/home")).toBeNull();
  expect(routeLoadingComponent("/numo")).toBeNull();
});
