// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { aiRoutesQueryKey, useSetAiRoute, type AiRoutesState } from "./use-ai-routes-query";

const initial: AiRoutesState = {
  routes: { assistant: "minddy", automations: "minddy", voice: "minddy", feedback: "minddy" },
  options: { assistant: [], automations: [], voice: [], feedback: [] },
};

let client: QueryClient;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let mutate: ReturnType<typeof useSetAiRoute>["mutate"];
const onError = vi.fn();

function Harness() {
  mutate = useSetAiRoute(onError).mutate;
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onError.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(aiRoutesQueryKey, initial);
  host = document.createElement("div");
  root = createRoot(host);
  await act(() => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>));
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

it("shows a usage's new provider before the server answers (MIN-826)", async () => {
  let answer!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; })));
  await act(async () => mutate({ surface: "automations", provider: "anthropic" }));
  expect(client.getQueryData<AiRoutesState>(aiRoutesQueryKey)?.routes.automations).toBe("anthropic");
  await act(async () => answer(Response.json({ ...initial, routes: { ...initial.routes, automations: "anthropic" } })));
  expect(onError).not.toHaveBeenCalled();
});

it("puts the previous provider back when the server refuses the change", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Connect this provider before choosing it." }, { status: 422 })));
  await act(async () => mutate({ surface: "voice", provider: "anthropic" }));
  await vi.waitFor(() => expect(onError).toHaveBeenCalled());
  expect(client.getQueryData<AiRoutesState>(aiRoutesQueryKey)?.routes.voice).toBe("minddy");
  expect(onError.mock.calls[0]![0].message).toBe("Connect this provider before choosing it.");
});
