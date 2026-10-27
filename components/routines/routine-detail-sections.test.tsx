// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutineTrigger } from "@/lib/routine-triggers";
import type { Routine } from "@/lib/routines-api";

const state = vi.hoisted(() => ({ next: null as RoutineTrigger | null }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
// The trigger fields report the trigger the test sets, and expose the highlight.
vi.mock("@/components/routines/routine-trigger-fields", () => ({
  RoutineTriggerSummary: () => null,
  RoutineTriggerFields: ({ onChange, highlightMissing }: { onChange: (value: RoutineTrigger) => void; highlightMissing?: boolean }) => (
    <button type="button" data-highlight={highlightMissing ? "on" : "off"} onClick={() => state.next && onChange(state.next)}>change</button>
  ),
}));
vi.mock("@/components/routines/routine-schedule-fields", () => ({ RoutineScheduleFields: () => null }));
vi.mock("@/components/routines/spend-cap-select", () => ({ SpendCapSelect: () => null }));
vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { RoutineSettings } from "@/components/routines/routine-detail-sections";

const routine = {
  id: "routine", project_id: "project", title: "Routine", prompt: "Check", enabled: true,
  trigger: { type: "event", event: "issue.created" }, max_spend_percent: 15,
} as unknown as Routine;
const schedule = { frequency: "daily", hour: 9, minute: 0, weekdays: [], daysOfMonth: [], timezone: "UTC" } as never;

let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("waits for a complete trigger before saving, and outlines what is missing meanwhile", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  await act(() => root.render(<RoutineSettings routine={routine} isOwner schedule={schedule} onSave={save} />));
  const change = () => act(async () => { host.querySelector("button")!.click(); });

  // A database trigger without its database is not a valid trigger yet.
  state.next = { type: "database", databaseId: "" };
  await change();
  await act(() => vi.advanceTimersByTimeAsync(1_000));
  expect(save).not.toHaveBeenCalled();
  expect(host.textContent).toContain("triggerIncompleteHint");
  expect(host.querySelector("[data-highlight]")?.getAttribute("data-highlight")).toBe("on");

  state.next = { type: "database", databaseId: "6cd36606-c297-4920-8ce3-31b5f3697be8" };
  await change();
  await act(() => vi.advanceTimersByTimeAsync(1_000));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ trigger: state.next }));
  expect(host.textContent).not.toContain("triggerIncompleteHint");
});
