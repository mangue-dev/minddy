// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopyFeedback } from "@/lib/use-copy-feedback";

const writeClipboardText = vi.hoisted(() => vi.fn<(text: string) => Promise<boolean>>());
vi.mock("@/lib/clipboard", () => ({ writeClipboardText }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let latest: ReturnType<typeof useCopyFeedback>;

function Probe() {
  latest = useCopyFeedback(1000);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  writeClipboardText.mockReset();
});

describe("useCopyFeedback", () => {
  it("reports a successful copy, then returns to idle", async () => {
    writeClipboardText.mockResolvedValue(true);
    await act(async () => expect(await latest.copy("x")).toBe(true));
    expect(latest.state).toBe("copied");
    act(() => vi.advanceTimersByTime(1000));
    expect(latest.state).toBe("idle");
  });

  it("reports a refused copy instead of confirming it", async () => {
    writeClipboardText.mockResolvedValue(false);
    await act(async () => expect(await latest.copy("x")).toBe(false));
    expect(latest.state).toBe("failed");
    expect(latest.copied).toBe(false);
  });

  it("restarts the window on a repeated copy", async () => {
    writeClipboardText.mockResolvedValue(true);
    await act(async () => void (await latest.copy("x")));
    act(() => vi.advanceTimersByTime(800));
    await act(async () => void (await latest.copy("x")));
    act(() => vi.advanceTimersByTime(800));
    expect(latest.state).toBe("copied");
    act(() => vi.advanceTimersByTime(200));
    expect(latest.state).toBe("idle");
  });
});
