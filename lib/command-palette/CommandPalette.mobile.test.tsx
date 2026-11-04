// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ mobile: true }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => layout.mobile, MOBILE_LAYOUT_QUERY: "(max-width: 1023px)" }));
vi.mock("@/lib/app-layout", () => ({ isMobileLayout: () => layout.mobile }));
vi.mock("./styles/CommandPalette.module.css", () => ({ default: {} }));
vi.mock("./styles/SearchView.module.css", () => ({ default: {} }));
vi.mock("./styles/SearchBar.module.css", () => ({ default: {} }));
vi.mock("./views/FormView", () => ({ FormView: () => null }));
vi.mock("./components/Footer", () => ({ Footer: () => null }));
vi.mock("./components/ActionsPopover", () => ({ ActionsPopover: () => null }));
vi.mock("./components/ResultsList", () => ({ ResultsList: () => null }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "./CommandPalette";
import { usePaletteStore } from "./store";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

beforeEach(() => {
  layout.mobile = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: layout.mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  usePaletteStore.getState().reset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("opens the mobile sheet on its search field", async () => {
  await act(() => root.render(
    <NextIntlClientProvider locale="en" messages={{ Common: { close: "Close" } }}>
      <TooltipProvider>
        <CommandPalette isOpen onClose={() => {}} items={[]} history={false} />
      </TooltipProvider>
    </NextIntlClientProvider>,
  ));

  const search = document.querySelector<HTMLInputElement>(".mobile-command-palette input[data-palette-search]");
  expect(search).not.toBeNull();
  expect(document.activeElement).toBe(search);
});
