// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mentionsSettled, useResolvedMentionLabel } from "./mention-resolution";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("settles once the mentions on screen have their answer", async () => {
  let answer!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; })));
  function Pill() {
    return createElement("span", null, useResolvedMentionLabel("issue", "issue-settles") ?? "…");
  }
  await act(() => root.render(createElement(Pill)));
  // Let the batched request leave.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  const settled = vi.fn();
  void mentionsSettled().then(settled);
  await act(() => Promise.resolve());
  expect(settled).not.toHaveBeenCalled();

  await act(async () => {
    answer(new Response(JSON.stringify({ mentions: [{ type: "issue", id: "issue-settles", label: "MIN-1" }] })));
  });
  expect(settled).toHaveBeenCalledOnce();
  expect(container.textContent).toBe("MIN-1");
  await expect(mentionsSettled()).resolves.toBeUndefined();
});
