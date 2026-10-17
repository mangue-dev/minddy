// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/** Mention menus (MIN-718): meaning matches come last, from the menu's own issue options only. */

const h = vi.hoisted(() => ({ ids: [] as string[], enabled: [] as boolean[] }));
vi.mock("@/lib/use-semantic-issue-search", () => ({
  useSemanticIssueSearch: (_query: string, options: { enabled?: boolean }) => {
    h.enabled.push(options.enabled !== false);
    return { ids: options.enabled === false ? [] : h.ids, pending: false };
  },
}));

import { useSemanticMentions } from "./use-semantic-mentions";

type Option = { type: string; id: string; label: string; status?: string };
const all: Option[] = [
  { type: "member", id: "m1", label: "Ada Lovelace" },
  { type: "issue", id: "i1", label: "MIN-1", status: "todo" },
  { type: "issue", id: "i2", label: "MIN-2", status: "done" },
  { type: "issue", id: "i4", label: "MIN-4", status: "in_progress" },
  { type: "page", id: "i3", label: "A page sharing an issue id" },
];

let result: (Option & { semantic?: boolean })[] = [];
function Probe({ filtered }: { filtered: Option[] }) {
  result = useSemanticMentions(filtered, all, "single sign-on login");
  return null;
}

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); h.enabled = []; });
afterEach(() => vi.unstubAllGlobals());

it("appends meaning matches after the text matches, in status order, without duplicates or non-issue options", async () => {
  const root = createRoot(document.createElement("div"));
  h.ids = ["i1", "i3", "unknown", "i2", "i4"];
  await act(() => root.render(createElement(Probe, { filtered: [all[1]] })));
  expect(result.map((option) => [option.id, option.semantic ?? false])).toEqual([
    ["i1", false],
    ["i4", true],
    ["i2", true],
  ]);
  await act(() => root.unmount());
});

it("does not search by meaning when the query already names a person", async () => {
  const root = createRoot(document.createElement("div"));
  h.ids = ["i2"];
  await act(() => root.render(createElement(Probe, { filtered: [all[0]] })));
  expect(h.enabled.at(-1)).toBe(false);
  expect(result.map((option) => option.id)).toEqual(["m1"]);
  await act(() => root.unmount());
});
