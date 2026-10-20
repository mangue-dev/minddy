// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import fr from "@/messages/fr.json";
import { CloseButton } from "./close-button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { TooltipProvider } from "./tooltip";

// Key caps hide in the mobile layout; these tests describe the desktop one.
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function render(node: ReactNode) {
  await act(() => root.render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <TooltipProvider>{node}</TooltipProvider>
    </NextIntlClientProvider>,
  ));
}

const tooltip = () => document.querySelector('[role="tooltip"]');

describe("default close button", () => {
  it("is named in the reader's language and shows Escape in its tooltip", async () => {
    await render(<CloseButton />);
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe(fr.Common.close);
    expect(button.textContent).toBe("");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    await act(async () => button.focus());
    expect(tooltip()?.textContent).toContain(fr.Common.close);
    expect([...tooltip()!.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual(["Esc"]);
  });

  it("labels the cross of a dialog without opening its tooltip on the dialog's own focus", async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Release notes</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const close = document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!;
    expect(close.getAttribute("aria-label")).toBe(fr.Common.close);
    expect(document.activeElement).toBe(close);
    expect(tooltip()).toBeNull();
  });
});
