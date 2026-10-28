// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ColorSelect } from "./color-select";
import fr from "@/messages/fr.json";

// The menu shell and cmdk are reduced to what the picker relies on: an open
// menu renders its items, each exposing the search terms cmdk would match.
vi.mock("@/components/search-menu", () => ({
  SearchMenu: ({ open, trigger, children }: { open: boolean; trigger: ReactNode; children: ReactNode }) => (
    <div>{trigger}{open ? <div data-search-menu>{children}</div> : null}</div>
  ),
}));
vi.mock("@/components/ui/command", () => ({
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => null,
  CommandItem: ({ children, onSelect, keywords, value, ...rest }: { children: ReactNode; onSelect: () => void; keywords?: string[]; value: string }) => (
    <button type="button" role="option" data-value={value} data-keywords={keywords?.join("|")} data-checked={(rest as { "data-checked"?: string })["data-checked"]} onClick={onSelect}>{children}</button>
  ),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const options = () => [...host.querySelectorAll<HTMLButtonElement>("[role=option]")];

async function render(value: string | null, onChange = vi.fn(), noneLabel?: string) {
  await act(() => root.render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <ColorSelect value={value} onChange={onChange} noneLabel={noneLabel} open onOpenChange={() => {}} trigger={<button type="button">trigger</button>} />
    </NextIntlClientProvider>,
  ));
  return onChange;
}

it("lists the palette by name, written in its own color and searchable by name only", async () => {
  await render("#ef4444");
  const red = options().find((o) => o.dataset.value === "red")!;
  expect(options()).toHaveLength(10);
  expect(red.textContent).toBe("Rouge");
  // cmdk matches the value and the keywords: the English name, the localized
  // one, and never the hex ("b" must not match teal's #14b8a6).
  expect(red.dataset.keywords).toBe("Rouge");
  expect(options().every((o) => !o.dataset.value?.startsWith("#"))).toBe(true);
  expect(red.dataset.checked).toBe("true");
  const name = [...red.querySelectorAll("span")].find((s) => s.textContent === "Rouge")!;
  expect(name.style.color).toBe("var(--page-color-red)");
});

it("returns the picked hex, and null from the none row", async () => {
  const onChange = await render(null, vi.fn(), "Aucune couleur");
  const none = options().find((o) => o.dataset.value === "__none__")!;
  expect(none.textContent).toBe("Aucune couleur");
  expect(none.dataset.checked).toBe("true");

  await act(() => options().find((o) => o.dataset.value === "blue")!.click());
  expect(onChange).toHaveBeenLastCalledWith("#3b82f6");
  await act(() => none.click());
  expect(onChange).toHaveBeenLastCalledWith(null);
});

it("checks a stored color whatever its case", async () => {
  await render("#6B7280");
  expect(options().find((o) => o.dataset.checked === "true")?.dataset.value).toBe("gray");
});
