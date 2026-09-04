import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MessageResponse } from "@/components/ai-elements/message";
import { Markdown } from "@/components/markdown";
import {
  PAGE_CODE_COMPONENTS,
  PageCodeRenderer,
} from "@/components/assistant/shared-code-renderer";

vi.mock("mangue-ui", async () => {
  const { createElement, forwardRef } = await import("react");
  const Control = forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }
  >(function Control({ children, size: _size, variant: _variant, ...props }, ref) {
    return createElement("button", { ...props, ref }, children);
  });
  return {
    cn: (...classes: Array<string | false | null | undefined>) =>
      classes.filter(Boolean).join(" "),
    Button: Control,
    IconButton: Control,
  };
});

vi.mock("@/components/ui/tooltip", async () => {
  const { Fragment, createElement } = await import("react");
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    createElement(Fragment, null, children);
  return {
    Tooltip: Passthrough,
    TooltipTrigger: Passthrough,
    TooltipContent: Passthrough,
    TooltipProvider: Passthrough,
  };
});

function renderCode(props: Parameters<typeof PageCodeRenderer>[0]): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      timeZone: "UTC",
      messages: {
        Assistant: { collapse: "Collapse", expand: "Expand" },
        Common: {
          codeLanguage: "Code language",
          codePlainText: "Plain text",
          codeWrap: "Wrap long lines",
          copy: "Copy",
          copied: "Copied",
        },
      },
      children: createElement(TooltipProvider, {
        children: createElement(PageCodeRenderer, props),
      }),
    }),
  );
}

function renderResponse(markdown: string): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      timeZone: "UTC",
      messages: {
        Assistant: { collapse: "Collapse", expand: "Expand" },
        Common: {
          codeLanguage: "Code language",
          codePlainText: "Plain text",
          codeWrap: "Wrap long lines",
          copy: "Copy",
          copied: "Copied",
        },
      },
      children: createElement(TooltipProvider, {
        children: createElement(MessageResponse, {
          components: PAGE_CODE_COMPONENTS,
          children: markdown,
        }),
      }),
    }),
  );
}

function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      timeZone: "UTC",
      messages: {
        Assistant: { collapse: "Collapse", expand: "Expand" },
        Common: {
          codePlainText: "Plain text",
          codeWrap: "Wrap long lines",
          copy: "Copy",
          copied: "Copied",
        },
      },
      children: createElement(TooltipProvider, {
        children: createElement(Markdown, { children: markdown }),
      }),
    }),
  );
}

describe("PageCodeRenderer", () => {
  it("uses the full-width shared CodeBlock for a fenced block", () => {
    const html = renderResponse("```typescript\nconst ready = true;\n```");

    expect(html).toContain("w-full");
    expect(html).toContain("code-block-node-view");
    expect(html).toContain("code-block-node-wrap");
    expect(html).toContain(
      '<span class="code-block-node-language-label">TypeScript</span>',
    );
    expect(html).not.toContain("lucide-chevrons-up-down");
    expect(html).not.toContain('aria-label="Code language"');
    expect(html).toContain("typescript");
    expect(html).toContain('class="hljs-keyword">const</span> ready =');
    expect(html).toContain('class="hljs-literal">true</span>;');
    expect(html).toContain('aria-label="Copy"');
  });

  it("uses the same read-only Page surface in general Markdown", () => {
    const html = renderMarkdown("```typescript\nconst ready = true;\n```");

    expect(html).toContain("code-block-node-view");
    expect(html).toContain("code-block-node-wrap");
    expect(html).toContain(
      '<span class="code-block-node-language-label">TypeScript</span>',
    );
    expect(html).toContain('class="hljs-keyword">const</span> ready =');
    expect(html).not.toContain("github-light");
  });

  it("defines distinct light and dark palettes for the shared surface", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const light = css.match(/\.code-block-node-view \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const dark = css.match(/\.dark \.code-block-node-view \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(light).toContain("--code-block-background: #f6f8fa");
    expect(light).toContain("--code-block-foreground: #1f2328");
    expect(dark).toContain("--code-block-background: #202020");
    expect(dark).toContain("--code-block-foreground: #f5f5f5");
  });

  it("stretches the Agent message container as well as the code block", () => {
    const source = readFileSync(
      join(process.cwd(), "components/assistant/chat-message.tsx"),
      "utf8",
    );

    expect(source).toMatch(/usePageCodeBlock && "w-full"/);
  });

  it("keeps inline code inline", () => {
    const html = renderCode({ children: "run()" });

    expect(html).toContain("<code");
    expect(html).toContain("run()");
    expect(html).not.toContain("w-full");
  });
});
