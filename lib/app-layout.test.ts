// @vitest-environment jsdom
import { APP_LAYOUT_BOOTSTRAP } from "./app-layout-bootstrap.generated";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_LAYOUT_POLICY, isMobileLayout, resolveMobileLayout, subscribeAppLayout, type AppLayoutInput } from "./app-layout";

const input = (width: number, height: number, touch = true, orientation: AppLayoutInput["orientation"] = height >= width ? "portrait" : "landscape"): AppLayoutInput => ({ width, height, touch, screenWidth: width, screenHeight: height, orientation });
const cases: [string, AppLayoutInput, boolean][] = [
  ["narrow phone cover", input(280, 653), true],
  ["phone portrait", input(390, 844), true],
  ["phone landscape", input(844, 390), true],
  ["wide phone landscape", input(1100, 500), true],
  ["foldable inner square", input(896, 896), true],
  ["foldable inner landscape", input(960, 800), true],
  ["large unfolded landscape", input(1100, 800), false],
  ["tablet portrait", input(820, 1180), true],
  ["large tablet portrait", input(1032, 1376), true],
  ["large tablet landscape", input(1376, 1032), false],
  ["small tablet landscape", input(1024, 768), false],
  ["tablet split window", input(700, 1032), true],
  ["wide tablet portrait boundary", input(1199, 1500), true],
  ["roomy portrait viewport", input(1200, 1600), false],
  ["desktop below boundary", input(1023, 900, false), true],
  ["desktop at boundary", input(1024, 900, false), false],
  ["desktop portrait window", input(1100, 1500, false), false],
  ["desktop short window", input(1366, 500, false), false],
];

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete document.documentElement.dataset.appLayout; });

function emulate(value: AppLayoutInput) {
  vi.stubGlobal("innerWidth", value.width);
  vi.stubGlobal("innerHeight", value.height);
  vi.stubGlobal("navigator", { maxTouchPoints: value.touch ? 5 : 0 });
  const orientation = new EventTarget() as EventTarget & { type: string };
  orientation.type = value.orientation === "portrait" ? "portrait-primary" : "landscape-primary";
  vi.stubGlobal("screen", { width: value.screenWidth, height: value.screenHeight, orientation: value.orientation ? orientation : undefined });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width") ? value.width < 1024 : value.touch, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  return orientation;
}

describe("adaptive application layout", () => {
  it.each(cases)("selects the expected layout for %s", (_name, value, mobile) => {
    expect(resolveMobileLayout(value, APP_LAYOUT_POLICY)).toBe(mobile);
    emulate(value);
    expect(isMobileLayout()).toBe(mobile);
    // The pre-paint script must agree with the runtime decision in every case.
    new Function(APP_LAYOUT_BOOTSTRAP)();
    expect(document.documentElement.dataset.appLayout).toBe(mobile ? "mobile" : "desktop");
  });

  it("keeps tablet orientation stable when a keyboard changes viewport shape", () => {
    const portrait = { ...input(1032, 1376), height: 620 };
    expect(resolveMobileLayout(portrait, APP_LAYOUT_POLICY)).toBe(true);
    const landscape = { ...input(1376, 1032), height: 450 };
    expect(resolveMobileLayout(landscape, APP_LAYOUT_POLICY)).toBe(false);
  });

  it("falls back to screen shape without orientation APIs", () => {
    expect(resolveMobileLayout({ ...input(1032, 1376), height: 600, orientation: null }, APP_LAYOUT_POLICY)).toBe(true);
    expect(resolveMobileLayout({ ...input(1100, 800), height: 600, orientation: null }, APP_LAYOUT_POLICY)).toBe(false);
  });

  it("supports the legacy Safari orientation signal", () => {
    emulate({ ...input(1032, 1376), height: 600, orientation: null });
    vi.stubGlobal("orientation", 0);
    expect(isMobileLayout()).toBe(true);
    vi.stubGlobal("orientation", 90);
    expect(isMobileLayout()).toBe(false);
  });

  it("shares rotation/resize listeners and removes them after the final subscriber", () => {
    const orientation = emulate(input(1032, 1376));
    const first = vi.fn(), second = vi.fn();
    const add = vi.spyOn(window, "addEventListener"), remove = vi.spyOn(window, "removeEventListener");
    const stopFirst = subscribeAppLayout(first), stopSecond = subscribeAppLayout(second);
    expect(add.mock.calls.filter(([name]) => name === "resize")).toHaveLength(1);
    expect(document.documentElement.dataset.appLayout).toBe("mobile");
    orientation.type = "landscape-primary";
    vi.stubGlobal("innerWidth", 1376);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    orientation.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.appLayout).toBe("desktop");
    expect(second).toHaveBeenCalledOnce();
    stopFirst();
    window.dispatchEvent(new Event("resize"));
    expect(second).toHaveBeenCalledTimes(2);
    stopSecond();
    expect(remove.mock.calls.filter(([name]) => name === "resize")).toHaveLength(1);
    window.dispatchEvent(new Event("resize"));
    expect(second).toHaveBeenCalledTimes(2);
  });
});
