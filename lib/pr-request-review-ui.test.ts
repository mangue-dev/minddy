// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PrRequestReview } from "@/components/pull-requests/pr-request-review";
import messages from "@/messages/en.json";

const h = vi.hoisted(() => ({ members: [{ login: "author", avatar_url: null, name: null }, { login: "ada", avatar_url: null, name: "Ada" }], loading: false, request: vi.fn(), membersQuery: vi.fn() }));
vi.mock("mangue-ui", async () => ({
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/button.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/dialog.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/input.tsx"),
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/components/ui/spinner.tsx"),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/use-pr-members-query", () => ({ usePrMembersQuery: (...args: unknown[]) => {
  h.membersQuery(...args);
  return { members: h.members, loading: h.loading };
} }));
vi.mock("@/lib/agent-api", () => ({ prEndpoint: (id: string) => `/api/pull-requests/${id}`, requestPullRequestReviewerApi: h.request }));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/git/forge-user-avatar", () => ({ ForgeUserAvatar: () => null }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.clearAllMocks();
  h.loading = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(overrides: Partial<Parameters<typeof PrRequestReview>[0]> = {}) {
  const props = { prId: "pr", author: "author", requestedReviewers: [], open: true, onOpenChange: vi.fn(), onRequested: vi.fn(), onRequestNumo: vi.fn(), ...overrides };
  await act(() => root.render(createElement(NextIntlClientProvider, { locale: "en", messages, children: createElement(PrRequestReview, props) })));
  return props;
}

describe("PR reviewer picker", () => {
  it("offers Numo alongside forge reviewers and opens its configured launch flow", async () => {
    const props = await render();
    const dialog = document.querySelector('[data-testid="pr-request-review-dialog"]')!;
    expect(dialog.textContent).toContain("ada");
    expect([...dialog.querySelectorAll("button")].some((button) => button.textContent === "author")).toBe(false);
    await act(() => dialog.querySelector<HTMLButtonElement>('[data-testid="pr-request-numo-review"]')!.click());
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onRequestNumo).toHaveBeenCalledOnce();
    expect(h.request).not.toHaveBeenCalled();
  });

  it("keeps Numo selectable while forge candidates load or without forge write access", async () => {
    h.loading = true;
    await render();
    expect(document.querySelector<HTMLButtonElement>('[data-testid="pr-request-numo-review"]')?.disabled).toBe(false);
    await render({ canRequestHuman: false });
    expect(h.membersQuery).toHaveBeenLastCalledWith("/api/pull-requests/pr", false);
    expect(document.querySelector('[data-testid="pr-request-review-dialog"]')!.textContent).not.toContain("ada");
  });

  it("prevents duplicate Numo reviews while a session is active", async () => {
    const props = await render({ numoDisabled: true });
    const button = document.querySelector<HTMLButtonElement>('[data-testid="pr-request-numo-review"]')!;
    expect(button.disabled).toBe(true);
    await act(() => button.click());
    expect(props.onRequestNumo).not.toHaveBeenCalled();
  });

  it("retains the forge reviewer request flow", async () => {
    const props = await render();
    const ada = [...document.querySelectorAll("button")].find((button) => button.textContent === "adaAda")!;
    await act(async () => ada.click());
    expect(h.request).toHaveBeenCalledWith("pr", "ada");
    expect(props.onRequested).toHaveBeenCalledOnce();
    expect(props.onRequestNumo).not.toHaveBeenCalled();
  });
});
