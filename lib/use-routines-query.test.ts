import { QueryClient } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { PublicRuntimeConfig } from "./public-runtime-config";
import { RuntimeConfigProvider } from "./runtime-config-provider";

const api = vi.hoisted(() => ({ runs: vi.fn(async () => ({ runs: [] })) }));
vi.mock("./routines-api", () => ({ fetchRoutinesApi: vi.fn(), fetchRoutineRunsApi: api.runs }));

import { prefetchRoutineDetail, routineRunsQueryKey, useRoutineSchedulingConfigured } from "./use-routines-query";

beforeEach(() => { api.runs.mockClear(); });

it("reads a routine's runs once per routine, filling the cache the pane reads", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
  prefetchRoutineDetail(client, "r1");
  prefetchRoutineDetail(client, "r1");
  await vi.waitFor(() => expect(client.isFetching()).toBe(0));
  expect(api.runs).toHaveBeenCalledTimes(1);
  expect(api.runs).toHaveBeenCalledWith("r1");
  expect(client.getQueryData(routineRunsQueryKey("r1"))).toEqual({ runs: [] });
  prefetchRoutineDetail(client, "r2");
  expect(api.runs).toHaveBeenCalledTimes(2);
});

function scheduling(capabilities?: PublicRuntimeConfig["capabilities"]): string {
  const Probe = () => String(useRoutineSchedulingConfigured());
  const probe = createElement(Probe);
  return renderToStaticMarkup(capabilities
    ? createElement(RuntimeConfigProvider, { config: { capabilities } as PublicRuntimeConfig, children: probe })
    : probe);
}

// Read from the page's runtime configuration since MIN-996: a failed catalog
// read no longer reported a configured scheduler as missing.
it("reads routine scheduling from the instance's scheduler capability", () => {
  expect(scheduling({ scheduler: { state: "enabled", configured: true } })).toBe("true");
  expect(scheduling({ scheduler: { state: "disabled", configured: false } })).toBe("false");
  expect(scheduling({})).toBe("false");
  expect(scheduling()).toBe("false");
});
