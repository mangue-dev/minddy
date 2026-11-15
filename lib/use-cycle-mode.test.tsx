// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CYCLE_MODE_STORAGE_KEY, useCycleMode } from "./use-cycle-mode";

const tabs = vi.hoisted(() => ({ session: null as object | null }));
vi.mock("./app-tabs-context", () => ({
  useOptionalAppTabSession: () => tabs.session,
  useOptionalAppTabNavigation: () => undefined,
}));

let mode: ReturnType<typeof useCycleMode>;
let root: Root;

function Harness() {
  mode = useCycleMode();
  return null;
}

const mount = () => act(() => root.render(createElement(Harness)));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  tabs.session = null;
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("useCycleMode", () => {
  it("restores the mode an existing user left selected, without app tabs", async () => {
    window.localStorage.setItem(CYCLE_MODE_STORAGE_KEY, "1");
    await mount();
    expect(mode[0]).toBe(true);
  });

  it("stores each change so the next visit starts from it", async () => {
    await mount();
    expect(mode[0]).toBe(false);
    await act(() => mode[1](true));
    expect(mode[0]).toBe(true);
    expect(window.localStorage.getItem(CYCLE_MODE_STORAGE_KEY)).toBe("1");
    await act(() => mode[1](false));
    expect(window.localStorage.getItem(CYCLE_MODE_STORAGE_KEY)).toBeNull();
  });

  it("leaves an app tab on its own mode: its restored address carries it", async () => {
    tabs.session = {};
    window.localStorage.setItem(CYCLE_MODE_STORAGE_KEY, "1");
    await mount();
    expect(mode[0]).toBe(false);
  });
});
