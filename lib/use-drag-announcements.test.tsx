// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import type { Announcements, Active, Over } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { useDragAnnouncements } from "./use-drag-announcements";

const names: Record<string, string> = {
  "4f1c7d2e-0000-4000-8000-000000000001": "Release notes",
  todo: "Todo",
};

async function announcements(locale: "en" | "fr", messages: typeof en | typeof fr) {
  let result: Announcements | null = null;
  function Probe() {
    result = useDragAnnouncements((id) => names[String(id)]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(
    <NextIntlClientProvider locale={locale} messages={messages}><Probe /></NextIntlClientProvider>,
  ));
  root.unmount();
  return result as unknown as Announcements;
}

const active = { id: "4f1c7d2e-0000-4000-8000-000000000001" } as Active;
const over = { id: "todo" } as Over;

describe("drag announcements", () => {
  it("names the dragged item and its target instead of reading their IDs", async () => {
    const a = await announcements("en", en);
    expect(a.onDragStart({ active })).toBe("Picked up Release notes.");
    expect(a.onDragOver({ active, over })).toBe("Release notes is over Todo.");
    expect(a.onDragEnd({ active, over })).toBe("Release notes was dropped over Todo.");
    expect(a.onDragEnd({ active, over: null })).toBe("Release notes was dropped.");
    expect(a.onDragCancel({ active, over: null })).toBe("Moving Release notes was cancelled.");
  });

  it("speaks the interface language and never falls back to a raw ID", async () => {
    const a = await announcements("fr", fr);
    expect(a.onDragStart({ active })).toBe("Release notes est saisi.");
    const unknown = { id: "9a0b1c2d-0000-4000-8000-000000000009" } as Active;
    expect(a.onDragStart({ active: unknown })).toBe("Élément est saisi.");
  });
});
