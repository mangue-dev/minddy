// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResourcePills } from "./resources";

const viewer = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("mangue-ui", async () => ({ ...await import("../node_modules/mangue-ui/src/lib/utils") }));
vi.mock("./resource-type-icon", () => ({ ResourceTypeIcon: () => <svg /> }));
vi.mock("./entity-pill", () => ({ EntityPill: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("./ui/app-tooltip", () => ({ AppTooltip: ({ children }: { children: ReactNode }) => children }));
vi.mock("./file-viewer", () => ({ FileViewer: (props: Record<string, unknown>) => { viewer.props = props; return <div role="dialog" />; } }));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const resource = { id: "file-1", file_name: "notes.text", mime_type: "application/octet-stream", storage_path: "projects/demo/notes.text" };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); viewer.props = null;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("previews resources through the shared reader and respects per-resource removal permissions", async () => {
  const remove = vi.fn();
  const render = async (allowed: boolean) => {
    await act(() => root.render(<NextIntlClientProvider locale="en" messages={{ Resources: { preview: "Preview", remove: "Remove" } }}>
      <ResourcePills resources={[resource]} onRemove={remove} canRemove={() => allowed} />
    </NextIntlClientProvider>));
  };
  await render(false);
  await act(() => container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!.click());
  expect(viewer.props?.src).toBe("/api/attachments/file?path=projects%2Fdemo%2Fnotes.text&preview=1");
  expect(viewer.props?.downloadHref).toBe("/api/attachments/file?path=projects%2Fdemo%2Fnotes.text&download=1");
  expect(viewer.props?.onRemove).toBeUndefined();
  await render(true);
  await act(() => (viewer.props!.onRemove as () => void)());
  expect(remove).toHaveBeenCalledWith(resource);
  await act(() => (viewer.props!.onOpenChange as (open: boolean) => void)(false));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});
