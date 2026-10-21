// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useAttachmentUploads } from "./use-attachment-uploads";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const PROJECT = "projects/00000000-0000-4000-8000-000000000001";

/**
 * A fetch whose response the test releases by hand. It deliberately ignores
 * the abort signal, like a response already on its way when the user cancels.
 */
function heldFetch(body: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fetchMock = vi.fn(async () => {
    await gate;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, release };
}

async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onUploaded = vi.fn();
  let uploads!: ReturnType<typeof useAttachmentUploads>;
  function Probe() {
    uploads = useAttachmentUploads(() => PROJECT, { onUploaded });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(() => root.render(<Probe />));
  return {
    uploads: () => uploads,
    onUploaded,
    close: () => act(() => root.unmount()),
  };
}

const settle = () => act(async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
});

it("does not register a file whose upload was cancelled before the response", async () => {
  const held = heldFetch({ storage_path: "projects/x/file.txt", mime_type: "text/plain", size_bytes: 3 });
  const view = await mount();
  try {
    await act(async () => view.uploads().addFiles([new File(["abc"], "notes.txt", { type: "text/plain" })]));
    await settle();
    const [entry] = view.uploads().pending;
    expect(entry.status).toBe("uploading");
    const signal = (held.fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    await act(async () => view.uploads().remove(entry.localId));
    expect(signal.signal?.aborted).toBe(true);
    held.release();
    await settle();
    expect(view.onUploaded).not.toHaveBeenCalled();
    expect(view.uploads().pending).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  } finally { await view.close(); }
});

it("does not register a link cancelled while it resolves, and does not report an error", async () => {
  const held = heldFetch({ url: "https://example.com/", file_name: "Example" });
  const view = await mount();
  try {
    let added!: Promise<void>;
    await act(async () => { added = view.uploads().addLink("https://example.com/"); });
    const [entry] = view.uploads().pending;
    await act(async () => view.uploads().clear());
    held.release();
    await expect(added).resolves.toBeUndefined();
    await settle();
    expect(view.onUploaded).not.toHaveBeenCalled();
    expect(view.uploads().pending).toEqual([]);
    expect(entry.status).toBe("uploading");
  } finally { await view.close(); }
});

it("still registers an upload that was not cancelled", async () => {
  const held = heldFetch({ storage_path: "projects/x/file.txt", mime_type: "text/plain", size_bytes: 3 });
  const view = await mount();
  try {
    await act(async () => view.uploads().addFiles([new File(["abc"], "notes.txt", { type: "text/plain" })]));
    held.release();
    await settle();
    expect(view.onUploaded).toHaveBeenCalledTimes(1);
    expect(view.uploads().pending[0].status).toBe("done");
  } finally { await view.close(); }
});
