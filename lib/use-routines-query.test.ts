import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ runs: vi.fn(async () => ({ runs: [] })), models: vi.fn(async () => ({})) }));
vi.mock("./routines-api", () => ({ fetchRoutinesApi: vi.fn(), fetchRoutineRunsApi: api.runs }));
vi.mock("./use-agent-models-query", () => ({ agentModelsQueryKey: ["agent-models"], fetchAgentModels: api.models }));

import { prefetchRoutineDetail, routineRunsQueryKey } from "./use-routines-query";

beforeEach(() => { api.runs.mockClear(); api.models.mockClear(); });

it("reads a routine's runs and the model catalog once per routine, filling the cache the pane reads", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
  prefetchRoutineDetail(client, "r1");
  prefetchRoutineDetail(client, "r1");
  await vi.waitFor(() => expect(client.isFetching()).toBe(0));
  expect(api.runs).toHaveBeenCalledTimes(1);
  expect(api.runs).toHaveBeenCalledWith("r1");
  expect(client.getQueryData(routineRunsQueryKey("r1"))).toEqual({ runs: [] });
  prefetchRoutineDetail(client, "r2");
  expect(api.runs).toHaveBeenCalledTimes(2);
  expect(api.models).toHaveBeenCalledTimes(1);
});
