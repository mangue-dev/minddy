import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { withOpencodeInstallLock } from "@/lib/desktop/opencode-install-lock";
import { agentVmUrl } from "../network-policy";
import type { VmJob } from "./protocol";

export const GITHUB_CLI_VERSION = "2.102.0";
const CHECKSUMS = {
  amd64: "bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386",
  arm64: "7862c86c72f43df3a2d93ddde6f473285b4e2af61b494849846827e513ef6484",
};
const MAX_BYTES = 1_000_000;
const runFile = promisify(execFile);

export function githubCliAsset(arch: string) {
  const name = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : null;
  if (!name) throw new Error("GitHub CLI sandbox architecture is unsupported");
  return { name: `gh_${GITHUB_CLI_VERSION}_linux_${name}`, sha256: CHECKSUMS[name] };
}

/** Install the official, checksum-pinned Linux binary outside the repository. */
export async function installSandboxGithubCli(installRoot: string): Promise<string> {
  const asset = githubCliAsset(process.arch);
  const installDir = join(installRoot, `gh-${GITHUB_CLI_VERSION}`);
  const bin = join(installDir, "bin", "gh");
  await withOpencodeInstallLock(installDir, async () => {
    if (await access(bin).then(() => true, () => false)) return;
    await mkdir(installRoot, { recursive: true });
    const staging = await mkdtemp(join(installRoot, ".gh-install-"));
    try {
      const response = await fetch(`https://github.com/cli/cli/releases/download/v${GITHUB_CLI_VERSION}/${asset.name}.tar.gz`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok || !response.body) throw new Error("GitHub CLI download failed");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > 32_000_000) {
          await response.body.cancel().catch(() => {});
          throw new Error("GitHub CLI archive exceeds the download limit");
        }
        chunks.push(chunk);
      }
      const archive = Buffer.concat(chunks);
      if (createHash("sha256").update(archive).digest("hex") !== asset.sha256) throw new Error("GitHub CLI archive checksum mismatch");
      const archivePath = join(staging, "gh.tar.gz");
      await writeFile(archivePath, archive);
      await runFile("tar", ["-xzf", archivePath, "-C", staging, `${asset.name}/bin/gh`], { timeout: 30_000 });
      await mkdir(join(installDir, "bin"), { recursive: true });
      await rename(join(staging, asset.name, "bin", "gh"), bin);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  });
  return bin;
}

export interface SandboxGithubCli {
  env: Record<string, string>;
  close(): Promise<void>;
}

/** Run-specific relay: gh's Unix socket transport carries no forge credential. */
export async function startSandboxGithubCli(opts: {
  bin: string;
  repoFullName: string;
  request(body: Record<string, unknown>): Promise<unknown>;
}): Promise<SandboxGithubCli> {
  // Short paths also work when the run root exceeds the Unix socket path limit.
  const dir = await mkdtemp(join(tmpdir(), "minddy-gh-"));
  const socket = join(dir, "api.sock");
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== "api.github.com") {
        res.writeHead(403).end();
        return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const result = await opts.request({ path: req.url, method: req.method, accept: req.headers.accept, body: Buffer.concat(chunks).toString("utf8") }) as {
        status: number; headers: Record<string, string>; body: string;
      };
      res.writeHead(result.status, result.headers).end(result.body);
    } catch {
      res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ message: "GitHub CLI relay failed; check the run's repository access" }));
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socket, resolve);
    });
    await chmod(socket, 0o600);
    await writeFile(join(dir, "config.yml"), `http_unix_socket: ${JSON.stringify(socket)}\n`, { mode: 0o600 });
  } catch (error) {
    server.close();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    env: {
      PATH: `${dirname(opts.bin)}:${process.env.PATH ?? ""}`,
      GH_CONFIG_DIR: dir,
      GH_HOST: "github.com",
      GH_REPO: opts.repoFullName,
      GH_TOKEN: "minddy-placeholder",
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Never retry writes: a lost response must not duplicate a PR or comment. */
export async function prepareSandboxGithubCli(job: VmJob): Promise<SandboxGithubCli | null> {
  const request = async (body: Record<string, unknown>): Promise<unknown> => {
    const response = await fetch(agentVmUrl(job.appOrigin, "/github-cli"), {
      method: "POST",
      headers: { "content-type": "application/json", ...(job.controlToken ? { authorization: `Bearer ${job.controlToken}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("GitHub CLI authorization failed");
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_BYTES * 2) throw new Error("GitHub CLI relay response exceeds the limit");
    return JSON.parse(text);
  };
  const metadata = await request({}) as { supported: boolean; repoFullName: string };
  if (!metadata.supported) return null;
  const bin = await installSandboxGithubCli(job.layout.opencodeDir);
  return startSandboxGithubCli({ bin, repoFullName: metadata.repoFullName, request });
}
