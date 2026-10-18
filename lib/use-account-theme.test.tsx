// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Meta = Record<string, unknown>;

const h = vi.hoisted(() => ({
  user: null as null | { id: string; user_metadata: Meta },
  writes: [] as { patch: Meta; settle: (ok: boolean) => void }[],
  setTheme: vi.fn(),
  track: vi.fn(),
}));

vi.mock("mangue-ui/components/theme-provider", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "dark", setTheme: h.setTheme }),
}));
vi.mock("./use-analytics", () => ({ useAnalytics: () => ({ track: h.track }) }));
vi.mock("./auth-context", () => ({
  useAuth: () => ({
    user: h.user,
    // Each write stays pending until the test settles it, so ordering and
    // supersession are observable.
    updateUserMetadata: (patch: Meta) =>
      new Promise<void>((resolve, reject) => {
        h.writes.push({
          patch,
          settle: (ok) => {
            if (ok && h.user) h.user = { ...h.user, user_metadata: { ...h.user.user_metadata, ...patch } };
            if (ok) resolve();
            else reject(new Error("network"));
          },
        });
      }),
  }),
}));

import { useAccountTheme } from "./use-account-theme";
import { ThemeAccountSync } from "@/components/theme-account-sync";

let root: Root;
let container: HTMLDivElement;
let hook: ReturnType<typeof useAccountTheme>;

function Probe() {
  hook = useAccountTheme();
  return createElement("output", {
    "data-light": hook.appearance.light,
    "data-dark": hook.appearance.dark,
    "data-glass": String(hook.appearance.transparency),
  });
}

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

const html = () => document.documentElement;
const output = () => container.querySelector("output")!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.user = { id: "u1", user_metadata: {} };
  h.writes = [];
  for (const name of ["data-theme-light", "data-theme-dark", "data-transparency"]) html().removeAttribute(name);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useAccountTheme — palettes (MIN-696)", () => {
  it("reads what the pre-paint script installed, and repaints at once on a change", async () => {
    html().setAttribute("data-theme-dark", "nord-dark");
    render(createElement(Probe));
    expect(output().dataset.dark).toBe("nord-dark");
    expect(output().dataset.light).toBe("minddy-light");

    let saved: Promise<boolean> = Promise.resolve(false);
    // Async act: the store is fed by a MutationObserver, whose records are
    // delivered as a microtask. The write itself stays pending.
    await act(async () => { saved = hook.setPreset("light", "solarized-light"); });
    // Applied before the write resolves; only the light key is patched.
    expect(html().getAttribute("data-theme-light")).toBe("solarized-light");
    expect(html().getAttribute("data-theme-dark")).toBe("nord-dark");
    expect(output().dataset.light).toBe("solarized-light");
    expect(h.writes.map((w) => w.patch)).toEqual([{ theme_light: "solarized-light" }]);

    await act(async () => h.writes[0].settle(true));
    await expect(saved).resolves.toBe(true);
  });

  it("puts the saved palette back when the write fails", async () => {
    h.user = { id: "u1", user_metadata: { theme_dark: "nord-dark" } };
    html().setAttribute("data-theme-dark", "nord-dark");
    render(createElement(Probe));

    let saved: Promise<boolean> = Promise.resolve(true);
    act(() => { saved = hook.setPreset("dark", "catppuccin-mocha"); });
    await act(async () => h.writes[0].settle(false));

    await expect(saved).resolves.toBe(false);
    expect(html().getAttribute("data-theme-dark")).toBe("nord-dark");
  });

  it("does not revert a failed write a newer choice has superseded", async () => {
    render(createElement(Probe));

    act(() => { void hook.setPreset("dark", "nord-dark"); });
    act(() => { void hook.setPreset("dark", "solarized-dark"); });
    await act(async () => h.writes[0].settle(false));
    expect(html().getAttribute("data-theme-dark")).toBe("solarized-dark");

    // The newest one fails too: back to the last SAVED value (the default).
    await act(async () => h.writes[1].settle(false));
    expect(html().getAttribute("data-theme-dark")).toBe("minddy-dark");
  });

  it("refuses a palette of the other mode without writing anything", async () => {
    render(createElement(Probe));
    let saved: Promise<boolean> = Promise.resolve(true);
    act(() => { saved = hook.setPreset("light", "nord-dark"); });
    await expect(saved).resolves.toBe(false);
    expect(h.writes).toEqual([]);
    expect(html().hasAttribute("data-theme-light")).toBe(false);
  });

  it("toggles the glass and persists only that key", async () => {
    render(createElement(Probe));
    await act(async () => { void hook.setTransparency(false); });
    expect(html().getAttribute("data-transparency")).toBe("off");
    expect(output().dataset.glass).toBe("false");
    expect(h.writes.map((w) => w.patch)).toEqual([{ theme_transparency: false }]);
  });

  it("writes only the mode when the mode changes", () => {
    render(createElement(Probe));
    act(() => hook.setTheme("light"));
    expect(h.writes.map((w) => w.patch)).toEqual([{ theme: "light" }]);
  });
});

describe("ThemeAccountSync — palettes follow the account (MIN-696)", () => {
  it("applies the account's palettes, defaults included, and removes them on leaving", () => {
    // A previous account's choice is still on the document.
    html().setAttribute("data-theme-light", "nord-light");
    h.user = { id: "u2", user_metadata: { theme: "dark", theme_dark: "high-contrast-dark" } };

    render(createElement(StrictMode, null, createElement(ThemeAccountSync)));
    expect(html().getAttribute("data-theme-light")).toBe("minddy-light");
    expect(html().getAttribute("data-theme-dark")).toBe("high-contrast-dark");
    expect(html().getAttribute("data-transparency")).toBe("on");

    render(null);
    expect(html().hasAttribute("data-theme-light")).toBe(false);
    expect(html().hasAttribute("data-theme-dark")).toBe(false);
  });
});
