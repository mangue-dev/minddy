// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mentionsSettled,
  primeResolvedMentions,
  refreshResolvedMention,
  useResolvedMentionDetails,
  useResolvedMentionLabel,
} from "./mention-resolution";

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

// MIN-1006: Home's word arrives with its mentions resolved; its pills show
// their names at once and ask the server nothing.
it("names primed mentions without asking the server", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  primeResolvedMentions([
    { type: "issue", id: "issue-primed", label: "MIN-7" },
    { type: "objective", id: "objective-primed", label: "Launch", status: "in_progress" },
    { type: "not-a-type", id: "x", label: "ignored" },
  ]);
  function Pills() {
    const issue = useResolvedMentionLabel("issue", "issue-primed");
    const objective = useResolvedMentionLabel("objective", "objective-primed");
    const status = useResolvedMentionDetails("objective", "objective-primed")?.status;
    return createElement("span", null, `${issue} ${objective} ${status}`);
  }
  await act(() => root.render(createElement(Pills)));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(container.textContent).toBe("MIN-7 Launch in_progress");
  expect(fetch).not.toHaveBeenCalled();
  await expect(mentionsSettled()).resolves.toBeUndefined();
});
