import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { githubCliAsset, installSandboxGithubCli, prepareSandboxGithubCli, startSandboxGithubCli } from "./github-cli";
import type { VmJob } from "./protocol";

afterEach(() => vi.unstubAllGlobals());

describe("GitHub CLI sandbox runtime", () => {
  it("rejects an unverified release archive and cleans up staging", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gh-test-"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("tampered archive")));
    try {
      await expect(installSandboxGithubCli(dir)).rejects.toThrow("checksum mismatch");
      expect((await readdir(dir)).filter((name) => name.startsWith(".gh-install-"))).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
    expect(() => githubCliAsset("ia32")).toThrow("architecture is unsupported");
  });

  it("relays through a private socket, stores only configuration, and cleans up", async () => {
    const relayRequest = vi.fn(async () => ({ status: 201, headers: { "content-type": "application/json" }, body: '{"number":42}' }));
    const cli = await startSandboxGithubCli({ bin: "/runtime/bin/gh", repoFullName: "acme/app", request: relayRequest });
    const config = await readFile(join(cli.env.GH_CONFIG_DIR, "config.yml"), "utf8");
    const socketPath = JSON.parse(config.split(": ")[1]);
    try {
      const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request({ socketPath, path: "/repos/acme/app/pulls", method: "POST", headers: { host: "api.github.com" } }, (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => resolve({ status: res.statusCode!, body }));
        });
        req.on("error", reject);
        req.end('{"title":"Update"}');
      });
      expect(result).toEqual({ status: 201, body: '{"number":42}' });
      expect(relayRequest).toHaveBeenCalledWith(expect.objectContaining({ path: "/repos/acme/app/pulls", method: "POST", body: '{"title":"Update"}' }));
      expect(cli.env.PATH.startsWith("/runtime/bin:")).toBe(true);
      expect(cli.env.GH_TOKEN).toBe("minddy-placeholder");
      expect(config).not.toContain("token");
    } finally { await cli.close(); }
    await expect(readFile(join(cli.env.GH_CONFIG_DIR, "config.yml"))).rejects.toThrow();
  });

  it("does not retry a failed control-plane request", async () => {
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(prepareSandboxGithubCli({ appOrigin: "https://app.test", controlToken: "server-lease" } as VmJob)).rejects.toThrow("authorization failed");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("https://app.test/api/agent-vm/github-cli", expect.objectContaining({ headers: { "content-type": "application/json", authorization: "Bearer server-lease" } }));
  });

  // Opt in with an official gh executable to verify its real Unix socket transport.
  it.skipIf(!process.env.MINDDY_GH_TEST_BINARY)("creates a PR with the official CLI over the authenticated relay", async () => {
    const queries: string[] = [];
    const cli = await startSandboxGithubCli({ bin: process.env.MINDDY_GH_TEST_BINARY!, repoFullName: "acme/app", request: async (input) => {
      const query = JSON.parse(String(input.body)).query as string;
      queries.push(query);
      const data = query.includes("createPullRequest")
        ? { createPullRequest: { pullRequest: { id: "PR_42", url: "https://github.com/acme/app/pull/42" } } }
        : { repository: { id: "R_1", name: "app", owner: { login: "acme" }, isPrivate: true, viewerPermission: "WRITE", defaultBranchRef: { name: "main" }, pullRequests: { nodes: [] } } };
      return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) };
    } });
    try {
      const result = await promisify(execFile)(process.env.MINDDY_GH_TEST_BINARY!, ["pr", "create", "--head", "numo/agent-test", "--base", "main", "--title", "Agent update", "--body", "Reviewable changes"], { env: { ...process.env, ...cli.env }, timeout: 10_000 });
      expect(result.stdout.trim()).toBe("https://github.com/acme/app/pull/42");
      expect(queries.some((query) => query.includes("createPullRequest"))).toBe(true);
    } finally { await cli.close(); }
  });

  it.skipIf(!process.env.MINDDY_GH_TEST_BINARY)("runs the official gh CLI without a GitHub token in its environment", async () => {
    const relayRequest = vi.fn(async () => ({ status: 200, headers: { "content-type": "application/json" }, body: '{"number":42}' }));
    const cli = await startSandboxGithubCli({ bin: process.env.MINDDY_GH_TEST_BINARY!, repoFullName: "acme/app", request: relayRequest });
    try {
      const result = await promisify(execFile)(process.env.MINDDY_GH_TEST_BINARY!, ["api", "repos/acme/app/pulls/42", "--jq", ".number"], { env: { ...process.env, ...cli.env }, timeout: 10_000 });
      expect(result.stdout.trim()).toBe("42");
      expect(relayRequest).toHaveBeenCalledOnce();
    } finally { await cli.close(); }
  });
});
