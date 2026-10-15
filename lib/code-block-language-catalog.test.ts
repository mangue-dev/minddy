// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { ReadOnlyCodeBlock } from "@/components/assistant/shared-code-renderer";
import { loadFullCodeLanguageCatalog } from "@/components/code-block-language-catalog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      codePlainText: "Plain text",
      codeWrap: "Wrap long lines",
      collapse: "Collapse",
      copied: "Copied",
      copy: "Copy",
      expand: "Expand",
    })[key] ?? key,
}));

vi.mock("mangue-ui", async () => {
  const { createElement, forwardRef } = await import("react");
  const Control = forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }
  >(function Control({ children, size: _size, variant: _variant, ...props }, ref) {
    return createElement("button", { ...props, ref }, children);
  });
  return {
    Button: Control,
    IconButton: Control,
    cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" "),
  };
});

vi.mock("@/components/ui/tooltip", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      createElement(Fragment, null, children),
    TooltipContent: ({ children }: { children: React.ReactNode }) =>
      createElement("span", null, children),
    TooltipTrigger: ({ children }: { children: React.ReactNode }) =>
      createElement(Fragment, null, children),
  };
});

const ELIXIR = "defmodule Ready do\nend";

function codeBlock(language: string, code: string) {
  return createElement(ReadOnlyCodeBlock, { code, language });
}

function mount(element: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(element));
  return {
    host,
    label: () => host.querySelector(".code-block-node-language-label")?.textContent,
    destroy: () => {
      flushSync(() => root.unmount());
      host.remove();
    },
  };
}

// The cases share the module-level catalog, so they run in loading order.
describe("read-only code block grammars", () => {
  it("highlights a common language on its first render", () => {
    const view = mount(codeBlock("typescript", "const ready = true;"));

    expect(view.host.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(view.label()).toBe("TypeScript");
    view.destroy();
  });

  it("loads a rare grammar on demand and re-renders the mounted block", async () => {
    const view = mount(codeBlock("elixir", ELIXIR));

    expect(view.host.querySelector("code")?.textContent).toBe(ELIXIR);
    expect(view.host.querySelector("code [class^='hljs']")).toBeNull();

    await vi.waitFor(() =>
      expect(view.host.querySelector(".hljs-keyword")?.textContent).toBe("defmodule"),
    );
    expect(view.host.querySelector("code")?.textContent).toBe(ELIXIR);
    expect(view.label()).toBe("Elixir");
    view.destroy();
  });

  it("hydrates server markup without depending on grammars this process loaded", async () => {
    const catalog = await loadFullCodeLanguageCatalog();
    expect(catalog.options.length).toBeGreaterThan(180);

    const host = document.createElement("div");
    document.body.append(host);
    host.innerHTML = renderToString(codeBlock("elixir", ELIXIR));
    expect(host.querySelector("code [class^='hljs']")).toBeNull();

    const onRecoverableError = vi.fn();
    const root = hydrateRoot(host, codeBlock("elixir", ELIXIR), { onRecoverableError });

    await vi.waitFor(() =>
      expect(host.querySelector(".hljs-keyword")?.textContent).toBe("defmodule"),
    );
    expect(onRecoverableError).not.toHaveBeenCalled();
    flushSync(() => root.unmount());
    host.remove();
  });
});
