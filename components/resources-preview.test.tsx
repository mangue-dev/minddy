// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResourcePills } from "./resources";

const viewer = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("./resource-type-icon", () => ({ ResourceTypeIcon: () => <svg /> }));
vi.mock("./entity-pill", () => ({ EntityPill: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("./ui/app-tooltip", () => ({ AppTooltip: ({ children }: { children: ReactNode }) => children }));
vi.mock("./file-viewer", () => ({ FileViewer: (props: Record<string, unknown>) => { viewer.props = props; return <div role="dialog" />; } }));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const resource = { id: "file-1", file_name: "notes.text", mime_type: "application/octet-stream", storage_path: "projects/demo/notes.text" };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); viewer.props = null;
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("previews resources through the shared reader and respects per-resource removal permissions", async () => {
  const remove = vi.fn();
  const render = async (allowed: boolean) => {
    await act(() => root.render(<NextIntlClientProvider locale="en" messages={{
      Common: { cancel: "Cancel" },
      Resources: {
        preview: "Preview", pageUnavailable: "This page no longer exists", addPage: "Page", openLink: "Open link", actions: "File actions", remove: "Remove", rename: "Rename", download: "Download",
        removeConfirmTitle: "Remove “{name}”?", removeConfirmDescription: "Removed for everyone.",
        removeDraftConfirmDescription: "Not sent.", removeUploadConfirmDescription: "Upload stops.",
      },
    }}>
      <ResourcePills resources={[resource]} onRemove={remove} canRemove={() => allowed} />
    </NextIntlClientProvider>));
  };
  await render(false);
  // A click on the card opens its menu; Preview opens the shared reader.
  const card = container.querySelector<HTMLButtonElement>('[data-slot="resource-card"] button')!;
  await act(async () => card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent === "Preview")!.click());
  expect(viewer.props?.src).toBe("/api/attachments/file?path=projects%2Fdemo%2Fnotes.text&preview=1");
  expect(viewer.props?.downloadHref).toBe("/api/attachments/file?path=projects%2Fdemo%2Fnotes.text&download=1");
  expect(viewer.props?.onRemove).toBeUndefined();
  await render(true);
  // The viewer's Remove asks first (MIN-742): nothing is removed until the
  // person confirms.
  await act(() => (viewer.props!.onRemove as () => void)());
  expect(remove).not.toHaveBeenCalled();
  const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')]
    .find((button) => button.textContent === "Remove");
  await act(async () => confirm!.click());
  expect(remove).toHaveBeenCalledWith(resource);
  await act(() => (viewer.props!.onOpenChange as (open: boolean) => void)(false));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});
