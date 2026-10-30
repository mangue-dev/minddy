// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutineTrigger } from "@/lib/routine-triggers";
import type { Routine } from "@/lib/routines-api";

const state = vi.hoisted(() => ({
  next: null as RoutineTrigger | null,
  live: { status: "unavailable" } as { status: "loading" | "ready" | "unavailable" },
  liveInput: null as null | Record<string, unknown>,
}));
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
// The instruction field shows which session it got, and types on demand.
vi.mock("@/components/routines/routine-prompt-field", () => ({
  RoutinePromptField: ({ onChange, live }: { onChange: (value: string, mentions: never[]) => void; live?: { status: string } | null }) => (
    <textarea data-live={live?.status ?? "none"} onChange={(event) => onChange(event.target.value, [])} />
  ),
}));
vi.mock("@/lib/use-description-collaboration", () => ({
  useDescriptionCollaboration: (input: Record<string, unknown>) => {
    state.liveInput = input;
    return state.live;
  },
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: [] }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock("@/components/routines/spend-cap-select", () => ({ SpendCapSelect: () => null }));
vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { RoutineInstruction, RoutineSettings } from "@/components/routines/routine-detail-sections";

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

/** Types into the instruction field, then moves the focus out of it. */
async function typeAndLeave(text: string) {
  const field = host.querySelector("textarea")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
  });
}

it("edits the instruction in its live session, which saves it without a blur save", async () => {
  state.live = { status: "ready" };
  const save = vi.fn().mockResolvedValue(undefined);
  await act(() => root.render(<RoutineInstruction routine={routine} isOwner onSave={save} />));
  expect(state.liveInput).toMatchObject({ kind: "routine", id: "routine", userId: "owner", enabled: true });
  expect(host.querySelector("textarea")?.getAttribute("data-live")).toBe("ready");

  await typeAndLeave("Check twice");
  expect(save).not.toHaveBeenCalled();
});

it("saves the instruction when the focus leaves it without a live session", async () => {
  state.live = { status: "unavailable" };
  const save = vi.fn().mockResolvedValue(undefined);
  await act(() => root.render(<RoutineInstruction routine={routine} isOwner onSave={save} />));

  await typeAndLeave("Check twice");
  expect(save).toHaveBeenCalledWith({ prompt: "Check twice", promptMentions: [] });
});
