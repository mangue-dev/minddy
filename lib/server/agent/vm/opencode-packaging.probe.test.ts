/**
 * MIN-286 — PACKAGING probe: does opencode start in the microVM, and in
 * how long?
 *
 * Does NOT run with `npm test`: `describe.skipIf` skips it so much that
 * `MDY_OPENCODE_PACKAGING_PROBE=1` is not set. It creates a real microVM
 * Vercel Sandbox (billed by the minute) and downloads ~144 MB of binary into it — a
 * suite that would play it on each commit would be paid and red at random.
 *
 * MDY_OPENCODE_PACKAGING_PROBE=1 \
 * MDY_OPENCODE_PROBE_OUT=/tmp/packaging.json \
 * npx vitest run lib/server/agent/vm/opencode-packaging.probe.test.ts --testTimeout=1200000
 *
 * What it does establishes, and that no reading can say:
 * 1. the native binary installs and starts in the `node24` runtime — the same
 * as the agent code (`SANDBOX_RUNTIME`, repo-host.ts);
 * 2. how much does this startup cost, compared to `bootstrapMs` of today;
 * 3. what happens HOT, a resumed microVM already having its `node_modules` ;
 * 4. if the server starts without fetching the online model catalog
 * (`OPENCODE_DISABLE_MODELS_FETCH`), which decides to the dependency of a run
 * on models.dev.
 *
 * TRAP, and it costs two tries: an attached `runCommand` whose output does not arrive
 * dies around 75 s on `UND_ERR_SOCKET: other side closed`, and the installation en
 * lasts longer. Hence the form: **a single script launched in `detached`**, which writes its
 * report in a file, and a poll by short commands up to the end marker
 *. The report goes through a file because the vites reporter swallows
 * the `console.log`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LIVE = process.env.MDY_OPENCODE_PACKAGING_PROBE === "1";
const OPENCODE_VERSION = process.env.MDY_OPENCODE_VERSION ?? "1.18.16";
const PORT = 4399;
const DONE = "__PROBE_DONE__";

/** Creds live in `.env`; vitest does not load it on its own. */
function loadEnv(): void {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/**
 * A measured startup. **Nothing is detached**, and this is the heart of the
 * recipe: a `nohup … &` inside a Sandbox `sh -c` makes the RPC command fail
 * (measured three times, `UND_ERR_SOCKET` after ~25 s, without an output line),
 * while the same server starts perfectly in the foreground. So we read the
 * “listening” line from the pipe, time it there, query it, and let `timeout`
 * return control — all within the 75 s after which the RPC socket closes.
 */
function bootScript(label: string, extraEnv: string): string {
  return [
    `START=$(date +%s%3N)`,
    `OPENCODE_DISABLE_AUTOUPDATE=1 ${extraEnv} OPENCODE_DB=/vercel/oc/${label}.db ` +
      `timeout 45 /vercel/oc/node_modules/.bin/opencode serve --port ${PORT} --hostname 127.0.0.1 2>&1 | ` +
      `while IFS= read -r line; do`,
    `  case "$line" in *listening*)`,
    `    echo "${label}_boot_ms=$(( $(date +%s%3N) - START ))"`,
    `    echo "${label}_health=$(curl -sf http://127.0.0.1:${PORT}/global/health)"`,
    `    echo "${label}_tools=$(curl -sf 'http://127.0.0.1:${PORT}/experimental/tool/ids?directory=/vercel/oc/repo')"`,
    `    break;;`,
    `  esac`,
    `  echo "${label}_out=$line"`,
    `done`,
  ].join("\n");
}

describe.skipIf(!LIVE)("opencode dans la microVM", () => {
  it(
    "s'installe, démarre et répond, à froid puis à chaud",
    async () => {
      loadEnv();
      const { Sandbox } = await import("@vercel/sandbox");

      const sandbox = await Sandbox.create({
        token: process.env.VERCEL_TOKEN!,
        teamId: process.env.VERCEL_TEAM_ID!,
        projectId: process.env.VERCEL_PROJECT_ID!,
        runtime: "node24",
        timeout: 20 * 60_000,
      });

      const sh = async (script: string) => {
        const res = await sandbox.runCommand({ cmd: "sh", args: ["-c", script] });
        return { exitCode: res.exitCode, stdout: await res.stdout() };
      };

      const report: string[] = [];
      try {
        // ── 1. the installation, in the background: it exceeds one minute ─────────────
        const install = [
          `mkdir -p /vercel/oc/repo && cd /vercel/oc`,
          `S=$(date +%s%3N)`,
          `npm i --no-audit --no-fund opencode-ai@${OPENCODE_VERSION} >/vercel/oc/install.log 2>&1`,
          `echo "install_code=$?"`,
          `echo "install_ms=$(( $(date +%s%3N) - S ))"`,
          `echo "size_mb=$(du -sm /vercel/oc/node_modules | cut -f1)"`,
          `echo "version=$(/vercel/oc/node_modules/.bin/opencode --version 2>&1)"`,
          `echo "has_curl=$(command -v curl || echo NON)"`,
          `echo "has_git=$(command -v git || echo NON)"`,
          `echo ${DONE}`,
        ].join("\n");
        await sandbox.runCommand({
          cmd: "sh",
          args: ["-c", `{\n${install}\n} > /tmp/probe.out 2>&1`],
          detached: true,
        });
        let out = "";
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 5_000));
          out = (await sh(`cat /tmp/probe.out 2>/dev/null || true`)).stdout;
          if (out.includes(DONE)) break;
        }
        report.push(out);
        expect(out).toContain("install_code=0");

        // ── 2. probe deposit, then start-ups ───────────────────────
        // ATTACHED: everyone renders in a few seconds, and an error is SEEN —
        // this is what the all-in-the-back version was hiding.
        const prep = await sh(
          `cd /vercel/oc/repo && git init -q 2>&1; echo hi > a.txt; ` +
            `git -c user.email=a@b -c user.name=a add -A 2>&1; ` +
            `git -c user.email=a@b -c user.name=a commit -qm init 2>&1; echo prep_ok`,
        );
        report.push(prep.stdout);

        for (const [label, bootEnv] of [
          ["cold", ""],
          ["warm", ""],
          [
            "offline",
            "OPENCODE_DISABLE_MODELS_FETCH=1 OPENCODE_DISABLE_LSP_DOWNLOAD=1 OPENCODE_DISABLE_EMBEDDED_WEB_UI=1",
          ],
        ] as const) {
          const res = await sh(`cd /vercel/oc/repo\n${bootScript(label, bootEnv)}`);
          report.push(res.stdout);
        }

        out = report.join("\n");
        expect(out).toContain('"healthy":true');
        expect(out).toContain('"bash"');

        const outFile = process.env.MDY_OPENCODE_PROBE_OUT;
        if (outFile) fs.writeFileSync(outFile, out);
      } finally {
        const outFile = process.env.MDY_OPENCODE_PROBE_OUT;
        // The report is written EVEN on failure: on a probe, what we measured
        // before falling is often worth more than the assertion that falls.
        if (outFile && report.length) fs.writeFileSync(outFile, report.join("\n"));
        await sandbox.stop().catch(() => {});
      }
    },
    1_200_000,
  );
});
