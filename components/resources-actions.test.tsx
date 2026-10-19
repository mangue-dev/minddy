// @vitest-environment jsdom
//
// MIN-742: a resource chip renames in place and never removes without a
// confirmation — saved rows, composer entries and uploads in flight alike.
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResourcePills } from "./resources";

vi.mock("./resource-type-icon", () => ({ ResourceTypeIcon: () => <svg /> }));
vi.mock("./ui/app-tooltip", () => ({ AppTooltip: ({ children }: { children: ReactNode }) => children }));
vi.mock("./file-viewer", () => ({ FileViewer: () => null }));
vi.mock("./app-link", () => ({ default: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a> }));

const messages = {
  Common: { cancel: "Cancel" },
  Resources: {
    preview: "Preview", pageUnavailable: "This page no longer exists", addPage: "Page", openLink: "Open link", actions: "File actions", download: "Download", openPage: "Open page", remove: "Remove", rename: "Rename",
    renameDialogTitle: "Rename resource", renameLabel: "Name", renameEmpty: "Enter a name.",
    renameFailed: "Couldn't rename this resource.",
    removeConfirmTitle: "Remove “{name}”?", removeConfirmDescription: "Removed for everyone.",
    removeDraftConfirmDescription: "Not sent.", removeUploadConfirmDescription: "Upload stops.",
  },
};

const file = { id: "file-1", kind: "file" as const, file_name: "spec.pdf", mime_type: "application/pdf", storage_path: "projects/p/spec" };
const page = { id: "page-1", kind: "page" as const, file_name: "Roadmap", page_id: "pg", project_id: "p", page: { id: "pg", title: "Roadmap", icon: null } };

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const render = (pills: ReactNode) =>
  act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}>{pills}</NextIntlClientProvider>));
const button = (label: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent === label);
/** Right-clicks the card named `name`, then picks `item` in its menu. */
const pick = async (name: string, item: string) => {
  const card = [...container.querySelectorAll<HTMLButtonElement>('[data-slot="resource-card"] button')]
    .find((b) => b.getAttribute("aria-label")?.endsWith(`: ${name}`))!;
  await act(async () => card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  const entry = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent === item);
  if (!entry) throw new Error(`no "${item}" in the menu of ${name}`);
  await act(async () => entry.click());
};
/** Right-clicks the card named `name` and lists its menu, left open. */
const openMenu = async (name: string) => {
  const card = [...container.querySelectorAll<HTMLButtonElement>('[data-slot="resource-card"] button')]
    .find((b) => b.getAttribute("aria-label")?.endsWith(`: ${name}`))!;
  await act(async () => card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((e) => e.textContent);
};
const confirmButton = () =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === "Remove");

it("removes a saved resource only once the person confirms", async () => {
  const remove = vi.fn();
  await render(<ResourcePills resources={[file]} onRemove={remove} />);

  await pick("spec.pdf", "Remove");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Remove “spec.pdf”?");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Removed for everyone.");
  expect(remove).not.toHaveBeenCalled();

  await act(async () => button("Cancel")!.click());
  expect(remove).not.toHaveBeenCalled();

  await pick("spec.pdf", "Remove");
  await act(async () => confirmButton()!.click());
  expect(remove).toHaveBeenCalledWith(file);
});

it("confirms a draft entry and an upload in flight with their own wording", async () => {
  const removePending = vi.fn();
  await render(
    <ResourcePills
      draft
      resources={[file]}
      onRemove={() => {}}
      pending={[{ localId: "up-1", status: "uploading", kind: "file", file_name: "big.mov", storage_path: "", mime_type: "video/quicktime", size_bytes: 1 }]}
      onRemovePending={removePending}
    />,
  );
  await pick("spec.pdf", "Remove");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Not sent.");
  await act(async () => button("Cancel")!.click());

  await pick("big.mov", "Remove");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Upload stops.");
  await act(async () => confirmButton()!.click());
  expect(removePending).toHaveBeenCalledWith("up-1");
});

it("offers no rename for a page, which shows its live title", async () => {
  await render(<ResourcePills resources={[page]} onRename={vi.fn()} />);
  expect(await openMenu("Roadmap")).toEqual(["Open page"]);
});

it("renames a file and keeps a failed rename in the dialog", async () => {
  const rename = vi.fn()
    .mockRejectedValueOnce(new Error("Read-only project"))
    .mockResolvedValueOnce(undefined);
  await render(<ResourcePills resources={[file, page]} onRename={rename} />);

  expect(await openMenu("spec.pdf")).toEqual(["Preview", "Rename", "Download"]);
  const entry = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent === "Rename")!;
  await act(async () => entry.click());
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  expect(input.value).toBe("spec.pdf");

  const type = async (value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const submit = () => act(async () => {
    input.form!.requestSubmit();
  });

  await type("  Spec v2.pdf ");
  await submit();
  expect(rename).toHaveBeenLastCalledWith(file, "Spec v2.pdf");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Read-only project");

  await submit();
  expect(rename).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="dialog"] input')).toBeNull();
});

it("sets Remove apart from the other entries with a separator", async () => {
  await render(<ResourcePills resources={[file]} onRemove={vi.fn()} onRename={vi.fn()} />);
  expect(await openMenu("spec.pdf")).toEqual(["Preview", "Rename", "Download", "Remove"]);
  const menu = document.querySelector('[role="menu"]')!;
  const rows = [...menu.children].map((child) => child.getAttribute("role") === "separator" ? "—" : child.textContent);
  expect(rows).toEqual(["Preview", "Rename", "Download", "—", "Remove"]);
});
