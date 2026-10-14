// @vitest-environment jsdom
import { act, createElement, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsRestoringProvider, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let RestoredPageBootstrapNavigation: typeof import("./restored-page-bootstrap-record").RestoredPageBootstrapNavigation;
let RestoredPageBootstrapAccount: typeof import("./restored-page-bootstrap-record").RestoredPageBootstrapAccount;
let RestoredPageBootstrapRecordView: typeof import("./restored-page-bootstrap-record").RestoredPageBootstrapRecordView;
let observePriority: typeof import("@/lib/restored-page-bootstrap-priority").observeRestoredPageBootstrapPriority;
import type { RestoredPageBootstrapRecord } from "@/lib/restored-page-bootstrap-types";

const auth = vi.hoisted(() => ({ owner: "owner" as string | null, loading: false, generation: 0 }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: auth.owner ? { id: auth.owner } : null, loading: auth.loading }) }));
vi.mock("@/lib/local-snapshots", () => ({ localSnapshotGeneration: () => auth.generation }));
let root: Root;
const clients: QueryClient[] = [];
const record: RestoredPageBootstrapRecord = { ownerId: "owner", projectId: "project", complete: true, kind: "members",
  data: { members: [], invitations: [], isOwner: true } };
beforeEach(async () => {
  auth.owner = "owner"; auth.loading = false; auth.generation = 0;
  vi.resetModules();
  ({ RestoredPageBootstrapNavigation, RestoredPageBootstrapAccount, RestoredPageBootstrapRecordView } = await import("./restored-page-bootstrap-record"));
  ({ observeRestoredPageBootstrapPriority: observePriority } = await import("@/lib/restored-page-bootstrap-priority"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });
const client = () => { const value = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(value); observePriority(value, { startedAt: Math.floor(performance.timeOrigin), now: () => Math.floor(performance.timeOrigin) + 1 }); return value; };

function tree(value: QueryClient, restoring: boolean, consumer: ReactNode = null, showRecord = true) {
  return createElement(StrictMode, null, createElement(RestoredPageBootstrapNavigation, null,
    createElement(QueryClientProvider, { client: value, key: auth.owner ?? "signed-out" },
      createElement(RestoredPageBootstrapAccount, null, createElement(IsRestoringProvider, { value: restoring },
        showRecord ? createElement(RestoredPageBootstrapRecordView, { record }) : null, consumer)))));
}

describe("streamed Page bootstrap mounted boundary", () => {
  it("defers through IsRestoring and seeds before an ordinary consumer starts another read", async () => {
    const value = client(), fetch = vi.fn(async () => record.data);
    function Consumer() { useQuery({ queryKey: ["members", "project"], queryFn: fetch, staleTime: 300_000 }); return null; }
    await act(async () => root.render(tree(value, true, createElement(Consumer))));
    expect(value.getQueryData(["members", "project"])).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => root.render(tree(value, false, createElement(Consumer))));
    expect(value.getQueryData(["members", "project"])).toEqual(record.data);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("waits for the matching resolved owner", async () => {
    const value = client();
    auth.loading = true; auth.owner = null;
    await act(async () => root.render(tree(value, false)));
    expect(value.getQueryData(["members", "project"])).toBeUndefined();
    auth.loading = false; auth.owner = "owner";
    await act(async () => root.render(tree(value, false)));
    expect(value.getQueryData(["members", "project"])).toEqual(record.data);
  });

  it("ignores a stream authorized for another owner", async () => {
    const value = client(); auth.owner = "other";
    await act(async () => root.render(tree(value, false)));
    expect(value.getQueryData(["members", "project"])).toBeUndefined();
  });

  it("rejects a late old-document record after logout and same-owner remount", async () => {
    const original = client(), replacement = client();
    await act(async () => root.render(tree(original, true)));
    auth.owner = null; auth.generation = 1;
    await act(async () => root.render(tree(replacement, true)));
    auth.owner = "owner";
    await act(async () => root.render(tree(replacement, false)));
    expect(original.getQueryData(["members", "project"])).toBeUndefined();
    expect(replacement.getQueryData(["members", "project"])).toBeUndefined();
    // Remounting the boundary itself cannot reset the module's document fence.
    await act(async () => root.render(null));
    await act(async () => root.render(tree(replacement, false)));
    expect(replacement.getQueryData(["members", "project"])).toBeUndefined();
  });

  it("claims the first committed account client before records arrive and refuses a replacement", async () => {
    const original = client(), replacement = client();
    await act(async () => root.render(tree(original, true, null, false)));
    await act(async () => root.render(tree(replacement, false)));
    expect(original.getQueryData(["members", "project"])).toBeUndefined();
    expect(replacement.getQueryData(["members", "project"])).toBeUndefined();
    await act(async () => root.render(null));
    await act(async () => root.render(tree(replacement, false)));
    expect(replacement.getQueryData(["members", "project"])).toBeUndefined();
  });

  it("does not ingest outside the navigation boundary", async () => {
    const value = client();
    await act(async () => root.render(createElement(QueryClientProvider, { client: value }, createElement(RestoredPageBootstrapRecordView, { record }))));
    expect(value.getQueryData(["members", "project"])).toBeUndefined();
  });
});
