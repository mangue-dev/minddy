// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import { useLiveNow, useTimeAgo } from "./use-live-now";
import { normalizeForgeInstant } from "./forge-time";

it("ages past events using a live clock even when the intl provider opened hours earlier", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  const container = document.createElement("div");
  const root = createRoot(container);
  const event = "2026-10-04T11:00:00Z";
  function DateLabel() {
    const now = useLiveNow();
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

it("mounts a late component on the current instant, not on an idle snapshot", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.setSystemTime(new Date("2026-10-27T01:00:00Z"));
  const first = createRoot(document.createElement("div"));
  const later = document.createElement("div");
  const second = createRoot(later);
  const renders: number[] = [];
  function Clock() {
    const now = useLiveNow();
    renders.push(now.getTime());
    return createElement("span", null, now.toISOString());
  }
  const provider = (children: ReturnType<typeof createElement>) => createElement(NextIntlClientProvider, {
    locale: "en", timeZone: "UTC", now: new Date("2026-10-27T01:00:00Z"), children,
  });
  try {
    await act(() => first.render(provider(createElement(Clock))));
    await act(() => first.unmount());
    // Eleven hours without any subscriber: the shared timer is stopped.
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    renders.length = 0;
    await act(() => second.render(provider(createElement(Clock))));
    expect(renders[0]).toBe(Date.parse("2026-10-27T12:00:00Z"));
    expect(later.textContent).toBe("2026-10-27T12:00:00.000Z");
  } finally { await act(() => second.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); }
});

it("formats a just-received event as past even with a stale provider clock or a skewed server", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  const container = document.createElement("div");
  const root = createRoot(container);
  function Labels() {
    const timeAgo = useTimeAgo();
    return createElement("span", null, [
      timeAgo("2026-10-27T11:50:00+00:00"),
      timeAgo("2026-10-27T12:00:20Z"),
      timeAgo(null) ?? "none",
    ].join(" | "));
  }
  try {
    await act(() => root.render(createElement(NextIntlClientProvider, {
      // The document was served eleven hours before these events.
      locale: "en", timeZone: "UTC", now: new Date("2026-10-27T01:00:00Z"), children: createElement(Labels),
    })));
    expect(container.textContent).toBe("10 minutes ago | now | none");
  } finally { await act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
