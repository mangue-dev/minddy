// @vitest-environment jsdom
//
// MIN-742: resources render as Finder-like cards — the image itself or the
// type's tile, a name that keeps its extension, and the size.
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResourcePills } from "./resources";

vi.mock("./ui/app-tooltip", () => ({
  AppTooltip: ({ children, label }: { children: ReactNode; label: string }) => <span data-tooltip={label}>{children}</span>,
}));
vi.mock("./file-viewer", () => ({ FileViewer: () => null }));

const messages = {
  Common: { cancel: "Cancel" },
  Resources: {
    preview: "Preview", pageUnavailable: "This page no longer exists", addPage: "Page", openLink: "Open link", actions: "File actions", download: "Download", remove: "Remove", rename: "Rename",
    removeConfirmTitle: "Remove “{name}”?", removeConfirmDescription: "x", removeDraftConfirmDescription: "x", removeUploadConfirmDescription: "x",
  },
};

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

const render = (node: ReactNode, locale: "en" | "fr" = "en") =>
  act(() => root.render(<NextIntlClientProvider locale={locale} messages={messages}>{node}</NextIntlClientProvider>));
const cards = () => [...container.querySelectorAll<HTMLElement>('[data-slot="resource-card"]')];

it("shows an image as itself and any other file as its type's tile", async () => {
  await render(<ResourcePills resources={[
    { id: "a", kind: "file", file_name: "diagram.png", mime_type: "image/png", storage_path: "projects/p/a", size_bytes: 312_000 },
    { id: "b", kind: "file", file_name: "spec.pdf", mime_type: "application/pdf", storage_path: "projects/p/b", size_bytes: 1_400 },
  ]} />);
  const [image, pdf] = cards();
  expect(image.querySelector("img")?.getAttribute("src")).toBe("/api/attachments/file?path=projects%2Fp%2Fa");
  expect(image.textContent).toContain("312 kB");
  expect(pdf.querySelector("img")).toBeNull();
  expect(pdf.textContent).toContain("pdf");
  expect(pdf.textContent).toContain("1.4 kB");
});

it("keeps the whole extension of a long name and puts the full name in a tooltip", async () => {
  const name = "Capture d’écran 2026-10-19 à 11.42.17 sur le bureau.webp";
  await render(<ResourcePills resources={[{ id: "a", kind: "file", file_name: name, mime_type: "image/webp", storage_path: "projects/p/a", size_bytes: 312_000 }]} />, "fr");
  const card = cards()[0];
  const tooltip = card.querySelector<HTMLElement>("[data-tooltip]");
  expect(tooltip?.dataset.tooltip).toBe(name);
  expect(tooltip?.textContent).toMatch(/…au\.webp$/);
  expect(card.textContent?.replace(/\s/g, " ")).toContain("312 ko");
});

it("labels a link with its host and a page as a page", async () => {
  await render(<ResourcePills resources={[
    { id: "l", kind: "link", file_name: "Linear docs", url: "https://www.linear.app/docs" },
    { id: "p", kind: "page", file_name: "Roadmap", page_id: "pg", page: null },
  ]} />);
  const [link, page] = cards();
  // Its menu opens the link beside the app.
  await act(async () => link.querySelector("button")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  const open = [...document.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]')].find((a) => a.textContent === "Open link");
  expect(open?.getAttribute("href")).toBe("https://www.linear.app/docs");
  expect(open?.getAttribute("target")).toBe("_blank");
  await act(async () => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(link.textContent).toContain("linear.app");
  expect(page.textContent).toContain("Page");
});

it("shows a link's og:image when it has one, and its favicon tile otherwise", async () => {
  const thumbnail = "data:image/webp;base64,UklGRg==";
  await render(<ResourcePills resources={[
    { id: "l1", kind: "link", file_name: "Launch post", url: "https://blog.exemple.com/launch", preview_data_url: thumbnail },
    { id: "l2", kind: "link", file_name: "Docs", url: "https://docs.exemple.com", icon_data_url: null },
  ]} />);
  const [withImage, withoutImage] = cards();
  expect(withImage.querySelector("img")?.getAttribute("src")).toBe(thumbnail);
  expect(withoutImage.querySelector("img")).toBeNull();
  expect(withoutImage.querySelector("svg")).not.toBeNull();
});
