import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ObjectiveMomentum } from "@/components/objective-momentum";
import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import type { Issue, Objective } from "./types";

// Keep layout primitives out of Node SSR; their package entry also imports
// browser-only emoji data. The card, calculations, and translations stay real.
vi.mock("mangue-ui", () => ({ cn: (...classes: string[]) => classes.filter(Boolean).join(" ") }));
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

function render(source = objective, locale: "en" | "fr" = "en") {
  return renderToStaticMarkup(createElement(
    NextIntlClientProvider,
    {
      locale,
      messages: locale === "en" ? en : fr,
      now: NOW,
      timeZone: "Europe/Paris",
      children: createElement(
        TooltipProvider,
        null,
        createElement(ObjectiveMomentum, { objective: source, issues }),
      ),
    },
  ));
}

describe("objective momentum card", () => {
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

  it("retains rolling history without a target and suppresses canceled forecasts", () => {
    const rolling = render({ ...objective, target_date: null });
    expect(rolling).toContain("8 weeks ago");
    expect(rolling).not.toContain('role="progressbar"');

    const canceled = render({ ...objective, status: "canceled" });
    expect(canceled).toContain("This objective is canceled.");
    expect(canceled).not.toContain('role="progressbar"');
    expect(canceled).not.toContain("At this pace");
  });
});
