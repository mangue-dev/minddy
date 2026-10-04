// @vitest-environment jsdom
import { act, createElement, type ChangeEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { FeedbackParticipantsGroup } from "@/components/feedback/feedback-participants-group";

const input = vi.hoisted(() => ({ onChange: null as ((event: ChangeEvent<HTMLInputElement>) => void) | null }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  SettingsEmpty: ({ children }: { children: ReactNode }) => createElement("p", null, children),
}));
vi.mock("mangue-ui", () => ({
  Input: (props: { onChange: typeof input.onChange; value: string }) => { input.onChange = props.onChange; return createElement("input", { value: props.value, readOnly: true }); },
  Button: ({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled: boolean }) => createElement("button", { onClick, disabled }, children),
  ConfirmDeleteDialog: () => null,
  Spinner: () => createElement("div", { "data-spinner": true }),
}));
afterEach(() => vi.unstubAllGlobals());

it("keeps participant results during a held refetch and still loads each new search separately", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const pending: ((response: Response) => void)[] = [];
  const fetch = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const search = async (value: string) => {
    await act(() => input.onChange!({ target: { value } } as ChangeEvent<HTMLInputElement>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
  };
  const finish = (email: string) => act(async () => {
    pending.shift()!(Response.json({ users: [{ id: email, email }] }));
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  try {
    await act(() => root.render(createElement(QueryClientProvider, { client }, createElement(FeedbackParticipantsGroup, { projectId: "p" }))));
    expect(fetch).not.toHaveBeenCalled();
    expect(container.textContent).toContain("feedbackParticipantsHint");
    await search("alice");
    await act(async () => { await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1)); });
    expect(container.querySelector("[data-spinner]")).not.toBeNull();
    await finish("alice@example.test");
    const row = container.querySelector("li")!;
    const button = row.querySelector("button")!;
    button.focus();
    let refresh!: Promise<void>;
    await act(() => { refresh = client.invalidateQueries({ queryKey: ["feedback-participants", "p", "alice"], exact: true }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.querySelector("li")).toBe(row);
    expect(document.activeElement).toBe(button);
    expect(container.querySelector("[data-spinner]")).toBeNull();
    await finish("alice-updated@example.test");
    await refresh;
    expect(container.textContent).toContain("alice-updated@example.test");
    await search("bob");
    await act(async () => { await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3)); });
    expect(container.querySelector("[data-spinner]")).not.toBeNull();
    expect(container.textContent).not.toContain("alice-updated@example.test");
    await finish("bob@example.test");
    expect(container.textContent).toContain("bob@example.test");
  } finally { await act(() => root.unmount()); container.remove(); client.clear(); }
});
