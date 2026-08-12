/**
 * MIN-286 — sonde du ROUND COUPÉ EN VOL : qui facture quoi quand on abort ?
 *
 * Ne tourne PAS avec `npm test` : `describe.skipIf` la saute tant que
 * `MDY_OPENCODE_ABORT_PROBE=1` n'est pas posé. Elle dépense un vrai round sur un
 * vrai modèle (~0,003 $) et a besoin d'`OPENROUTER_API_KEY`.
 *
 *   MDY_OPENCODE_ABORT_PROBE=1 MDY_OPENCODE_BIN=/chemin/vers/opencode \
 *   npx vitest run lib/server/agent/vm/opencode-abort.probe.test.ts --testTimeout=600000
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE A ÉTABLI le 2026-08-12, et qui décide du code de `recordOrphans`
 *
 * 1. **Opencode ne facture RIEN d'un round avorté.** Le message assistant reste
 *    à `finish: null`, `cost: 0`, `tokens: {input: 0, output: 0}`, avec
 *    `error: MessageAbortedError` — et pourtant 179 caractères avaient déjà été
 *    écrits. Notre traducteur exige un `finish` pour écrire au ledger (à raison :
 *    sans lui il écrirait une ligne vide puis une vraie). La dépense sortait donc
 *    des compteurs sur un geste déclenchable à volonté.
 * 2. **Le proxy, lui, voit tout.** Il ne passe pas de signal à son `fetch` amont :
 *    quand opencode s'en va, la boucle de lecture continue jusqu'à la dernière
 *    frame — **1 221 ms plus tard**, sans une erreur de socket — et cette frame
 *    porte `usage` avec le coût facturé (relevé : `cost: 0.002827`, 2 032 tokens
 *    de prompt, 159 de complétion) et le `generation_id`.
 *
 * D'où la forme du correctif : `proxy.settle()` puis `proxy.drain()` en fin de
 * tour, et une ligne de ledger au montant du FOURNISSEUR — pas une estimation.
 * C'est le défaut que MIN-216 avait fermé côté boucle maison, rouvert par le
 * changement de moteur et refermé ici.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { startLlmProxy, type LlmProxy } from "./llm-proxy";

const LIVE = process.env.MDY_OPENCODE_ABORT_PROBE === "1";
const VERSION = process.env.MDY_OPENCODE_VERSION ?? "1.18.16";
const PORT = Number(process.env.MDY_OPENCODE_ABORT_PORT ?? 4393);
const MODEL = process.env.MDY_OPENCODE_ABORT_MODEL ?? "anthropic/claude-haiku-4.5";
/** Assez pour que le modèle ait commencé à écrire, assez peu pour qu'il n'ait pas fini. */
const ABORT_AFTER_MS = Number(process.env.MDY_OPENCODE_ABORT_AFTER_MS ?? 2500);

