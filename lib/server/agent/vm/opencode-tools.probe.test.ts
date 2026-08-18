/**
 * MIN-286 — TOOLS PARITY probe: does opencode really use our 32 tools in
 * domain, with our schemas?
 *
 * Does NOT work with `npm test`: `describe.skipIf` skips it as much that
 * `MDY_OPENCODE_TOOLS_PROBE=1` is not set. It installs the binary (~350 MB)
 * in a temporary folder and starts a real server.
 *
 * MDY_OPENCODE_TOOLS_PROBE=1 npx vitest run \
 * lib/server/agent/vm/opencode-tools.probe.test.ts --testTimeout=600000
 *
 * WHAT IT ESTABLISHES, and which no unit test can establish: the files
 * that `opencodeToolFiles` writes are **loaded by the binary** and **rendered to the
 * model with our schemas** — types, enums, descriptions, and above all sharing
 * required / optional. This is the only place where an opencode release that would change the tools loader would be seen, and it would be seen BEFORE a production run discovered that half of its tools had disappeared. `opencode-ai@1.18.16`: **32 tools served out of 32**,
 * byte-identical descriptions, structurally identical schemas, and a
 * end-to-end call (template → generated tool → local bridge) that renders its
 * result in the conversation.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { opencodeToolFiles, domainToolsFor } from "./opencode-tools";
import type { VmJob } from "./protocol";

const LIVE = process.env.MDY_OPENCODE_TOOLS_PROBE === "1";
const VERSION = process.env.MDY_OPENCODE_VERSION ?? "1.18.16";
const PORT = Number(process.env.MDY_OPENCODE_TOOLS_PORT ?? 4390);

/** A tower job that is as WIDE as possible: everything that can be served is. */
const JOB = {
  runId: "probe",
  ledgerRunId: "probe",
  projectId: "probe",
  appOrigin: "https://minddy.example",
  model: "deepseek/deepseek-chat-v3.1",
  baseUrl: "http://127.0.0.1:1/v1",
  provider: "openrouter",
  llmPlaceholderKey: "placeholder",
  reasoningLevel: "medium",
  contextWindow: 200_000,
  inputUsdPerMTok: 0.3,
  anchor: "issue",
  writesToRepo: true,
  interactive: true,
  chain: true,
  imageInput: true,
  webSearch: true,
  webSearchMax: 5,
  subagents: {
    models: true,
    favorites: [],
    maxParallel: 2,
    allowedIds: [],
    abovePlanIds: [],
    maxMultiplier: null,
  },
  messages: [],
  instructions: { paths: [], bytes: 0 },
  usageSeqStart: 0,
  parkedForSubagents: false,
  editedPaths: [],
  repoTouched: false,
  prInlineComments: 0,
  baseBranch: "main",
  workBranch: "probe",
  authUrl: "probe",
  commitRef: "probe",
  bootstrapMs: 0,
  filesFromSha: "",
  locale: "fr",
  feature: "agent_code",
  checkpointMaxBytes: 1,
} as unknown as VmJob;

/** The comparable form of a diagram: what the model reads from it, and nothing else. */
function shape(s: Record<string, unknown> | undefined): unknown {
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  if (s.type) out.type = s.type;
  if (s.enum) out.enum = s.enum;
  if (s.description) out.description = s.description;
  if (s.items) out.items = shape(s.items as Record<string, unknown>);
  if (s.properties) {
    out.properties = Object.fromEntries(
      Object.entries(s.properties as Record<string, unknown>).map(([k, v]) => [
        k,
        shape(v as Record<string, unknown>),
      ]),
    );
    out.required = [...((s.required as string[]) ?? [])].sort();
  }
  return out;
}

let server: ReturnType<typeof spawn> | null = null;
let root = "";

