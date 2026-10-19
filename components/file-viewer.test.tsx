// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FileViewer } from "./file-viewer";

vi.mock("@/components/theme-provider", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTheme: () => ({ resolvedTheme: "dark" }),
}));
vi.mock("./markdown", () => ({ Markdown: ({ children }: { children: ReactNode }) => <article>{children}</article> }));
vi.mock("framer-motion", async () => ({ ...await vi.importActual("framer-motion"), useReducedMotion: () => true }));

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let origin: HTMLButtonElement;
const messages = { Common: { close: "Close" }, Resources: {
  actions: "File actions", download: "Download", remove: "Remove", downloadFailed: "Download failed. Try again.", previewFailed: "Preview failed", previewLoading: "Loading",
} };
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<script>unsafe()</script>\nMeeting notes" }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  origin = document.createElement("button"); document.body.appendChild(origin); origin.focus();
  container = document.createElement("div"); container.style.transform = "translateZ(0)"; document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount()); container.remove(); origin.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.style.overflow = "";
});

async function render(fileName = "notes.text", mimeType = "application/octet-stream", onRemove?: () => void, downloadHref = "/api/attachments/file?path=notes&download=1") {
  function Harness() {
    const [open, setOpen] = useState(true);
    return <FileViewer src="/api/attachments/file?path=notes&preview=1" downloadHref={downloadHref}
      fileName={fileName} mimeType={mimeType} open={open} onOpenChange={setOpen} onRemove={onRemove} />;
  }
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}><Harness /></NextIntlClientProvider>));
  await flush();
}
const click = async (element: Element) => { await act(() => (element as HTMLElement).click()); };
const key = async (element: Element, value: string) => {
  await act(() => element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
};

it("escapes transformed panes, treats text as inert content and restores scroll and focus on unmount", async () => {
  document.body.style.overflow = "scroll";
  await render();
  const dialog = document.querySelector("dialog")!;
  expect(dialog.parentElement).toBe(document.body);
  expect(dialog.open).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  expect(dialog.querySelector("pre")?.textContent).toContain("<script>unsafe()</script>");
  expect(dialog.querySelector("script")).toBeNull();
  await click(dialog.querySelector("pre")!);
  expect(dialog.open).toBe(true);
  await act(() => root.render(null));
  expect(document.body.style.overflow).toBe("scroll");
  expect(document.activeElement).toBe(origin);
});

it("keeps menu actions inside the modal, supports keyboard navigation and removes only on selection", async () => {
  const remove = vi.fn();
  await render("notes.text", "application/octet-stream", remove);
  const trigger = document.querySelector('button[aria-haspopup="menu"]')!;
  await click(trigger);
  const menu = document.querySelector('[role="menu"]')!;
  const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
  expect(menu.closest("dialog")).not.toBeNull();
  expect(items[0].getAttribute("href")).toContain("download=1");
  expect(document.activeElement).toBe(items[0]);
  await key(items[0], "ArrowDown");
  expect(document.activeElement).toBe(items[1]);
  await key(items[1], "Escape");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(document.querySelector("dialog")?.open).toBe(true);
  expect(remove).not.toHaveBeenCalled();
  await click(trigger);
  await key(document.querySelectorAll('[role="menuitem"]')[0], "ArrowDown");
  await key(document.querySelectorAll('[role="menuitem"]')[1], " ");
  expect(remove).toHaveBeenCalledOnce();
  await flush();
  expect(document.querySelector("dialog")?.open).toBe(false);
});

it("offers download without removal in a read-only reader and closes on native cancel", async () => {
  await render("report.csv", "text/plain");
  const iframe = document.querySelector("iframe")!;
  expect(iframe.getAttribute("sandbox")).toBe("");
  expect(iframe.src).toContain("theme=dark");
  expect(document.querySelector("pre")).toBeNull();
  await click(document.querySelector('button[aria-haspopup="menu"]')!);
  expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
  await key(document.querySelector('[role="menuitem"]')!, "Escape");
  const event = new Event("cancel", { cancelable: true });
  await act(() => document.querySelector("dialog")!.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  await flush();
  expect(document.querySelector("dialog")?.open).toBe(false);
  expect(document.body.style.overflow).toBe("");
});

it("aborts text reads on dismissal and reports failed reads", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValueOnce({ ok: false } as Response);
  await render();
  expect(document.querySelector("dialog")?.textContent).toContain("Preview failed");
  const signal = fetchMock.mock.calls[0][1]?.signal;
  await act(() => root.render(null));
  expect(signal?.aborted).toBe(true);
});

it("downloads cross-origin images as local blobs instead of navigating away", async () => {
  await render("diagram.png", "image/png", undefined, "https://storage.test/image.png?token=signed");
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["image"]) } as Response);
  const create = vi.fn(() => "blob:download");
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  const nativeClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("diagram.png");
    expect(this.href).toBe("blob:download");
  });
  await click(document.querySelector('button[aria-haspopup="menu"]')!);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => { document.querySelector('[role="menuitem"]')!.dispatchEvent(event); });
  expect(event.defaultPrevented).toBe(true);
  expect(fetch).toHaveBeenCalledWith("https://storage.test/image.png?token=signed");
  expect(create).toHaveBeenCalledOnce();
  expect(nativeClick).toHaveBeenCalledOnce();
});

it("shows failed cross-origin downloads inside the top-layer reader", async () => {
  await render("diagram.png", "image/png", undefined, "https://storage.test/missing.png");
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
  await click(document.querySelector('button[aria-haspopup="menu"]')!);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => { document.querySelector('[role="menuitem"]')!.dispatchEvent(event); });
  const alert = document.querySelector('[role="alert"]')!;
  expect(alert.textContent).toBe("Download failed. Try again.");
  expect(alert.closest("dialog")?.open).toBe(true);
});

it("keeps Escape to itself, so the panel below stays open (MIN-742)", async () => {
  const panelEscape = vi.fn();
  // A side panel or sheet listens on the document in the capture phase.
  const listener = (event: KeyboardEvent) => { if (event.key === "Escape") panelEscape(); };
  document.addEventListener("keydown", listener, true);
  try {
    await render();
    const dialog = document.querySelector("dialog")!;
    await key(dialog.querySelector("[data-preview-close]")!, "Escape");
    await flush();
    expect(panelEscape).not.toHaveBeenCalled();
    expect(document.querySelector("dialog[open]")).toBeNull();
  } finally {
    document.removeEventListener("keydown", listener, true);
  }
});

it("lets Escape close only its actions menu", async () => {
  await render();
  const dialog = document.querySelector("dialog")!;
  await click(dialog.querySelector('[aria-label="File actions"]')!);
  const menu = dialog.querySelector('[role="menu"]')!;
  await key(menu.querySelector('[role="menuitem"]')!, "Escape");
  expect(dialog.querySelector('[role="menu"]')).toBeNull();
  expect(dialog.open).toBe(true);
});
