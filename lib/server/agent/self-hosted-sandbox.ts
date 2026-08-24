import "server-only";

import type { AgentSandbox, AgentSandboxCommand, AgentSandboxCommandResult } from "./sandbox";

type RunnerResponse<T> = T & { error?: string };

function runnerConfig(): { url: string; secret: string } {
  const url = process.env.AGENT_RUNNER_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.AGENT_RUNNER_SECRET?.trim();
  if (!url || !secret) throw new Error("self-hosted agent runner is not configured");
  return { url, secret };
}

async function runnerRequest<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const { url, secret } = runnerConfig();
  const response = await fetch(`${url}${path}`, {
    method: init.method ?? "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${secret}`,
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    ...(init.signal ? { signal: init.signal } : {}),
  });
  const payload = await response.json().catch(() => ({})) as RunnerResponse<T>;
  if (!response.ok) throw new Error(payload.error || `agent runner returned ${response.status}`);
  return payload;
}

function sandboxPath(name: string, suffix = ""): string {
  return `/v1/sandboxes/${encodeURIComponent(name)}${suffix}`;
}

class SelfHostedCommand implements AgentSandboxCommand {
  constructor(
    readonly cmdId: string,
    readonly exitCode: number | null,
    private readonly out: string,
    private readonly err: string,
  ) {}

  async stdout(): Promise<string> { return this.out; }
  async stderr(): Promise<string> { return this.err; }

  async wait(opts?: { signal?: AbortSignal }): Promise<void> {
    while (true) {
      const result = await runnerRequest<{ running: boolean }>(
        `/v1/commands/${encodeURIComponent(this.cmdId)}`,
        { method: "GET", signal: opts?.signal },
      );
      if (!result.running) return;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 500);
        opts?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(opts.signal?.reason ?? new Error("aborted"));
        }, { once: true });
      });
    }
  }
}

export class SelfHostedSandbox implements AgentSandbox {
  constructor(readonly name: string) {}

  static async getOrCreate(name: string): Promise<{ sandbox: SelfHostedSandbox; created: boolean }> {
    const result = await runnerRequest<{ created: boolean }>(sandboxPath(name), { body: {} });
    return { sandbox: new SelfHostedSandbox(name), created: result.created };
  }

  static async get(name: string): Promise<SelfHostedSandbox | null> {
    const result = await runnerRequest<{ exists: boolean; running: boolean }>(sandboxPath(name), { method: "GET" });
    return result.exists && result.running ? new SelfHostedSandbox(name) : null;
  }

  async configureLlmRelay(input: {
    apiKey: string | null;
    baseUrl: string;
    controlToken: string;
  }): Promise<string> {
    await runnerRequest(sandboxPath(this.name, "/llm"), { body: input });
    const { url } = runnerConfig();
    return `${url}${sandboxPath(this.name, "/llm")}`;
  }

  async configureGitRelay(input: {
    authUrl: string;
    repoFullName: string;
    controlToken: string;
  }): Promise<string> {
    await runnerRequest(sandboxPath(this.name, "/git"), { body: input });
    const { url } = runnerConfig();
    const relay = new URL(`${url}${sandboxPath(this.name, `/git/${input.repoFullName}.git`)}`);
    relay.username = "minddy";
    relay.password = input.controlToken;
    return relay.toString();
  }

  async refreshGitRelay(authUrl: string): Promise<void> {
    await runnerRequest(sandboxPath(this.name, "/git"), { body: { authUrl } });
  }

  async runCommand(input: {
    cmd: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    env?: Record<string, string>;
    detached?: boolean;
  }): Promise<AgentSandboxCommandResult> {
    const result = await runnerRequest<{
      commandId: string;
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>(sandboxPath(this.name, "/commands"), {
      body: input,
      signal: input.signal,
    });
    return new SelfHostedCommand(result.commandId, result.exitCode, result.stdout, result.stderr);
  }

  async readFileToBuffer(input: { path: string }): Promise<Buffer | null> {
    const result = await runnerRequest<{ exists: boolean; content?: string }>(sandboxPath(this.name, "/files/read"), {
      body: input,
    });
    return result.exists && result.content ? Buffer.from(result.content, "base64") : result.exists ? Buffer.alloc(0) : null;
  }

  async writeFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    await runnerRequest(sandboxPath(this.name, "/files/write"), {
      body: { files: files.map((file) => ({ path: file.path, content: Buffer.from(file.content).toString("base64") })) },
    });
  }

  async mkDir(path: string): Promise<void> {
    await runnerRequest(sandboxPath(this.name, "/mkdir"), { body: { path } });
  }

  async stop(): Promise<void> {
    await runnerRequest(sandboxPath(this.name, "/stop"), { body: {} });
  }

  async updateNetworkPolicy(): Promise<void> {}

  async getCommand(commandId: string): Promise<AgentSandboxCommand | null> {
    const result = await runnerRequest<{ exists: boolean; running: boolean; exitCode: number | null }>(
      `/v1/commands/${encodeURIComponent(commandId)}`,
      { method: "GET" },
    );
    if (!result.exists) return null;
    return new SelfHostedCommand(commandId, result.exitCode, "", "");
  }
}
