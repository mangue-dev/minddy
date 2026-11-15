import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboardText } from "@/lib/clipboard";

afterEach(() => vi.unstubAllGlobals());

describe("writeClipboardText", () => {
  it("resolves true once the browser accepted the text", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(writeClipboardText("MIN-42")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("MIN-42");
  });

  it("resolves false when the browser refuses the write", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new DOMException("denied", "NotAllowedError"))) },
    });
    await expect(writeClipboardText("secret")).resolves.toBe(false);
  });

  it("resolves false without the Clipboard API (insecure context)", async () => {
    vi.stubGlobal("navigator", {});
    await expect(writeClipboardText("secret")).resolves.toBe(false);
  });
});
