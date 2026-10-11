import { afterEach, expect, it, vi } from "vitest";
import { saveAgentEnginePreferenceApi } from "./agent-keys-api";

vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it("writes only the selected engine without caching or exposing authentication", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ default_engine: "codex", native_agents_enabled: true }));
  vi.stubGlobal("fetch", fetcher);
  expect(await saveAgentEnginePreferenceApi("codex")).toMatchObject({ default_engine: "codex" });
  expect(fetcher).toHaveBeenCalledWith("/api/account/agent-preferences", {
    method: "PUT", cache: "no-store", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ default_engine: "codex" }),
  });
});

it("retains recognized recovery codes and discards arbitrary native errors", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ errorCode: "reconnect_required", error: "secret native transcript" }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ errorCode: "token-secret", error: "secret native transcript" }, { status: 500 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(saveAgentEnginePreferenceApi("claude_code")).rejects.toMatchObject({ code: "reconnect_required", message: "Native agent request failed" });
  await expect(saveAgentEnginePreferenceApi("opencode")).rejects.toMatchObject({
    code: null, message: "Native agent request failed",
  });
});
