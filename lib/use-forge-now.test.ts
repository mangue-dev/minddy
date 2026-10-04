// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import { useForgeNow } from "./use-forge-now";
import { normalizeForgeInstant } from "./forge-time";

it("ages past events using a live clock even when the intl provider opened hours earlier", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  const container = document.createElement("div");
  const root = createRoot(container);
  const event = "2026-10-04T11:00:00Z";
  function DateLabel() {
    const now = useForgeNow();
    return createElement("span", null, String(now.getTime() - normalizeForgeInstant(event, now)!.getTime()));
  }
  try {
    await act(() => root.render(createElement(NextIntlClientProvider, {
      locale: "en", timeZone: "UTC", now: new Date("2026-10-04T08:00:00Z"), children: createElement(DateLabel),
    })));
    expect(container.textContent).toBe(String(60 * 60_000));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(container.textContent).toBe(String(60 * 60_000 + 30_000));
  } finally { await act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
