// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { PreviewEnvBanner } from "./preview-env-banner";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewEnvBanner />
      </NextIntlClientProvider>,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
});

describe("PreviewEnvBanner", () => {
  it("warns on preview and links to the production site", () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    render();
    expect(container.textContent).toContain("This is a test version. To use minddy, go to minddy.app.");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://www.minddy.app");
  });

  it.each([
    ["production on Vercel", { NEXT_PUBLIC_VERCEL_ENV: "production" }],
    ["a self-hosted production", { NEXT_PUBLIC_VERCEL_ENV: "", NODE_ENV: "production" }],
    ["local development", { NEXT_PUBLIC_VERCEL_ENV: "", NODE_ENV: "development" }],
  ])("renders nothing in %s", (_label, env) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    render();
    expect(container.innerHTML).toBe("");
  });
});
