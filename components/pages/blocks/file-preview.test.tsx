// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { NodeViewProps } from "@tiptap/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FileView } from "./file-view";
import { ImageView } from "./image-view";

const viewer = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
// The view re-reads editability through the engine's subscription; the stub
// editor here is static.
vi.mock("@/components/editor/use-editor-editable", () => ({
  useEditorEditable: (editor: { isEditable: boolean }) => editor.isEditable,
}));
vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReactNodeViewRenderer: () => null,
}));
vi.mock("@/components/pages/page-uploads", () => ({ usePageUploadsContext: () => null }));
vi.mock("@/components/resource-type-icon", () => ({ ResourceTypeIcon: () => <svg /> }));
vi.mock("@/components/file-viewer", () => ({ FileViewer: (props: Record<string, unknown>) => {
  viewer.props = props;
  return props.open ? <div role="dialog">Preview</div> : null;
} }));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const src = "/api/projects/07b14964-0def-4941-8ddf-686572d6345d/pages/files/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const deleteNode = vi.fn();
function props(attrs: Record<string, unknown>, editable = true) {
  return { node: { attrs }, editor: { isEditable: editable }, deleteNode, updateAttributes: vi.fn(), getPos: () => 0 } as unknown as NodeViewProps;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); deleteNode.mockClear(); viewer.props = null;
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = async (children: ReactNode) => {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={{ Pages: {
    filePreview: "Preview file", fileDownload: "Download", blockFile: "File", imageOpen: "Open image", blockImage: "Image", imageCaption: "Caption", imageResize: "Resize",
  }, Resources: { remove: "Remove", removeConfirmTitle: "Remove “{name}”?", removeBlockConfirmDescription: "Undo in the editor." },
  Common: { cancel: "Cancel" } }}>{children}</NextIntlClientProvider>));
};

it("opens private text blocks in the shared reader while retaining modified-click download navigation", async () => {
  await render(<FileView {...props({ src, name: "notes.text", mime: "application/octet-stream", size: 10 })} />);
  const link = container.querySelector('a[aria-haspopup="dialog"]')!;
  const downloadUrl = link.getAttribute("href")!;
  link.setAttribute("href", "#download-test");
  const modified = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
  await act(() => link.dispatchEvent(modified));
  expect(modified.defaultPrevented).toBe(false);
  link.setAttribute("href", downloadUrl);
  expect(viewer.props?.open).toBe(false);
  const normal = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(() => link.dispatchEvent(normal));
  expect(normal.defaultPrevented).toBe(true);
  expect(viewer.props?.open).toBe(true);
  expect(viewer.props?.src).toBe(`${src}?preview=1`);
  expect(viewer.props?.downloadHref).toBe(`${src}?download=1`);
  // Removing from the reader asks first (MIN-742).
  await act(async () => (viewer.props!.onRemove as () => void)());
  expect(deleteNode).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Remove “notes.text”?");
  const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === "Remove");
  await act(async () => confirm!.click());
  expect(deleteNode).toHaveBeenCalledOnce();
  expect(container.querySelector('a[download="notes.text"]')?.getAttribute("href")).toBe(`${src}?download=1`);
});

it("keeps unsupported and published files on their existing download paths", async () => {
  await render(<FileView {...props({ src, name: "archive.zip", mime: "application/zip" })} />);
  expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
  const signed = "https://storage.test/report.csv?token=abc&download=1";
  await render(<FileView {...props({ src: signed, name: "report.csv", mime: "text/csv" })} />);
  expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
  expect(container.querySelector('a[download]')?.getAttribute("href")).toBe(signed);
});

it("uses the shared image reader and hides removal for read-only blocks", async () => {
  await render(<ImageView {...props({ src, alt: "Project diagram" }, false)} />);
  const trigger = container.querySelector('button[aria-haspopup="dialog"]')!;
  await act(() => (trigger as HTMLElement).click());
  expect(viewer.props?.open).toBe(true);
  expect(viewer.props?.src).toBe(src);
  expect(viewer.props?.onRemove).toBeUndefined();
  expect(deleteNode).not.toHaveBeenCalled();
  await render(<FileView {...props({ src, name: "notes.md", mime: "text/plain" }, false)} />);
  expect(viewer.props?.onRemove).toBeUndefined();
});
