// @vitest-environment jsdom
//
// A relation's other end shows its hover card (MIN-879), where the app
// provides one.
import { act, cloneElement, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MentionHoverProvider, type MentionHoverProps } from "@/components/mention-hover";
import { RelationRow } from "./relation-rows";

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** A card that marks its trigger instead of opening anything. */
function MarkingCard({ type, id, project, children }: MentionHoverProps) {
  if (type !== "issue" && type !== "objective") return children;
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    "data-hover-card": `${type}:${id}:${project ?? ""}`,
  });
}

async function render(row: ReactElement) {
  await act(async () => {
    root.render(createElement(NextIntlClientProvider, {
      locale: "en", messages, timeZone: "UTC",
      children: createElement(TooltipProvider, {
        children: createElement(MentionHoverProvider, { card: MarkingCard, children: row }),
      }),
    }));
  });
}

it("shows the linked issue's card on its row", async () => {
  await render(createElement(RelationRow, {
    target: { kind: "issue", identifier: "MIN-7", title: "Rotate keys", id: "i7", projectId: "p1" },
  }));
  expect(host.querySelector("button")?.getAttribute("data-hover-card")).toBe("issue:i7:p1");
});

it("leaves a row without the other end's id as it was", async () => {
  await render(createElement(RelationRow, {
    target: { kind: "objective", name: "Launch" },
  }));
  expect(host.querySelector("button")?.hasAttribute("data-hover-card")).toBe(false);
});
