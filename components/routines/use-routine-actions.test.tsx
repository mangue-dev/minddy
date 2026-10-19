// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Routine } from "@/lib/routines-api";
import { routinesQueryKey } from "@/lib/use-routines-query";
import { useRoutineActions } from "./use-routine-actions";

const api = vi.hoisted(() => ({
  updateRoutineApi: vi.fn(),
  runRoutineNowApi: vi.fn(),
  deleteRoutineApi: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/lib/routines-api", () => ({
  updateRoutineApi: api.updateRoutineApi,
  runRoutineNowApi: api.runRoutineNowApi,
  deleteRoutineApi: api.deleteRoutineApi,
}));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: api.toast,
}));
vi.mock("@/components/ui/confirm-delete-dialog", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ConfirmDeleteDialog: () => null,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const routine = (id: string, enabled = true): Routine => ({
  id, project_id: "project", owner_id: "owner", title: id, prompt: "Check", prompt_mentions: [],
  base_branch: null, max_spend_percent: 100, frequency: "daily", hour: 9, minute: 0, weekdays: [],
  days_of_month: [], timezone: "UTC", enabled, next_run_at: enabled ? "2026-10-18T09:00:00.000Z" : null,
  last_run_at: null, last_error: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
} as Routine);

let client: QueryClient, root: Root, host: HTMLDivElement;
let actions: ReturnType<typeof useRoutineActions>;
function Probe({ schedulingConfigured = true }: { schedulingConfigured?: boolean }) {
  actions = useRoutineActions({ schedulingConfigured });
  return null;
}
const render = (schedulingConfigured = true) =>
  act(() => root.render(<QueryClientProvider client={client}><Probe schedulingConfigured={schedulingConfigured} /></QueryClientProvider>));
const cached = () => client.getQueryData<{ routines: Routine[] }>(routinesQueryKey())!.routines;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(routinesQueryKey(), { routines: [routine("a"), routine("b")] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("useRoutineActions", () => {
  it("pauses at once and restores the list when the server refuses", async () => {
    let refuse!: (error: Error) => void;
    api.updateRoutineApi.mockReturnValue(new Promise((_, reject) => { refuse = reject; }));
    await render();
    act(() => actions.toggleEnabled(routine("a"), false));
    expect(cached()[0]).toMatchObject({ enabled: false, next_run_at: null });
    expect(cached()[1].enabled).toBe(true);
    await act(async () => { refuse(new Error("Only the owner")); });
    expect(cached()[0]).toMatchObject({ enabled: true, next_run_at: "2026-10-18T09:00:00.000Z" });
    expect(api.toast.error).toHaveBeenCalledWith("Only the owner");
  });

  it("allows pausing without a scheduler but refuses to reactivate", async () => {
    api.updateRoutineApi.mockResolvedValue({ routine: routine("a", false) });
    await render(false);
    act(() => actions.toggleEnabled(routine("a", false), true));
    expect(api.updateRoutineApi).not.toHaveBeenCalled();
    expect(api.toast.error).toHaveBeenCalledWith("unavailableScheduler");
    act(() => actions.toggleEnabled(routine("a"), false));
    expect(api.updateRoutineApi).toHaveBeenCalledWith("a", { enabled: false });
  });

  it("ignores a second launch of the same routine while the first is pending, not another routine's", async () => {
    let finish!: () => void;
    api.runRoutineNowApi.mockImplementation((id: string) =>
      id === "a" ? new Promise<void>((resolve) => { finish = resolve; }) : Promise.resolve());
    await render();
    let first!: Promise<unknown>;
    await act(async () => { first = actions.runNow(routine("a")); });
    expect(actions.isPending("a")).toBe(true);
    expect(actions.isPending("b")).toBe(false);
    await act(async () => { await actions.runNow(routine("a")); await actions.runNow(routine("b")); });
    expect(api.runRoutineNowApi.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    await act(async () => { finish(); await first; });
    expect(actions.isPending("a")).toBe(false);
    expect(api.toast.success).toHaveBeenCalledTimes(2);
  });

  it("reports whether the routine reached the trash", async () => {
    api.deleteRoutineApi.mockRejectedValueOnce(new Error("Refused")).mockResolvedValueOnce(undefined);
    await render();
    let removed = true;
    await act(async () => { removed = await actions.remove(routine("a")); });
    expect(removed).toBe(false);
    expect(api.toast.error).toHaveBeenCalledWith("Refused");
    await act(async () => { removed = await actions.remove(routine("a")); });
    expect(removed).toBe(true);
  });
});
