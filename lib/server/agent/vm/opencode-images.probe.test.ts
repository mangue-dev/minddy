/**
 * MIN-286 — IMAGES probe: a model rendered by a domain tool
 * does it reach the eyes of the model?
 *
 * Does NOT run with `npm test`: `describe.skipIf` skips it as much that
 * `MDY_OPENCODE_IMAGE_PROBE=1` is not set. She spends a real round on a
 * real vision model (~$0.001) and needs `OPENROUTER_API_KEY`.
 *
 * MDY_OPENCODE_IMAGE_PROBE=1 MDY_OPENCODE_BIN=/path/to/opencode \
 * npx vitest run lib/server/agent/vm/opencode-images.probe.test.ts --testTimeout=600000
 *
 * WHAT IT ESTABLISHES, and which no unit test can establish: the model
 * DESCRIBES an image that it has no way of guessing — four quadrants of
 * colors, in order. All the path there is real: the tool file that
 * `renderOpencodeTool` generates, the bridge envelope, the config that
 * `buildOpencodeConfig` produces, the binary, the model.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * WHAT THE FIRST VERSION LEARNED, 2026-08-12 (file §2.22)
 *
 * `attachment: true` alone is NOT enough. The image goes through the entire harness, then
 * opencode replaces it at the last moment with “ERROR: Cannot read "quad.png"
 * (this model does not support image input). Inform the user. » — the model
 * therefore responded NO_IMAGE, and would have warned the user of a limit which
 * does not exist. What the binary tests for is `capabilities.input.image`, which is
 * declared by `modalities.input`. It is THIS fault that the probe keeps closed:
 * it is only visible here, a type-check and a unit test let it pass.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";

import { buildOpencodeConfig } from "./opencode-config";
import { opencodeToolFiles, SUPERVISOR_URL_ENV, TOOL_ATTACHMENTS_HEADER } from "./opencode-tools";
import type { VmJob } from "./protocol";

const LIVE = process.env.MDY_OPENCODE_IMAGE_PROBE === "1";
const VERSION = process.env.MDY_OPENCODE_VERSION ?? "1.18.16";
const PORT = Number(process.env.MDY_OPENCODE_IMAGE_PORT ?? 4391);
const BRIDGE_PORT = Number(process.env.MDY_OPENCODE_IMAGE_BRIDGE_PORT ?? 4392);
/** A model that SEES. The rest of the probe does not depend on which. */
const MODEL = process.env.MDY_OPENCODE_IMAGE_MODEL ?? "anthropic/claude-haiku-4.5";

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
 * A 64×64 PNG in four quadrants — red, green, blue, yellow. Written by hand
 * (IHDR/IDAT/IEND) rather than provided as a fixture: what matters is that the
 * model cannot guess it, and an image generated here could not have slipped into
 * a training corpus under its filename.
 */
