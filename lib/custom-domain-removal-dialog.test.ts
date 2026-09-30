// @vitest-environment jsdom
import React, { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { View } from "./types";

const h = vi.hoisted(() => ({ revoke: vi.fn(), update: vi.fn(), pageRevoke: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: (namespace: string) =>
  (key: string) => (messages as unknown as Record<string, Record<string, string>>)[namespace][key] }));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@hugeicons/core-free-icons", () => ({ Copy01Icon: {}, Share01Icon: {}, GlobeIcon: {} }));
vi.mock("@/lib/pages-api", () => ({
  deletePageShareApi: h.pageRevoke,
  updatePageShareApi: vi.fn(),
  fetchPageShareApi: async () => ({ level: "public", token: "page-token", include_children: false }),
}));
vi.mock("@/lib/views-api", () => ({
  deleteViewShareApi: h.revoke,
  updateViewShareApi: h.update,
  fetchViewShareApi: async () => ({ level: "public", token: "token" }),
}));
vi.mock("@/components/custom-domain-section", () => ({
  CustomDomainSection: () => null,
  fetchCustomDomainApi: async () => ({ domain: { domain: "view.example.com", status: "pending" } }),
}));
vi.mock("mangue-ui", () => {
  const box = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) =>
      createElement("button", { onClick }, children),
    Dialog: box, DialogContent: box, DialogDescription: box, DialogHeader: box, DialogTitle: box,
    Input: () => null, Spinner: () => null, Checkbox: () => null,
    toast: { success: vi.fn(), error: vi.fn() },
    SegmentedControl: ({ options, onChange }: { options: { value: string; label: string }[]; onChange: (s: string) => void }) =>
      createElement("div", null, ...options.map((option) => createElement("button", {
        key: option.value, onClick: () => onChange(option.value),
      }, option.label))),
    ConfirmDeleteDialog: ({ open, description, confirmLabel, cancelLabel, onConfirm, onOpenChange }: {
      open: boolean; description: string; confirmLabel: string; cancelLabel: string;
      onConfirm: () => Promise<void>; onOpenChange: (open: boolean) => void;
    }) => open ? createElement("div", { role: "alertdialog" }, description,
      createElement("button", { onClick: () => onOpenChange(false) }, cancelLabel),
      createElement("button", { onClick: async () => { await onConfirm(); onOpenChange(false); } }, confirmLabel)) : null,
  };
});
import { ShareViewDialog } from "@/components/share-view-dialog";
import { PagePublishDialog, pageShareKey } from "@/components/pages/page-publish-dialog";

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.revoke.mockResolvedValue(undefined);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["view-share", "view-1"], { level: "public", token: "token" });
  client.setQueryData(["share-domain", "view-1"], { domain: { domain: "view.example.com", status: "pending" } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(ShareViewDialog, { view: { id: "view-1", name: "Test view" } as View,
      open: true, onOpenChange: () => {} }))));
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  expect(button).toBeDefined();
  await act(async () => { button!.click(); });
}

it("explains removal of a pending domain before revocation and preserves sharing on cancel", async () => {
  await click(messages.ShareView.levelPrivate);
  expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain(messages.CustomDomain.stopHostingDescription);
  expect(h.revoke).not.toHaveBeenCalled();
  await click(messages.Common.cancel);
  expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  expect(client.getQueryData(["view-share", "view-1"])).toMatchObject({ level: "public" });
  expect(h.revoke).not.toHaveBeenCalled();
});

it("revokes only after confirmation and clears the removed domain from the cache", async () => {
  await click(messages.ShareView.levelPrivate);
  await click(messages.CustomDomain.stopSharing);
  expect(h.revoke).toHaveBeenCalledWith("view-1");
  expect(client.getQueryData(["view-share", "view-1"])).toBeNull();
  expect(client.getQueryData(["share-domain", "view-1"])).toBeUndefined();
});

it("requires confirmation before unpublishing a page and keeps publication on cancel", async () => {
  h.pageRevoke.mockResolvedValue(undefined);
  client.setQueryData(pageShareKey("page-1"), { level: "public", token: "page-token", include_children: false });
  await act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(PagePublishDialog, { projectId: "project-1", pageId: "page-1", title: "Page",
      descendantCount: 0, open: true, onOpenChange: () => {} }))));
  await click(messages.PublishPage.levelPrivate);
  expect(h.pageRevoke).not.toHaveBeenCalled();
  await click(messages.Common.cancel);
  expect(client.getQueryData(pageShareKey("page-1"))).toMatchObject({ level: "public" });
  await click(messages.PublishPage.levelPrivate);
  await click(messages.CustomDomain.unpublishPage);
  expect(h.pageRevoke).toHaveBeenCalledWith("project-1", "page-1");
  expect(client.getQueryData(pageShareKey("page-1"))).toBeNull();
});
