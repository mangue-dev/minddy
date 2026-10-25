import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import packageJson from "@/package.json";
import {
  MANAGED_PNPM_VERSION,
  MANAGED_SUPABASE_CLI_VERSION,
  dockerDesktopUrl,
  downloadPercent,
  linuxPrivilegedScript,
  minGitAsset,
  nodeArchiveFromShasums,
  signedByDocker,
  toolchainPathEntries,
  toolchainPlan,
} from "./local-toolchain";
import type { LocalPrerequisiteResult } from "./local-installer";

const ready = (id: LocalPrerequisiteResult["id"]): LocalPrerequisiteResult => ({ id, state: "ready" });

describe("toolchain plan", () => {
  it("installs nothing when every tool is ready", () => {
    expect(toolchainPlan(["git", "node", "pnpm", "supabase", "docker"].map((id) => ready(id as never)))).toEqual([]);
  });

  it("installs what is missing or too old, in dependency order, and only starts a stopped Docker", () => {
    expect(
      toolchainPlan([
        { id: "docker", state: "stopped" },
        { id: "supabase", state: "missing" },
        { id: "node", state: "outdated", version: "22.12.0" },
        ready("pnpm"),
        ready("git"),
      ]),
    ).toEqual(["node", "supabase", "docker-start"]);
    expect(toolchainPlan([])).toEqual(["git", "node", "pnpm", "supabase", "docker"]);
  });
});

describe("managed tool sources", () => {
  it("pins the same pnpm and Supabase CLI as the repository and its release workflow", () => {
    expect(packageJson.packageManager).toBe(`pnpm@${MANAGED_PNPM_VERSION}`);
    const workflow = readFileSync(".github/workflows/promote-production.yml", "utf8");
    expect(workflow).toContain(`SUPABASE_CLI_VERSION: "${MANAGED_SUPABASE_CLI_VERSION}"`);
  });

  it("picks the Node.js 24 archive of this computer with its checksum", () => {
    const sha = "a".repeat(64);
    const shasums = [
      `${"b".repeat(64)}  node-v24.22.1-darwin-arm64.tar.xz`,
      `${sha}  node-v24.22.1-darwin-arm64.tar.gz`,
      `${"c".repeat(64)}  node-v24.22.1-win-x64.zip`,
    ].join("\n");
    expect(nodeArchiveFromShasums(shasums, "darwin", "arm64")).toEqual({
      file: "node-v24.22.1-darwin-arm64.tar.gz",
      version: "24.22.1",
      sha256: sha,
    });
    expect(nodeArchiveFromShasums(shasums, "win32", "x64")?.file).toBe("node-v24.22.1-win-x64.zip");
    expect(nodeArchiveFromShasums(shasums, "linux", "x64")).toBeNull();
  });

  it("takes MinGit only with a GitHub URL and a SHA-256 digest", () => {
    const digest = "d".repeat(64);
    const release = {
      assets: [
        { name: "MinGit-2.51.0-busybox-64-bit.zip", digest: `sha256:${digest}`, browser_download_url: "https://github.com/a" },
        { name: "MinGit-2.51.0-64-bit.zip", digest: `sha256:${digest}`, browser_download_url: "https://github.com/git-for-windows/git/releases/download/x/MinGit-2.51.0-64-bit.zip" },
        { name: "MinGit-2.51.0-arm64.zip", browser_download_url: "https://github.com/b" },
      ],
    };
    expect(minGitAsset(release, "x64")).toEqual({
      url: "https://github.com/git-for-windows/git/releases/download/x/MinGit-2.51.0-64-bit.zip",
      sha256: digest,
    });
    expect(minGitAsset(release, "arm64")).toBeNull();
    expect(minGitAsset({ assets: "nope" }, "x64")).toBeNull();
  });

  it("downloads Docker Desktop for macOS and Windows only, and trusts Docker's signing team", () => {
    expect(dockerDesktopUrl("darwin", "arm64")).toBe("https://desktop.docker.com/mac/main/arm64/Docker.dmg");
    expect(dockerDesktopUrl("win32", "x64")).toBe("https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe");
    expect(dockerDesktopUrl("linux", "x64")).toBeNull();
    expect(signedByDocker("Identifier=com.docker.docker\nTeamIdentifier=9BNSXJN65R\n")).toBe(true);
    expect(signedByDocker("TeamIdentifier=ABCDE12345\nComment=9BNSXJN65R")).toBe(false);
  });
});

describe("toolchain on this computer", () => {
  it("puts managed tools and Docker Desktop's CLI on PATH", () => {
    expect(toolchainPathEntries("darwin", "/Users/c/Library/Application Support/minddy/toolchain", "/Users/c")).toEqual([
      "/Users/c/Library/Application Support/minddy/toolchain/node/bin",
      "/Users/c/Library/Application Support/minddy/toolchain/pnpm/bin",
      "/Users/c/Library/Application Support/minddy/toolchain/supabase/node_modules/.bin",
      "/Applications/Docker.app/Contents/Resources/bin",
      "/Users/c/.docker/bin",
    ]);
    expect(toolchainPathEntries("win32", "C:\\Users\\c\\AppData\\Roaming\\minddy\\toolchain", "C:\\Users\\c")).toContain(
      "C:\\Users\\c\\AppData\\Roaming\\minddy\\toolchain\\git\\cmd",
    );
  });

  it("asks once for root on Linux, quoting the person's names", () => {
    const script = linuxPrivilegedScript({
      git: true,
      docker: true,
      startDocker: false,
      user: "o'neil",
      dockerScript: "/tmp/minddy install/get-docker.sh",
    });
    expect(script).toContain("apt-get install -y git");
    expect(script).toContain(`sh '/tmp/minddy install/get-docker.sh'`);
    expect(script).toContain("systemctl enable --now docker");
    expect(script).toContain(`usermod -aG docker 'o'"'"'neil'`);
    expect(linuxPrivilegedScript({ git: false, docker: false, startDocker: true, user: "c", dockerScript: "" })).toBe(
      "set -e\nsystemctl enable --now docker\n",
    );
  });

  it("reports download progress only with a known size", () => {
    expect(downloadPercent(50, 200)).toBe(25);
    expect(downloadPercent(300, 200)).toBe(100);
    expect(downloadPercent(50, null)).toBeNull();
  });
});
