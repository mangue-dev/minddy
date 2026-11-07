// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useFeedbackDictation,
  type FeedbackDictationResult,
} from "@/lib/use-feedback-dictation";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

const dictate = vi.fn();
const applyPatch = vi.fn();
let latest: ReturnType<typeof useFeedbackDictation> | null = null;

function Harness() {
  latest = useFeedbackDictation({
    dictate,
    getDraft: () => ({ title: "", body: "" }) as never,
    applyPatch,
  });
  return null;
}

function deferred() {
  let resolve!: (value: FeedbackDictationResult) => void;
  const promise = new Promise<FeedbackDictationResult>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("useFeedbackDictation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    dictate.mockReset();
    applyPatch.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(createElement(Harness)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("ignores a run discarded by reset even after a newer run starts", async () => {
    const stale = deferred();
    const fresh = deferred();
    dictate.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);

    act(() => latest!.onTranscript("old request"));
    act(() => latest!.reset());
    act(() => latest!.onTranscript("new request"));
    expect(latest!.busy).toBe(true);

    await act(async () => {
      stale.resolve({ ok: true, patch: { title: "stale" } as never, reply: "" });
    });
    expect(applyPatch).not.toHaveBeenCalled();
    // The stale run must not end the newer run's busy state either.
    expect(latest!.busy).toBe(true);

    await act(async () => {
      fresh.resolve({ ok: true, patch: { title: "fresh" } as never, reply: "" });
    });
    expect(applyPatch).toHaveBeenCalledTimes(1);
    expect(applyPatch).toHaveBeenCalledWith({ title: "fresh" });
    expect(latest!.busy).toBe(false);
  });
});
