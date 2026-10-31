// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { PauseCircleIcon } from "@hugeicons/core-free-icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AnyBulkActionsRequest, EntityBulkActionsRequest } from "@/lib/bulk-actions-context";
import en from "@/messages/en.json";
import { BulkEntityActions } from "./bulk-entity-actions";

const h = vi.hoisted(() => ({ request: null as AnyBulkActionsRequest | null }));
vi.mock("@/lib/bulk-actions-context", () => ({
  useBulkActions: () => ({
    requestBulkActions: (request: AnyBulkActionsRequest) => {
      h.request = request;
    },
    registerSelectionActions: () => {},
  }),
}));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  h.request = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderPill(props: Partial<Parameters<typeof BulkEntityActions>[0]> = {}) {
  await act(() =>
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages: en,
        children: createElement(
          TooltipProvider,
          null,
          createElement(BulkEntityActions, {
            label: "2 routines selected",
            placeholder: "Actions for 2 routines…",
            count: 2,
            surface: "routines",
            actions: [{ id: "routines-pause", title: "Pause 2 routines", icon: PauseCircleIcon, run: vi.fn() }],
            onAskNumo: vi.fn(),
            onClear: vi.fn(),
            ...props,
          }),
        ),
      }),
    ),
  );
  const actions = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === en.BulkActions.actions,
  )!;
  await act(async () => actions.click());
  return h.request as EntityBulkActionsRequest;
}

const dialog = () => document.querySelector('[role="alertdialog"]');
const dialogButton = (label: string) =>
  [...(dialog()?.querySelectorAll("button") ?? [])].find((button) => button.textContent === label)!;

describe("bulk entity actions (MIN-873)", () => {
  it("hands the surface's rows and its selection label to the palette", async () => {
    const request = await renderPill();
    expect(request).toMatchObject({ kind: "entities", count: 2, label: "2 routines selected", surface: "routines" });
    expect(request.actions.map((action) => action.id)).toEqual(["routines-pause"]);
  });

  it("only trashes the selection once the confirmation is accepted", async () => {
    const onConfirm = vi.fn();
    const request = await renderPill({ trash: { title: "Move 2 routines to the trash?", onConfirm } });

    await act(async () => request.actions.find((action) => action.id === "trash")!.run!());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("Move 2 routines to the trash?");

    await act(async () => dialogButton(en.Common.moveToTrash).click());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("offers no trash row when the selection cannot be trashed", async () => {
    const request = await renderPill();
    expect(request.actions.some((action) => action.id === "trash")).toBe(false);
  });
});
