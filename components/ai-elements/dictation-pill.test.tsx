// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DictateButton } from "@/components/ai-elements/dictate-button";

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { error: vi.fn(), info: vi.fn() },
}));
const metadata = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/lib/auth-context", () => ({
  useAuthOptional: () => ({ user: { user_metadata: metadata.value } }),
}));

const getUserMedia = vi.fn();
const fetchMock = vi.fn();
class Recorder {
  static isTypeSupported() { return true; }
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

let root: Root;
let onTranscription: ReturnType<typeof vi.fn<(text: string) => void>>;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, addEventListener() {}, removeEventListener() {},
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ text: "Revoir les filtres.", polished: true })));
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  metadata.value = {};
  onTranscription = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

const pill = () => document.querySelector("[data-dictation-pill]");
const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
const byText = (text: string) =>
  [...document.querySelectorAll("button")].find((button) => button.textContent === text);

async function click(element: Element | null | undefined) {
  expect(element).toBeTruthy();
  await act(async () => { (element as HTMLElement).click(); });
}

async function startTake() {
  await act(() => root.render(createElement(DictateButton, { context: "comment", onTranscription })));
  await click(byLabel("start"));
  expect(pill()).not.toBeNull();
}

describe("dictation pill (MIN-773)", () => {
  it("asks before discarding, then drops the take without sending it", async () => {
    await startTake();
    await click(byLabel("discard"));
    expect(document.body.textContent).toContain("discardTitle");
    expect(pill()).not.toBeNull();

    await click(byText("discardConfirm"));
    expect(pill()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onTranscription).not.toHaveBeenCalled();
  });

  it("routes Escape to the same confirmation instead of closing", async () => {
    await startTake();
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(pill()).not.toBeNull();
    expect(document.body.textContent).toContain("discardTitle");
    await click(byText("keepRecording"));
    expect(pill()).not.toBeNull();
  });

  it("validates the take and inserts the transcription", async () => {
    await startTake();
    await click(byLabel("validate"));
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("context")).toBe("comment");
    expect(body.get("cleanup")).toBeNull();
    expect(onTranscription).toHaveBeenCalledWith("Revoir les filtres.");
    expect(pill()).toBeNull();
  });

  it("asks for the raw transcription when the account turned the cleanup off", async () => {
    metadata.value = { dictation_cleanup: false };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: "alors euh revoir les filtres" })));
    await startTake();
    await click(byLabel("validate"));
    expect((fetchMock.mock.calls[0][1].body as FormData).get("cleanup")).toBe("off");
    expect(onTranscription).toHaveBeenCalledWith("alors euh revoir les filtres");
  });

  it("validates on ⌘/Ctrl+Enter from anywhere, while ✕ keeps its own Enter", async () => {
    await startTake();
    const discardButton = byLabel("discard")!;
    discardButton.focus();
    const key = (init: KeyboardEventInit) => act(async () => {
      discardButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }));
    });
    await key({});
    expect(fetchMock).not.toHaveBeenCalled();
    await key({ ctrlKey: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pill()).toBeNull();
  });

  it("keeps an auto-started take through React's dev double mount (⌘⇧D)", async () => {
    // StrictMode runs mount → cleanup → mount; the take begun on the first
    // mount must survive the rehearsal, as it does in production.
    const onAutoStart = vi.fn();
    await act(() => root.render(createElement(React.StrictMode, null,
      createElement(DictateButton, { context: "issue_form", onTranscription, autoStart: true, onAutoStart }))));
    await act(async () => { await Promise.resolve(); });
    expect(onAutoStart).toHaveBeenCalled();
    expect(pill()).not.toBeNull();
    expect(byLabel("stop")?.getAttribute("aria-pressed")).toBe("true");
  });
});
