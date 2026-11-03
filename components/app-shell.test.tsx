// @vitest-environment jsdom
//
// MIN-783: the first Tab stop of the signed-in app skips the top bar and the
// sidebar to the content (WCAG 2.4.1), without writing a hash the tab router
// would read. app-shell-chrome renders the link first, as here.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AppShell, MAIN_CONTENT_ID, SkipToContentLink } from "./app-shell";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function renderShell() {
  await act(async () => {
    root.render(createElement("div", null,
      createElement(SkipToContentLink),
      createElement("header", null, createElement("button", null, "Search")),
      createElement(AppShell, {
        sidebar: createElement("nav", null, createElement("a", { href: "/inbox" }, "Inbox")),
        children: createElement("h1", null, "Board"),
      })));
  });
}

it("puts the skip link before the top bar and the sidebar", async () => {
  await renderShell();
  const focusable = host.querySelectorAll("a[href], button, [tabindex='0']");
  expect(focusable[0]?.textContent).toBe("skipToContent");
  expect(focusable[0]?.getAttribute("href")).toBe(`#${MAIN_CONTENT_ID}`);
});

it("moves focus to the content region and leaves the URL alone", async () => {
  await renderShell();
  const before = window.location.href;
  const link = host.querySelector<HTMLAnchorElement>(`a[href="#${MAIN_CONTENT_ID}"]`)!;
  await act(async () => link.click());
  const main = document.getElementById(MAIN_CONTENT_ID)!;
  expect(main.tagName).toBe("MAIN");
  expect(document.activeElement).toBe(main);
  expect(window.location.href).toBe(before);
});
