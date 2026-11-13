// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mentionsSettled, refreshResolvedMention, useResolvedMentionLabel } from "./mention-resolution";

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

// MIN-964: Numo's intro on Home resolves the account's own mention behind the
// profile screen; saving a name there must show the new one, not the old.
it("asks again for a member who renamed themselves, keeping the old name meanwhile", async () => {
  const names = ["verify-bot", "Titeuf"];
  const fetch = vi.fn(async () =>
    new Response(JSON.stringify({ mentions: [{ type: "member", id: "me-renamed", label: names.shift() }] })));
  vi.stubGlobal("fetch", fetch);
  function Pill() {
    return createElement("span", null, useResolvedMentionLabel("member", "me-renamed") ?? "…");
  }
  await act(() => root.render(createElement(Pill)));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(container.textContent).toBe("verify-bot");

  act(() => refreshResolvedMention("member", "me-renamed"));
  expect(container.textContent).toBe("verify-bot");
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(container.textContent).toBe("Titeuf");
});
