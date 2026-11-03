// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { documentTitle, useDocumentTitle } from "./use-document-title";

afterEach(() => vi.unstubAllGlobals());

it("names the view, then keeps the brand of the route's title", () => {
  expect(documentTitle(["Roadmap", "Acme"], "Pages · Acme · minddy")).toBe("Roadmap · Acme · minddy");
  expect(documentTitle(["Roadmap", undefined, ""], "Acme · Team")).toBe("Roadmap · Team");
});

it("restores the route's title when the view goes away", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.title = "Pages · Acme · minddy";
  function View({ parts }: { parts: string[] | null }) {
    useDocumentTitle(parts);
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(createElement(View, { parts: ["Roadmap", "Acme"] })));
  expect(document.title).toBe("Roadmap · Acme · minddy");
  await act(async () => root.render(createElement(View, { parts: ["Notes", "Acme"] })));
  expect(document.title).toBe("Notes · Acme · minddy");
  await act(async () => root.render(createElement(View, { parts: null })));
  expect(document.title).toBe("Pages · Acme · minddy");
  await act(async () => root.unmount());
});
