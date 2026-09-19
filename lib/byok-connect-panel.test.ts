// @vitest-environment jsdom

import { act, createElement, Fragment } from "react";
import type * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ByokConnectPanel } from "@/components/settings/byok-connect-panel";
import { RuntimeConfigProvider } from "@/lib/runtime-config-provider";
import messages from "@/messages/en.json";

vi.mock("@/components/model-logo", () => ({
  ProviderLogo: () => null,
}));

vi.mock("@/lib/use-ai-keys-query", () => ({
  aiKeysQueryKey: ["account", "ai-keys"],
  useAiKeysQuery: () => ({ keys: [], loading: false }),
}));

vi.mock("mangue-ui", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  toast: { error: vi.fn(), success: vi.fn() },
  Spinner: () => null,
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => createElement("button", props, children),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    createElement("input", props),
  Select: ({
    children,
    value,
    onValueChange,
    disabled,
  }: React.PropsWithChildren<{
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
  }>) =>
    createElement(
      "select",
      {
        value,
        disabled,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
          onValueChange(event.target.value),
      },
      children,
    ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: React.PropsWithChildren) =>
    createElement(Fragment, null, children),
  SelectGroup: ({ children }: React.PropsWithChildren) =>
    createElement(Fragment, null, children),
  SelectLabel: () => null,
  SelectSeparator: () => null,
  SelectItem: ({
    children,
    value,
  }: React.PropsWithChildren<{ value: string }>) =>
    createElement("option", { value }, children),
}));

describe("ByokConnectPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    delete (window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderPanel(managedAi = true) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, {
          client: queryClient,
          children: createElement(RuntimeConfigProvider, {
            config: {
              appUrl: "https://www.minddy.app",
              supabaseUrl: "https://supabase.example.com",
              supabaseAnonKey: "anon-key",
              siteName: "minddy",
              contactEmail: "support@example.com",
              productFeedbackIntegrationEnabled: false,
              productFeedbackUrl: null,
              posthog: {
                key: null,
                host: null,
                allowLocalhost: false,
                errorTracking: false,
              },
              vapidPublicKey: null,
              capabilities: {
                managedAi: {
                  state: managedAi ? "available" : "disabled",
                  configured: managedAi,
                },
              },
            },
            children: createElement(NextIntlClientProvider, {
              locale: "en",
              messages,
              children: createElement(ByokConnectPanel),
            }),
          }),
        }),
      );
    });
  }

  it("defaults to minddy Cloud without showing BYOK fields", async () => {
    await renderPanel();

    expect(container.querySelector("select")?.value).toBe("minddy");
    expect(container.textContent).toContain("minddy Cloud");
    expect(container.textContent).toContain("No API key is needed");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).not.toContain("Save key");
  });

  it("shows BYOK fields only after selecting an external provider", async () => {
    await renderPanel();
    const select = container.querySelector("select");
    if (!select) throw new Error("Missing provider selector");

    await act(async () => {
      select.value = "openrouter";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.querySelector("select")?.value).toBe("openrouter");
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(container.textContent).toContain("Save key");
    expect(container.textContent).not.toContain("No API key is needed");
  });

  it("defaults to an external provider when managed AI is unavailable", async () => {
    await renderPanel(false);

    const select = container.querySelector("select");
    expect(select?.value).toBe("openrouter");
    expect(select?.querySelector('option[value="minddy"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(container.textContent).toContain("Save key");
    expect(container.textContent).not.toContain("minddy Cloud");
  });
});
