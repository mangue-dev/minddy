// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MobileNavigationBarState, MobileShellPlugin } from "./bridge";
import { readNavigationBar, syncNativeNavigationBar } from "./native-navigation";

let nav: HTMLElement;
let onTop: Element | null;

/**
 * Lets the pending mutation records, the frames they schedule and the icons
 * being drawn settle. Several turns of the task queue, not a duration: a
 * loaded machine must not change the outcome.
 */
async function nextFrame() {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function mount() {
  document.body.innerHTML = `
    <nav>
      <div>
        <button data-nav-slot="menu" aria-label="Go to"><svg data-icon="menu"></svg></button>
        <button data-nav-slot="assistant" aria-label="Numo" data-nav-badge><svg data-icon="numo"></svg></button>
        <button data-nav-slot="create" aria-label="New"><svg data-icon="plus"></svg></button>
      </div>
    </nav>`;
  nav = document.querySelector("nav")!;
  const pill = nav.firstElementChild as HTMLElement;
  pill.getBoundingClientRect = () => new DOMRect(41, 792, 320, 48);
  onTop = pill.querySelector("button");
}

beforeEach(() => {
  mount();
  // jsdom has no layout: the test says what is on top at the bar's centre.
  document.elementFromPoint = () => onTop;
  vi.stubGlobal("innerWidth", 402);
  vi.stubGlobal("innerHeight", 874);
  // A frame is the next task, as in a browser: never inside the caller.
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => window.setTimeout(() => run(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-native-navigation");
});

describe("reading the web bar for the shell", () => {
  it("reports the bar's place and its buttons", () => {
    expect(readNavigationBar(nav)).toEqual({
      visible: true,
      frame: { x: 41, y: 792, width: 320, height: 48 },
      items: [
        { id: "menu", label: "Go to", badge: false },
        { id: "assistant", label: "Numo", badge: true },
        { id: "create", label: "New", badge: false },
      ],
    });
  });

  it("carries each button's own icon once it is drawn, and waits for the ones that are not", () => {
    const drawn = readNavigationBar(nav, (svg) => `png:${svg.getAttribute("data-icon")}`);
    expect(drawn.items?.map((item) => [item.icon, item.iconScale])).toEqual([
      ["png:menu", 3],
      ["png:numo", 3],
      ["png:plus", 3],
    ]);
    expect(readNavigationBar(nav, () => undefined)).toEqual({ visible: false });
  });

  it("sends a picture to be shown in its own colors", () => {
    const menu = nav.querySelector('[data-nav-slot="menu"]')!;
    menu.innerHTML = '<img src="data:image/svg+xml,avatar" alt="">';
    const items = readNavigationBar(nav, (icon) => `png:${icon.tagName.toLowerCase()}`).items!;
    expect(items[0]).toMatchObject({ id: "menu", icon: "png:img", iconTinted: false });
    expect(items[1]).toMatchObject({ id: "assistant", icon: "png:svg", iconTinted: true });
  });

  it("hides the bar when a sheet or a dialog covers it", () => {
    onTop = document.body.appendChild(document.createElement("div"));
    expect(readNavigationBar(nav)).toEqual({ visible: false });
  });

  it("keeps the bar under the keyboard that its shortened page clips, unless a sheet is open", () => {
    // The page, shortened for the keyboard, ends above the bar and clips it:
    // what answers at the bar's centre is outside the page.
    const page = document.createElement("div");
    page.className = "app-shell";
    page.getBoundingClientRect = () => new DOMRect(0, 0, 402, 546);
    page.append(nav);
    document.body.append(page);
    onTop = document.body;
    expect(readNavigationBar(nav)).toMatchObject({ visible: true, frame: { y: 792 } });

    document.documentElement.setAttribute("data-mobile-surface", "");
    try {
      expect(readNavigationBar(nav)).toEqual({ visible: false });
    } finally {
      document.documentElement.removeAttribute("data-mobile-surface");
    }

    // Grown back over the bar: whatever covers it now is a real cover.
    page.getBoundingClientRect = () => new DOMRect(0, 0, 402, 874);
    expect(readNavigationBar(nav)).toEqual({ visible: false });
  });

  it("hides the bar when the page does not lay it out", () => {
    (nav.firstElementChild as HTMLElement).getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
    expect(readNavigationBar(nav)).toEqual({ visible: false });
  });
});

describe("keeping the shell's bar in step", () => {
  function shell() {
    const sent: MobileNavigationBarState[] = [];
    let tap: ((action: { id: string }) => void) | undefined;
    const remove = vi.fn();
    const plugin = {
      setNavigationBar: vi.fn(async (state: MobileNavigationBarState) => { sent.push(state); }),
      addListener: vi.fn((_event: string, handler: (action: { id: string }) => void) => {
        tap = handler;
        return { remove };
      }),
    } as unknown as MobileShellPlugin;
    return { plugin, sent, remove, tap: (id: string) => tap?.({ id }) };
  }

  it("leaves the web bar alone when the shell cannot draw one", () => {
    expect(syncNativeNavigationBar(nav, {} as MobileShellPlugin)).toBeNull();
    expect(document.documentElement.hasAttribute("data-native-navigation")).toBe(false);
  });

  it("sends the bar, clicks the web button a native tap names, and withdraws on cleanup", async () => {
    const { plugin, sent, remove, tap } = shell();
    const clicked = vi.fn();
    nav.querySelector('[data-nav-slot="create"]')!.addEventListener("click", clicked);

    const stop = syncNativeNavigationBar(nav, plugin, async (svg) => `png:${svg.getAttribute("data-icon")}`)!;
    expect(document.documentElement.hasAttribute("data-native-navigation")).toBe(true);
    await nextFrame();
    await nextFrame();
    // Nothing is sent before every icon is drawn.
    expect(sent).toHaveLength(1);
    expect(sent[0].visible).toBe(true);
    expect(sent[0].items?.[0].icon).toBe("png:menu");

    tap("create");
    expect(clicked).toHaveBeenCalledOnce();

    stop();
    await Promise.resolve();
    expect(sent.at(-1)).toEqual({ visible: false });
    expect(remove).toHaveBeenCalledOnce();
    expect(document.documentElement.hasAttribute("data-native-navigation")).toBe(false);
  });

  it("sends the buttons once, then only the bar's place while it moves", async () => {
    const { plugin, sent } = shell();
    const stop = syncNativeNavigationBar(nav, plugin, async () => null)!;
    await nextFrame();
    await nextFrame();
    expect(sent[0].items).toHaveLength(3);

    (nav.firstElementChild as HTMLElement).getBoundingClientRect = () => new DOMRect(141, 792, 320, 48);
    nav.setAttribute("style", "transform: translateX(100px)");
    await nextFrame();
    expect(sent.at(-1)).toEqual({ visible: true, frame: { x: 141, y: 792, width: 320, height: 48 } });
    stop();
  });

  it("reports a change once, when something comes to cover the bar", async () => {
    const { plugin, sent } = shell();
    const stop = syncNativeNavigationBar(nav, plugin, async () => null)!;
    await nextFrame();
    await nextFrame();

    const overlay = document.createElement("div");
    onTop = overlay;
    document.body.append(overlay);
    await nextFrame();
    overlay.setAttribute("data-state", "open");
    await nextFrame();

    expect(sent.map((state) => state.visible)).toEqual([true, false]);
    stop();
  });
});
