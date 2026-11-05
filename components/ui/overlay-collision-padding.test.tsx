// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  overlayCollisionPadding,
  useOverlayCollisionPadding,
  WINDOW_CONTROLS_SAFE_AREA,
} from "./overlay-collision-padding";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const html = document.documentElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // jsdom has no layout: Radix scrolls the selected option into view on open.
  Element.prototype.scrollIntoView = () => {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  html.removeAttribute("data-desktop-platform");
  html.removeAttribute("data-integrated-caption-controls");
  vi.unstubAllGlobals();
});

let seen: ReturnType<typeof useOverlayCollisionPadding> | null = null;
function Probe({ edge }: { edge?: number }) {
  seen = useOverlayCollisionPadding(edge);
  return null;
}

describe("overlay collision padding", () => {
  it("keeps the same margin on every edge when no window controls cover the page", () => {
    expect(overlayCollisionPadding(false)).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(overlayCollisionPadding(false, 12)).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
  });

  it("keeps the window-controls band clear at the top", () => {
    expect(overlayCollisionPadding(true)).toEqual({
      top: WINDOW_CONTROLS_SAFE_AREA + 10, right: 10, bottom: 10, left: 10,
    });
  });

  it("reserves the band in a browser only once the desktop shell marks the document", async () => {
    await act(async () => root.render(<Probe />));
    expect(seen?.top).toBe(10);

    // Windows and Linux with the integrated caption buttons.
    await act(async () => {
      html.setAttribute("data-desktop-platform", "win32");
      html.setAttribute("data-integrated-caption-controls", "");
    });
    expect(seen?.top).toBe(WINDOW_CONTROLS_SAFE_AREA + 10);

    // A native Windows frame draws its buttons outside the web view.
    await act(async () => html.removeAttribute("data-integrated-caption-controls"));
    expect(seen?.top).toBe(10);

    // macOS always draws its traffic lights over the page.
    await act(async () => html.setAttribute("data-desktop-platform", "darwin"));
    expect(seen?.top).toBe(WINDOW_CONTROLS_SAFE_AREA + 10);
  });

  it("keeps a wider edge chosen by the caller", async () => {
    html.setAttribute("data-desktop-platform", "darwin");
    await act(async () => root.render(<Probe edge={12} />));
    expect(seen).toEqual({ top: WINDOW_CONTROLS_SAFE_AREA + 12, right: 12, bottom: 12, left: 12 });
  });
});

describe("SelectContent position", () => {
  async function openSelect() {
    await act(async () =>
      root.render(
        <Select open value="30">
          <SelectTrigger aria-label="Period"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7</SelectItem>
            <SelectItem value="30">30</SelectItem>
          </SelectContent>
        </Select>,
      ),
    );
    return document.querySelector("[data-slot='select-content']");
  }

  it("aligns the selected option on its trigger in a browser", async () => {
    expect((await openSelect())?.getAttribute("data-align-trigger")).toBe("true");
  });

  it("hangs from its trigger when window controls cover the page", async () => {
    html.setAttribute("data-desktop-platform", "darwin");
    expect((await openSelect())?.getAttribute("data-align-trigger")).toBe("false");
  });
});