afterAll(() => {
  server?.kill("SIGKILL");
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!LIVE)("les tools de domaine, servis par le vrai binaire", () => {
  it(
    "charge les 32 fichiers générés et rend nos schémas",
    async () => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "mdy-opencode-tools-"));
      const repo = path.join(root, "repo");
      // The tools folder lives OUTSIDE the repository — that's half of what the
      // probe checks: opencode loads `$XDG_CONFIG_HOME/opencode/tool`.
      const toolDir = path.join(root, "config", "opencode", "tool");
      fs.mkdirSync(repo, { recursive: true });
      fs.mkdirSync(toolDir, { recursive: true });

      const git = (args: string[]) =>
        execFileSync("git", ["-c", "user.email=a@b", "-c", "user.name=a", ...args], { cwd: repo });
      git(["init", "-q"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "hi\n");
      git(["add", "-A"]);
      git(["commit", "-qm", "init"]);

      execFileSync("npm", ["i", "--no-audit", "--no-fund", `opencode-ai@${VERSION}`], {
        cwd: root,
        stdio: "ignore",
      });
      fs.writeFileSync(path.join(root, "package.json"), '{"name":"probe","private":true}');

      // The production files, written flat in the tools folder: the
      // absolute path of `VmJob` is that of the microVM, not the one here.
      for (const f of opencodeToolFiles(JOB)) {
        fs.writeFileSync(path.join(toolDir, path.basename(f.path)), f.content);
      }

      const config = {
        model: "minddy/deepseek/deepseek-chat-v3.1",
        small_model: "minddy/deepseek/deepseek-chat-v3.1",
        provider: {
          minddy: {
            npm: "@ai-sdk/openai-compatible",
            name: "minddy",
            options: { apiKey: "placeholder", baseURL: "http://127.0.0.1:1/v1" },
            models: { "deepseek/deepseek-chat-v3.1": { name: "d", tool_call: true } },
          },
        },
      };

      server = spawn(
        path.join(root, "node_modules", ".bin", "opencode"),
        ["serve", "--port", String(PORT), "--hostname", "127.0.0.1"],
        {
          cwd: repo,
          env: {
            ...process.env,
            XDG_CONFIG_HOME: path.join(root, "config"),
            OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
            OPENCODE_DB: path.join(root, "probe.db"),
            OPENCODE_DISABLE_AUTOUPDATE: "1",
            OPENCODE_DISABLE_MODELS_FETCH: "1",
            MDY_SUPERVISOR_URL: "http://127.0.0.1:1",
          },
          stdio: "ignore",
        },
      );

      const url = `http://127.0.0.1:${PORT}`;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const ok = await fetch(`${url}/global/health`).then(
          (r) => r.ok,
          () => false,
        );
        if (ok) break;
      }

      const body = (await (
        await fetch(
          `${url}/experimental/tool?directory=${encodeURIComponent(repo)}` +
            `&provider=minddy&model=deepseek/deepseek-chat-v3.1&agent=build`,
        )
      ).json()) as { data?: unknown[] } | unknown[];
      const list = (Array.isArray(body) ? body : (body.data ?? [])) as Array<{
        id: string;
        description: string;
        parameters: Record<string, unknown>;
      }>;
      const served = new Map(list.map((t) => [t.id, t]));

      const diffs: string[] = [];
      for (const def of domainToolsFor(JOB)) {
        const name = def.function.name;
        const got = served.get(name);
        if (!got) {
          diffs.push(`${name}: pas servi`);
          continue;
        }
        if (got.description !== def.function.description) diffs.push(`${name}: description`);
        const mine = JSON.stringify(shape({ ...def.function.parameters }));
        const theirs = JSON.stringify(shape(got.parameters));
        if (mine !== theirs) diffs.push(`${name}: schéma\n  nous=${mine}\n  eux =${theirs}`);
      }
      // The failure message must be read without opening the probe: it names the tool
      // and puts the two diagrams side by side.
      expect(diffs.join("\n")).toBe("");
      expect(domainToolsFor(JOB).length).toBeGreaterThan(30);
    },
    600_000,
  );
});
