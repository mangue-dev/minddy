/**
 * MIN-286 — sonde des IMAGES : une maquette rendue par un tool de domaine
 * arrive-t-elle jusqu'aux yeux du modèle ?
 *
 * Ne tourne PAS avec `npm test` : `describe.skipIf` la saute tant que
 * `MDY_OPENCODE_IMAGE_PROBE=1` n'est pas posé. Elle dépense un vrai round sur un
 * vrai modèle de vision (~0,001 $) et a besoin d'`OPENROUTER_API_KEY`.
 *
 *   MDY_OPENCODE_IMAGE_PROBE=1 MDY_OPENCODE_BIN=/chemin/vers/opencode \
 *   npx vitest run lib/server/agent/vm/opencode-images.probe.test.ts --testTimeout=600000
 *
 * CE QU'ELLE ÉTABLIT, et qu'aucun test unitaire ne peut établir : le modèle
 * DÉCRIT une image qu'il n'a aucun moyen de deviner — quatre quadrants de
 * couleurs, dans l'ordre. Tout le chemin y est réel : le fichier de tool que
 * `renderOpencodeTool` génère, l'enveloppe du pont, la config que
 * `buildOpencodeConfig` produit, le binaire, le modèle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA PREMIÈRE VERSION A APPRIS, le 2026-08-12 (dossier §2.22)
 *
 * `attachment: true` seul ne suffit PAS. L'image traverse tout le harness, puis
 * opencode la remplace au dernier moment par « ERROR: Cannot read "quad.png"
 * (this model does not support image input). Inform the user. » — le modèle
 * répondait donc NO_IMAGE, et aurait prévenu l'utilisateur d'une limite qui
 * n'existe pas. Ce que le binaire teste, c'est `capabilities.input.image`, qui se
 * déclare par `modalities.input`. C'est CE défaut-là que la sonde garde fermé :
 * il ne se voit qu'ici, un type-check et un test unitaire le laissent passer.
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
/** Un modèle qui VOIT. Le reste de la sonde ne dépend pas duquel. */
const MODEL = process.env.MDY_OPENCODE_IMAGE_MODEL ?? "anthropic/claude-haiku-4.5";

/** Les creds vivent dans `.env` ; vitest ne le charge pas tout seul. */
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
 * Une PNG 64×64 en quatre quadrants — rouge, vert, bleu, jaune. Écrite à la main
 * (IHDR/IDAT/IEND) plutôt que posée en fixture : ce qui compte est que le modèle
 * ne puisse pas la deviner, et une image générée ici ne peut pas s'être glissée
 * dans un corpus d'entraînement sous son nom de fichier.
 */
function quadrantPng(): Buffer {
  const size = 64;
  const half = size / 2;
  const rows: number[] = [];
  for (let y = 0; y < size; y++) {
    rows.push(0); // filtre `none`
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
  // LE DRAPEAU DE LA SONDE : c'est lui qui pose `modalities.input`.
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

      // Le binaire : réutilisable par `MDY_OPENCODE_BIN`, sinon installé ici.
      let bin = process.env.MDY_OPENCODE_BIN ?? "";
      if (!bin) {
        execFileSync("npm", ["i", "--no-audit", "--no-fund", `opencode-ai@${VERSION}`], {
          cwd: root,
          stdio: "ignore",
        });
        bin = path.join(root, "node_modules", ".bin", "opencode");
      }

      // ── Le PONT, dans sa forme de production : l'enveloppe et son en-tête ──
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

      // ── Les fichiers de tools et la config, tous deux de PRODUCTION ────────
      for (const f of opencodeToolFiles(JOB)) {
        fs.writeFileSync(path.join(toolDir, path.basename(f.path)), f.content);
      }
      const config = buildOpencodeConfig(JOB) as unknown as Record<string, unknown>;
      // La seule retouche : la vraie clé, que la production pose au firewall.
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

      // Quatre couleurs dans l'ordre : rien d'autre que la vue de l'image ne les
      // donne. Le message d'échec porte la réponse, parce que « NO_IMAGE » et
      // « rouge/vert inversés » ne se diagnostiquent pas de la même façon.
      expect(said, said).toContain("top-left=red");
      expect(said, said).toContain("top-right=green");
      expect(said, said).toContain("bottom-left=blue");
      expect(said, said).toContain("bottom-right=yellow");
    },
    600_000,
  );
});
