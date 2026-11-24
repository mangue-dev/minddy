// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { refreshMentionsOfChange } from "./mention-live";
import {
  primeResolvedMentions,
  resetMentionResolution,
  resolvedMentionProject,
  useResolvedMentionDetails,
  useResolvedMentionLabel,
} from "./mention-resolution";

let root: Root;
let container: HTMLDivElement;
const queryClient = { invalidateQueries: vi.fn(async () => undefined) };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  resetMentionResolution();
  queryClient.invalidateQueries.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function IssuePill({ id }: { id: string }) {
  const label = useResolvedMentionLabel("issue", id);
  const details = useResolvedMentionDetails("issue", id);
  return createElement("span", null, `${label ?? "…"} ${details?.issueStatus ?? "-"}`);
}

it("shows the new status of an issue changed elsewhere, then reads it again", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({
    mentions: [{ type: "issue", id: "issue-live", label: "MIN-7", issueStatus: "done", projectId: "project-1" }],
  })));
  vi.stubGlobal("fetch", fetch);
  primeResolvedMentions([{ type: "issue", id: "issue-live", label: "MIN-7", issueStatus: "todo", projectId: "project-1" }]);
  await act(() => root.render(createElement(IssuePill, { id: "issue-live" })));
  expect(container.textContent).toBe("MIN-7 todo");
  expect(fetch).not.toHaveBeenCalled();

  await act(async () => {
    refreshMentionsOfChange(queryClient as never, {
      operation: "UPDATE", table: "issues", schema: "public",
      record: { id: "issue-live", status: "done" }, old_record: { id: "issue-live", status: "todo" },
    });
  });
  // The broadcast's status shows at once…
  expect(container.textContent).toBe("MIN-7 done");
  // …and the pill asks the server again for the rest.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(fetch).toHaveBeenCalledOnce();
  expect(queryClient.invalidateQueries).toHaveBeenCalledOnce();
  const [{ predicate }] = queryClient.invalidateQueries.mock.calls[0] as unknown as [{ predicate: (query: { queryKey: unknown[] }) => boolean }];
  expect(predicate({ queryKey: ["mention-preview", 4, "issue", "issue-live", ""] })).toBe(true);
  expect(predicate({ queryKey: ["mention-preview", 4, "issue", "other", ""] })).toBe(false);
});

it("ignores rows that no mention cites", async () => {
  refreshMentionsOfChange(queryClient as never, {
    operation: "UPDATE", table: "issue_categories", schema: "public",
    record: { id: "link" }, old_record: null,
  });
  expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
});

// Home's word cites issues no list on Home holds: the project the server
// names is what lets their pill open them.
it("keeps the project the server named for a target", () => {
  primeResolvedMentions([{ type: "issue", id: "issue-home", label: "MIN-9", projectId: "project-2" }]);
  expect(resolvedMentionProject("issue", "issue-home")).toBe("project-2");
  expect(resolvedMentionProject("issue", "unknown")).toBeUndefined();
});
