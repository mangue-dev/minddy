// @vitest-environment jsdom
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RetainedPageDocuments } from "./retained-page-documents";
import { preparePageNavigation, usePageSurfaceReady } from "@/lib/use-pages-query";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps a validated document basis and draft after TTL expiry while suspending inactive effects", async () => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const updated = 10_000_000, now = vi.spyOn(Date, "now").mockReturnValue(updated);
  for (const id of ["a", "b"]) preparePageNavigation(id, updated);
  const owners = new Set<string>();
  function Surface({ id }: { id: string }) {
    const ready = usePageSurfaceReady(id, updated, false);
    useEffect(() => { owners.add(id); return () => { owners.delete(id); }; }, [id]);
    return ready ? <input data-document={id} defaultValue="" /> : <span>Fresh read required</span>;
  }
  const container = document.body.appendChild(document.createElement("div")), root = createRoot(container);
  const render = (id: string, projectId = "p", eligible = new Set(["a", "b"])) => root.render(
    <RetainedPageDocuments projectId={projectId} pageId={id} eligible={eligible} home={null}
      renderPage={(id) => <Surface id={id} />} />);
  try {
    await act(() => render("a"));
    const input = container.querySelector<HTMLInputElement>('input[data-document="a"]')!;
    input.value = "Unsent draft";
    await act(() => render("b"));
    expect(owners).toEqual(new Set(["b"]));
    expect(container.querySelector('[data-retained-page-document="a"]')?.hasAttribute("inert")).toBe(true);
    now.mockReturnValue(updated + 20_000);
    await act(() => render("a"));
    expect(container.querySelector('input[data-document="a"]')).toBe(input);
    expect(input.value).toBe("Unsent draft"); expect(owners).toEqual(new Set(["a"]));
    await act(() => render("c"));
    expect(container.querySelectorAll('[data-retained-page-document]')).toHaveLength(2);
    expect(container.querySelector('[data-retained-page-document="c"]')?.textContent).toBe("Fresh read required");
    await act(() => render("a", "other-project"));
    expect(container.querySelectorAll('[data-retained-page-document]')).toHaveLength(1);
    expect(container.querySelector('input[data-document="a"]')).toBeNull();
    expect(container.textContent).toBe("Fresh read required");
  } finally { await act(() => root.unmount()); container.remove(); }
});
