// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaSettled } from "./media-settled";

// jsdom has no `HTMLImageElement.decode`: each test installs its own.
function stubDecode(decode: () => Promise<void>) {
  Object.defineProperty(HTMLImageElement.prototype, "decode", { value: decode, configurable: true, writable: true });
}

afterEach(() => {
  document.body.innerHTML = "";
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mediaSettled", () => {
  it("resolves at once without pending media", async () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>Hello</p>";
    await expect(mediaSettled(root)).resolves.toBeUndefined();
  });

  it("waits for a project icon still loading, then for its image to decode", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    root.innerHTML = '<span data-media-pending=""></span>';
    const settled = vi.fn();
    void mediaSettled(root).then(settled);
    await tick();
    expect(settled).not.toHaveBeenCalled();

    // The icon arrives: the orb leaves and an image takes its place.
    let decoded!: () => void;
    stubDecode(() => new Promise<void>((resolve) => { decoded = resolve; }));
    root.innerHTML = '<span><img src="data:image/png;base64,AA==" alt=""></span>';
    await tick();
    expect(settled).not.toHaveBeenCalled();
    decoded();
    await tick();
    expect(settled).toHaveBeenCalledOnce();
  });

  it("does not wait on an image that fails", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<img src="broken" alt="">';
    stubDecode(() => Promise.reject(new Error("broken")));
    await expect(mediaSettled(root)).resolves.toBeUndefined();
  });
});