function loadEnv(): void {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

let server: ReturnType<typeof spawn> | null = null;
let proxy: LlmProxy | null = null;
let root = "";

afterAll(async () => {
  server?.kill("SIGKILL");
  await proxy?.close().catch(() => {});
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!LIVE)("un round coupé en vol", () => {
  it(
    "n'est facturé par personne sauf par le proxy — et c'est lui qu'on écoute",
    async () => {
      loadEnv();
      const key = process.env.OPENROUTER_API_KEY;
      expect(key, "OPENROUTER_API_KEY").toBeTruthy();

      root = fs.mkdtempSync(path.join(os.tmpdir(), "mdy-opencode-abort-"));
      const repo = path.join(root, "repo");
      fs.mkdirSync(repo, { recursive: true });
      const git = (args: string[]) =>
        execFileSync("git", ["-c", "user.email=a@b", "-c", "user.name=a", ...args], { cwd: repo });
      git(["init", "-q"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "hi\n");
      git(["add", "-A"]);
      git(["commit", "-qm", "init"]);

      let bin = process.env.MDY_OPENCODE_BIN ?? "";
      if (!bin) {
        execFileSync("npm", ["i", "--no-audit", "--no-fund", `opencode-ai@${VERSION}`], {
          cwd: root,
          stdio: "ignore",
        });
        bin = path.join(root, "node_modules", ".bin", "opencode");
      }

      // LE VRAI PROXY, celui de production. C'est lui qu'on met à l'épreuve : la
      // clé est posée dans sa config amont ici, là où le firewall la pose en
      // production — le proxy n'en connaît toujours aucune.
      proxy = await startLlmProxy({
        job: {
          baseUrl: "https://openrouter.ai/api/v1",
          provider: "openrouter",
          reasoningLevel: "off",
        },
        fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, {
            ...init,
            headers: { ...(init?.headers as Record<string, string>), authorization: `Bearer ${key}` },
          })) as typeof fetch,
      });

      const config = {
        provider: {
          minddy: {
            npm: "@ai-sdk/openai-compatible",
            name: "minddy",
            options: { baseURL: proxy.url, apiKey: "placeholder" },
            models: { [MODEL]: { name: MODEL, tool_call: true, cost: { input: 1, output: 5 } } },
          },
        },
        model: `minddy/${MODEL}`,
        small_model: `minddy/${MODEL}`,
        agent: { build: { mode: "primary", model: `minddy/${MODEL}`, tools: { "*": false } } },
      };

      server = spawn(bin, ["serve", "--port", String(PORT), "--hostname", "127.0.0.1"], {
        cwd: repo,
        env: {
          ...process.env,
          OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
          OPENCODE_DB: path.join(root, "probe.db"),
          OPENCODE_DISABLE_AUTOUPDATE: "1",
        },
        stdio: "ignore",
      });

      const url = `http://127.0.0.1:${PORT}`;
      const q = (p: string) =>
        `${url}${p}${p.includes("?") ? "&" : "?"}directory=${encodeURIComponent(repo)}`;
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 300));
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
          body: JSON.stringify({ title: "abort probe" }),
        })
      ).json()) as { id: string };

      await fetch(q(`/session/${session.id}/prompt_async`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parts: [
            {
              type: "text",
              text: "Write a very long essay about the history of the bicycle, at least 3000 words. Start immediately.",
            },
          ],
        }),
      });

      await new Promise((r) => setTimeout(r, ABORT_AFTER_MS));
      await fetch(q(`/session/${session.id}/abort`), { method: "POST" });

      // ── 1. Ce qu'opencode dit du round : rien de facturable ────────────────
      await new Promise((r) => setTimeout(r, 2_000));
      const messages = (await (await fetch(q(`/session/${session.id}/message`))).json()) as Array<{
        info: { role: string; finish?: string | null; cost?: number };
        parts: Array<{ type: string; text?: string }>;
      }>;
      const assistant = messages.find((m) => m.info.role === "assistant");
      expect(assistant, "aucun message assistant").toBeTruthy();
      const written = (assistant!.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
      // Le modèle avait commencé : sans ça la sonde ne prouverait rien.
      expect(written.length, "le round a été coupé trop tôt pour prouver quoi que ce soit")
        .toBeGreaterThan(20);
      expect(assistant!.info.finish ?? null, "opencode facturerait donc ce round").toBeNull();
      expect(assistant!.info.cost ?? 0).toBe(0);

      // ── 2. Ce que le proxy en a gardé : le coût réel ───────────────────────
      await proxy.settle(10_000);
      const orphans = proxy.drain();
      expect(orphans.length, "le proxy n'a rien retenu du round coupé").toBeGreaterThan(0);
      const gen = orphans[0];
      expect(gen.id, "pas de generation_id").toBeTruthy();
      expect(gen.costUsd, "le fournisseur n'a pas rendu son coût").toBeGreaterThan(0);
      expect(gen.usage?.promptTokens ?? 0).toBeGreaterThan(0);
      expect(gen.usage?.completionTokens ?? 0).toBeGreaterThan(0);
    },
    600_000,
  );
});
