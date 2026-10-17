// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

/** Mention menus (MIN-718): meaning matches come last, from the menu's own issue options only. */

const h = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/lib/use-semantic-issue-search", () => ({
  useSemanticIssueSearch: () => ({ ids: h.ids, pending: false }),
}));

import { useSemanticMentions } from "./use-semantic-mentions";

type Option = { type: string; id: string; label: string };
const all: Option[] = [
  { type: "member", id: "m1", label: "Ada" },
  { type: "issue", id: "i1", label: "MIN-1" },
  { type: "issue", id: "i2", label: "MIN-2" },
  { type: "page", id: "i3", label: "A page sharing an issue id" },
];

it("appends meaning matches after the text matches, without duplicates or non-issue options", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let result: (Option & { semantic?: boolean })[] = [];
  function Probe({ filtered }: { filtered: Option[] }) {
    result = useSemanticMentions(filtered, all, "single sign-on login");
    return null;
  }
  const root = createRoot(document.createElement("div"));
  h.ids = ["i1", "i3", "unknown", "i2"];
  await act(() => root.render(createElement(Probe, { filtered: [all[0], all[1]] })));
  expect(result.map((option) => [option.id, option.semantic ?? false])).toEqual([
    ["m1", false],
    ["i1", false],
    ["i2", true],
  ]);
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});
