import { afterEach, describe, expect, it, vi } from "vitest";

// Reset only this public code registry between cases; it contains no account data.
afterEach(() => vi.resetModules());

describe("public tab surface preparation", () => {
  it("prepares the complete retained routines and objectives route components", async () => {
    const surfaces = await import("./app-tab-surfaces");
    const { retainedAppViewKind } = await import("./retained-app-views");
    const routines = vi.spyOn(surfaces.appTabSurfaceLoaders, "routines").mockResolvedValue({ default: () => null } as never);
    const objectives = vi.spyOn(surfaces.appTabSurfaceLoaders, "objectives").mockResolvedValue({ default: () => null } as never);
    await Promise.all([surfaces.prepareAppTabSurface("/routines"), surfaces.prepareAppTabSurface("/projects/p/objectives")]);
    expect(routines).toHaveBeenCalledOnce(); expect(objectives).toHaveBeenCalledOnce();
    expect(surfaces.isAppTabSurfaceReady("/routines")).toBe(true);
    expect(surfaces.isAppTabSurfaceReady("/projects/p/objectives")).toBe(true);
    expect(retainedAppViewKind("/routines")).toBe("routines");
    expect(surfaces.preparedCollectionSurface("routines")).toBe((await surfaces.appTabSurfaceLoaders.routines()).default);
    expect(retainedAppViewKind("/projects/p/objectives")).toBe("objectives");
    expect(surfaces.preparedCollectionSurface("objectives")).toBe((await surfaces.appTabSurfaceLoaders.objectives()).default);
  });

  it("shares the same public bundle across tabs and retries a rejected import", async () => {
    const surfaces = await import("./app-tab-surfaces");
    const pages = vi.spyOn(surfaces.appTabSurfaceLoaders, "pages").mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({} as never);
    const first = surfaces.prepareAppTabSurface("/projects/p/pages/a");
    expect(surfaces.prepareAppTabSurface("/projects/other/pages/b")).toBe(first);
    await expect(first).rejects.toThrow("Offline");
    expect(surfaces.isAppTabSurfaceReady("/projects/p/pages/a")).toBe(false);
    await surfaces.prepareAppTabSurface("/projects/p/pages/a");
    expect(pages).toHaveBeenCalledTimes(2);
    expect(surfaces.isAppTabSurfaceReady("/projects/other/pages/b")).toBe(true);
  });
});
