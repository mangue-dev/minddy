// @vitest-environment jsdom

import { act, createElement, type PropsWithChildren } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectiveMomentum } from "@/components/objective-momentum";
import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import type { Issue, Objective } from "./types";
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: PropsWithChildren) => children,
  Tooltip: ({ children }: PropsWithChildren) => children,
  TooltipTrigger: ({ children }: PropsWithChildren) => children,
  TooltipContent: () => null,
}));

const NOW = new Date("2026-09-02T12:00:00.000Z");
const objective = {
  id: "objective-1",
  status: "in_progress",
  created_at: "2026-08-05T12:00:00.000Z",
  target_date: "2026-09-30T12:00:00.000Z",
} as Objective;
const issues = [
  { objective_id: objective.id, status: "done", effort: "m", completed_at: "2026-08-06T12:00:00.000Z" },
  { objective_id: objective.id, status: "done", effort: "m", completed_at: "2026-08-13T12:00:00.000Z" },
  { objective_id: objective.id, status: "todo", effort: "m", completed_at: null },
] as Issue[];

let queryClient = new QueryClient();

function card(source = objective, locale: "en" | "fr" = "en", timeZone = "Europe/Paris") {
  return createElement(QueryClientProvider, { client: queryClient }, createElement(
    NextIntlClientProvider,
    {
      locale,
      messages: locale === "en" ? en : fr,
      now: NOW,
      timeZone,
      children: createElement(
        TooltipProvider,
        null,
        createElement(ObjectiveMomentum, { objective: source, issues }),
      ),
    },
  ));
}

function render(source = objective, locale: "en" | "fr" = "en", timeZone = "Europe/Paris") {
  return renderToStaticMarkup(card(source, locale, timeZone));
}

describe("objective momentum card", () => {
  // The card reads the live device clock after hydration (MIN-819), so the
  // provider `now` alone no longer pins it.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The server estimate stays pending unless a test answers it.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("normalizes a date-only ISO deadline in the provider zone on a UTC renderer", () => {
    const localHours = vi.spyOn(Date.prototype, "getHours").mockReturnValue(4);
    const html = render({ ...objective, target_date: "2026-09-02T04:00:00.000Z" }, "en", "America/New_York");

    expect(html).toContain("Aug 5, 2026 → Sep 2, 2026");
    expect(html).toContain("Behind schedule");
    expect(html).not.toContain("Target date passed");
    expect(localHours).not.toHaveBeenCalled();
  });

  it("hydrates without local-zone mismatches and recomputes when the provider zone changes", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const source = { ...objective, target_date: "2026-09-02T04:00:00.000Z" };
    const localHours = vi.spyOn(Date.prototype, "getHours").mockReturnValue(4);
    const server = render(source, "en", "America/New_York");
    const container = document.createElement("div");
    container.innerHTML = server;
    document.body.append(container);
    const onRecoverableError = vi.fn();
    let root: Root | undefined;
    localHours.mockReturnValue(0);
    try {
      await act(() => {
        root = hydrateRoot(container, card(source, "en", "America/New_York"), { onRecoverableError });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.innerHTML).toBe(server);
      expect(localHours).not.toHaveBeenCalled();

      await act(() => root!.render(card(source, "en", "Europe/Paris")));
      expect(container.textContent).toContain("Target date passed");
    } finally {
      await act(() => root?.unmount());
    }
  });

  it("shows target dates, future intervals, and accessible deadline progress", () => {
    const html = render();

    expect(html).toContain("Aug 5, 2026 → Sep 30, 2026");
    expect(html).toContain("2 issues completed in this period");
    expect(html).toContain("Upcoming");
    expect(html).toContain("67% complete · 50% of time elapsed");
    expect(html).toContain("On track");
    expect(html).toContain('role="progressbar" aria-label="Objective progress" aria-valuenow="67"');
    expect(html).not.toContain("8 weeks ago");
  });

  it("keeps the estimated finish visible alongside an overdue warning", () => {
    const html = render({ ...objective, target_date: "2026-08-19T12:00:00.000Z" });

    expect(html).toContain("Target date passed");
    expect(html).toContain("The target date has passed with 1 issue still open.");
    expect(html).toContain("At this pace, the remaining work should finish around September 16, 2026.");
  });

  it("renders translated progress and deadline copy", () => {
    const html = render({ ...objective, target_date: "2026-09-05T12:00:00.000Z" }, "fr");

    expect(html).toContain("67% réalisé · 90% du temps écoulé");
    expect(html).toContain("En retard sur le rythme prévu");
    expect(html).toContain("16 septembre 2026");
    expect(html).not.toContain("Objectives.momentum");
  });

  it.each(["planned", "in_progress", "done", "canceled"] as const)(
    "hides the entire momentum card for an undated %s objective",
    (status) => {
      expect(render({ ...objective, status, target_date: null })).toBe("");
    },
  );

  it("updates the card when a target date is added, removed, and restored", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const undated = { ...objective, target_date: null };
    const container = document.createElement("div");
    document.body.append(container);
    let root: Root | undefined;
    try {
      await act(() => {
        root = hydrateRoot(container, card(undated));
      });
      expect(container.innerHTML).toBe("");

      await act(() => root!.render(card(objective)));
      expect(container.textContent).toContain("Momentum");
      expect(container.textContent).toContain("Aug 5, 2026 → Sep 30, 2026");

      await act(() => root!.render(card(undated)));
      expect(container.innerHTML).toBe("");

      await act(() => root!.render(card(objective)));
      expect(container.textContent).toContain("Momentum");
      expect(container.textContent).toContain("On track");
    } finally {
      await act(() => root?.unmount());
    }
  });

  it("replaces the local estimate with the server forecast once it arrives", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fetchMock = vi.fn(async () => Response.json({
      forecastDate: "2026-10-15T10:00:00.000Z", forecastDays: 43, basis: "contributors",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() => root.render(card()));
      for (let tick = 0; tick < 20 && !container.textContent?.includes("October 15"); tick += 1) {
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      }
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/objectives/objective-1/forecast?tz=Europe%2FParis",
        expect.objectContaining({ cache: "no-store" }),
      );
      expect(container.textContent).toContain("should finish around October 15, 2026, after the target date.");
      expect(container.textContent).toContain("Behind schedule");
    } finally {
      await act(() => root.unmount());
    }
  });

  it("suppresses canceled forecasts for a dated objective", () => {
    const canceled = render({ ...objective, status: "canceled" });
    expect(canceled).toContain("This objective is canceled.");
    expect(canceled).not.toContain('role="progressbar"');
    expect(canceled).not.toContain("At this pace");
  });
});
