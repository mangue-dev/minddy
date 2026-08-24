import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SelfHostedSandbox } from "./self-hosted-sandbox";

const originalUrl = process.env.AGENT_RUNNER_URL;
const originalSecret = process.env.AGENT_RUNNER_SECRET;

function runnerResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.AGENT_RUNNER_URL = "http://agent-runner:6464/";
  process.env.AGENT_RUNNER_SECRET = "runner-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalUrl === undefined) delete process.env.AGENT_RUNNER_URL;
  else process.env.AGENT_RUNNER_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.AGENT_RUNNER_SECRET;
  else process.env.AGENT_RUNNER_SECRET = originalSecret;
});

describe("self-hosted agent sandbox", () => {
  it("creates a run sandbox through the built-in runner", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      runnerResponse({ created: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await SelfHostedSandbox.getOrCreate("agent-numo-1");

    expect(result.created).toBe(true);
    expect(result.sandbox.name).toBe("agent-numo-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://agent-runner:6464/v1/sandboxes/agent-numo-1",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({ authorization: "Bearer runner-secret" }),
      }),
    );
  });

  it("runs the agent process inside that sandbox", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      runnerResponse({
        commandId: "command-1",
        exitCode: 0,
        stdout: "done",
        stderr: "",
      }));
    vi.stubGlobal("fetch", fetchMock);
    const sandbox = new SelfHostedSandbox("agent-numo-1");

    const command = await sandbox.runCommand({
      cmd: "node",
      args: ["/vercel/sandbox/harness/main.js"],
      detached: true,
    });

    expect(command.cmdId).toBe("command-1");
    expect(await command.stdout()).toBe("done");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      cmd: "node",
      args: ["/vercel/sandbox/harness/main.js"],
      detached: true,
    });
  });

  it("configures an LLM relay without placing the provider key in the sandbox", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      runnerResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const sandbox = new SelfHostedSandbox("agent-numo-1");

    const relayUrl = await sandbox.configureLlmRelay({
      apiKey: "provider-key",
      baseUrl: "https://provider.example/v1",
      controlToken: "server-token",
    });

    expect(relayUrl).toBe("http://agent-runner:6464/v1/sandboxes/agent-numo-1/llm");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      apiKey: "provider-key",
      baseUrl: "https://provider.example/v1",
      controlToken: "server-token",
    });
  });
});
