/**
 * Opt-in probe for an aborted real OpenCode generation.
 * MIN-286 previously kept upstream generation alive to collect the final cost.
 * MIN-628 cancels upstream instead and preserves an identifiable receipt with
 * unknown usage when the final accounting frame is unavailable.
 *
 * MDY_OPENCODE_ABORT_PROBE=1 MDY_OPENCODE_BIN=/path/to/opencode \
 * npx vitest run lib/server/agent/vm/opencode-abort.probe.test.ts --testTimeout=600000
 * Requires OPENROUTER_API_KEY and spends one short real model request.
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
/** Enough that the model has started writing, little enough that it hasn't finished. */
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

describe.skipIf(!LIVE)("an interrupted real generation", () => {
  it(
    "cancels upstream and retains the generation identity without inventing usage",
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

      // THE REAL PROXY, the production one. This is the one under test: the key
      // is placed in its upstream config here, where the firewall places it in
      // production — the proxy itself still knows none of it.
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
      proxy.cancel();
      await fetch(q(`/session/${session.id}/abort`), { method: "POST" });

      // ── 1. What opencode says about the round: nothing billable ────────────
      await new Promise((r) => setTimeout(r, 2_000));
      const messages = (await (await fetch(q(`/session/${session.id}/message`))).json()) as Array<{
        info: { role: string; finish?: string | null; cost?: number };
        parts: Array<{ type: string; text?: string }>;
      }>;
      const assistant = messages.find((m) => m.info.role === "assistant");
      expect(assistant, "no assistant message").toBeTruthy();
      const written = (assistant!.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
      // The model had started: without it the probe would prove nothing.
      expect(written.length, "the round was interrupted before generating measurable text")
        .toBeGreaterThan(20);
      expect(assistant!.info.finish ?? null, "the engine must not mark the interrupted round as finished").toBeNull();
      expect(assistant!.info.cost ?? 0).toBe(0);

      // The identity survives even though cancellation removes the usage frame.
      await proxy.settle(10_000);
      const orphans = proxy.drain();
      expect(orphans.length, "no receipt captured for the interrupted generation").toBeGreaterThan(0);
      const gen = orphans[0];
      expect(gen.id, "missing generation ID").toBeTruthy();
      expect(gen.costUsd).toBeNull();
      expect(gen.usage).toBeNull();
    },
    600_000,
  );
});