function quadrantPng(): Buffer {
  const size = 64;
  const half = size / 2;
  const rows: number[] = [];
  for (let y = 0; y < size; y++) {
    rows.push(0); // `none` filter
    for (let x = 0; x < size; x++) {
      const rgb =
        y < half ? (x < half ? [255, 0, 0] : [0, 255, 0]) : x < half ? [0, 0, 255] : [255, 255, 0];
      rows.push(...rgb);
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.from(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const JOB = {
  runId: "probe",
  ledgerRunId: "probe",
  projectId: "probe",
  appOrigin: "https://minddy.example",
  engine: "opencode",
  model: MODEL,
  baseUrl: "https://openrouter.ai/api/v1",
  provider: "openrouter",
  llmPlaceholderKey: "placeholder",
  reasoningLevel: "off",
  contextWindow: 200_000,
  inputUsdPerMTok: 1,
  pricing: { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
  anchor: "issue",
  writesToRepo: false,
  interactive: false,
  chain: false,
  // THE PROBE FLAG: this is what sets `modalities.input`.
  imageInput: true,
  webSearch: false,
  webSearchMax: 5,
  subagents: {
    models: false,
    favorites: [],
    maxParallel: 1,
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
  authUrl: "",
  commitRef: "PROBE",
  bootstrapMs: 0,
} as unknown as VmJob;

let server: ReturnType<typeof spawn> | null = null;
let bridge: import("node:http").Server | null = null;
let root = "";

afterAll(() => {
  server?.kill("SIGKILL");
  bridge?.close();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!LIVE)("une maquette rendue par un tool de domaine", () => {
  it(
    "arrive jusqu'aux yeux du modèle, qui en nomme les quatre quadrants",
    async () => {
      loadEnv();
      const key = process.env.OPENROUTER_API_KEY;
      expect(key, "OPENROUTER_API_KEY").toBeTruthy();

      root = fs.mkdtempSync(path.join(os.tmpdir(), "mdy-opencode-img-"));
      const repo = path.join(root, "repo");
      const toolDir = path.join(root, "config", "opencode", "tool");
      fs.mkdirSync(repo, { recursive: true });
      fs.mkdirSync(toolDir, { recursive: true });
      const git = (args: string[]) =>
        execFileSync("git", ["-c", "user.email=a@b", "-c", "user.name=a", ...args], { cwd: repo });
      git(["init", "-q"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "hi\n");
      git(["add", "-A"]);
      git(["commit", "-qm", "init"]);

      // The binary: reusable by `MDY_OPENCODE_BIN`, otherwise installed here.
      let bin = process.env.MDY_OPENCODE_BIN ?? "";
      if (!bin) {
        execFileSync("npm", ["i", "--no-audit", "--no-fund", `opencode-ai@${VERSION}`], {
          cwd: root,
          stdio: "ignore",
        });
        bin = path.join(root, "node_modules", ".bin", "opencode");
      }

      // ── The BRIDGE, in its production form: the envelope and its header ──
      const dataUrl = `data:image/png;base64,${quadrantPng().toString("base64")}`;
      const http = await import("node:http");
      bridge = http.createServer((req, res) => {
        res.writeHead(200, {
          "content-type": "application/json",
          [TOOL_ATTACHMENTS_HEADER]: "1",
        });
        res.end(
          JSON.stringify({
            output: JSON.stringify({ name: "quad.png", mime: "image/png", bytes: 166 }),
            attachments: [
              { type: "file", mime: "image/png", url: dataUrl, filename: "quad.png" },
            ],
          }),
        );
      });
      await new Promise<void>((r) => bridge!.listen(BRIDGE_PORT, "127.0.0.1", () => r()));

      // ── The tools files and the config, both from PRODUCTION ────────
      for (const f of opencodeToolFiles(JOB)) {
        fs.writeFileSync(path.join(toolDir, path.basename(f.path)), f.content);
      }
      const config = buildOpencodeConfig(JOB) as unknown as Record<string, unknown>;
      // The only touch-up: the real key, which production places on the firewall.
      const provider = (config.provider as Record<string, { options: Record<string, string> }>)
        .minddy;
      provider.options.apiKey = key!;

      server = spawn(bin, ["serve", "--port", String(PORT), "--hostname", "127.0.0.1"], {
        cwd: repo,
        env: {
          ...process.env,
          XDG_CONFIG_HOME: path.join(root, "config"),
          OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
          OPENCODE_DB: path.join(root, "probe.db"),
          OPENCODE_DISABLE_AUTOUPDATE: "1",
          [SUPERVISOR_URL_ENV]: `http://127.0.0.1:${BRIDGE_PORT}`,
        },
        stdio: "ignore",
      });

      const url = `http://127.0.0.1:${PORT}`;
      const q = (p: string) =>
        `${url}${p}${p.includes("?") ? "&" : "?"}directory=${encodeURIComponent(repo)}`;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const ok = await fetch(`${url}/global/health`).then(
          (r) => r.ok,
          () => false,
        );
        if (ok) break;
      }

      const session = (await (
        await fetch(q("/session"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "image probe" }),
        })
      ).json()) as { id: string };

      const reply = (await (
        await fetch(q(`/session/${session.id}/message`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            parts: [
              {
                type: "text",
                text:
                  "Call read_resource with resource_id 'r1'. It returns a 64x64 image. " +
                  "Then answer in this exact format and nothing else: " +
                  "TOP-LEFT=?, TOP-RIGHT=?, BOTTOM-LEFT=?, BOTTOM-RIGHT=?. " +
                  "If you cannot see the image, answer exactly NO_IMAGE.",
              },
            ],
          }),
        })
      ).json()) as { parts?: Array<{ type: string; text?: string }> };

      const said = (reply.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("\n")
        .toLowerCase();

      // Four colors in order: nothing other than the image view can tell them
      // given. The failure message carries the answer, because "NO_IMAGE" and
      // “inverted red/green” are not diagnosed in the same way.
      expect(said, said).toContain("top-left=red");
      expect(said, said).toContain("top-right=green");
      expect(said, said).toContain("bottom-left=blue");
      expect(said, said).toContain("bottom-right=yellow");
    },
    600_000,
  );
});
