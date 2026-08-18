import fs from "node:fs";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { startLlmProxy, type LlmProxy } from "./llm-proxy";
import {
  bash,
  installOpencode,
  loadEnv,
  probeConfig,
  probeRoot,
  settleProvider,
  sleep,
  startProbeServer,
  startProvider,
  waitFor,
  type FakeProvider,
  type ProbeServer,
} from "./opencode-probe-rig";

/**
 * MIN-362 — WAIT probe: what happens when no one responds.
 *
 * Does NOT run with `npm test`: `describe.skipIf` skips it until
 * `MDY_OPENCODE_WAIT_PROBE=1` is not posed. It is SEPARATE from
 * [opencode-permissions.probe.test.ts](opencode-permissions.probe.test.ts) because
 * it does not cost the same thing: here we pay for wall time — the wait
 * IS the measure — and, in its last case, a real round of model.
 *
 * MDY_OPENCODE_WAIT_PROBE=1 npx vitest run \
 * lib/server/agent/vm/opencode-wait.probe.test.ts --testTimeout=900000
 *
 * # the case with real provider (~$0.003, ~2 min), in addition:
 * MDY_OPENCODE_WAIT_PROBE=1 MDY_OPENCODE_WAIT_LIVE=1 npx vitest run …
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * REPORTED FROM 2026-08-15 on `opencode-ai@1.18.16`
 *
 * 1. **No timeout on the opencode side.** A permission request remains pending
 * endless — recorded every 5 s: request listed, part of tool `running`,
 * session `busy`, and `session.idle` which NEVER happens. The audit held it
 * 303 s; the probe holds a shorter window (`MDY_OPENCODE_WAIT_MS`,
 * 30 s by default), because what is demonstrated is the ABSENCE of outcome,
 * not its duration. The only ceiling is therefore ours — and everything that the supervisor does to the `session.idle` is suspended with it. `[]` — the request no longer exists — and the tool share remains fixed at `running` forever. Nothing does it
 * resurrects: a local round whose desktop app dies during an approval card
 * does not resume, it redoes.
 * 3. **`POST /question/:id/reply` works, blocks without timeout, and does not end
 * NOT the round**: the tool `question` returns `completed` with “User has
 * answered your questions”, and the round STARTS back to the model. "`ask_user`
 * is terminal" is therefore a minddy choice, not a constraint of the engine —
 * and the reason for this choice (an open microVM that costs) falls on the user's machine.
 * 4. **With a REAL provider, the wait survives** (the case kept by
 * `MDY_OPENCODE_WAIT_LIVE`). This is what the fake provider couldn't
 * say: it finished its flow before the tool executed, where a real model
 * keeps a connection open the whole time.
 */

const LIVE = process.env.MDY_OPENCODE_WAIT_PROBE === "1";
const WITH_PROVIDER = LIVE && process.env.MDY_OPENCODE_WAIT_LIVE === "1";
/** The waiting window. Enough that a motor timeout was triggered. */
const WAIT_MS = Number(process.env.MDY_OPENCODE_WAIT_MS ?? 30_000);
/** The wait for the real provider case: longer than any usual keep-alive. */
const LIVE_WAIT_MS = Number(process.env.MDY_OPENCODE_WAIT_LIVE_MS ?? 120_000);
const LIVE_MODEL = process.env.MDY_OPENCODE_WAIT_MODEL ?? "anthropic/claude-haiku-4.5";

let bin = "";
const running: ProbeServer[] = [];
const providers: FakeProvider[] = [];
const roots: string[] = [];
let proxy: LlmProxy | null = null;

beforeAll(async () => {
  if (!LIVE) return;
  const installRoot = probeRoot("install-wait");
  roots.push(installRoot);
  bin = installOpencode(installRoot);
}, 600_000);

afterEach(async () => {
  for (const server of running.splice(0)) server.stop();
  for (const provider of providers.splice(0)) provider.close();
  await proxy?.close().catch(() => {});
  proxy = null;
  for (const root of roots.splice(0)) {
    if (!root.includes("install-wait")) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!LIVE)("une demande à laquelle personne ne répond", () => {
  it(
    "ne se dénoue jamais : ni timeout, ni `session.idle`",
    async () => {
      const provider = await startProvider([{ tools: [bash("echo attends")] }]);
      providers.push(provider);
      const server = await startProbeServer({
        bin,
        tag: "attente",
        config: probeConfig(provider.url, { permission: { bash: "ask" } }),
      });
      running.push(server);
      roots.push(server.root);

      const session = await server.createSession("attente");
      await server.prompt(session);
      await waitFor(() => server.asks(session).length > 0, 20_000);

      const releves: Array<{ s: number; pendantes: number; tool?: string }> = [];
      const started = Date.now();
      while (Date.now() - started < WAIT_MS) {
        await sleep(5_000);
        const pending = (await server.get("/permission")).body as unknown[];
        releves.push({
          s: Math.round((Date.now() - started) / 1000),
          pendantes: pending.length,
          tool: server.toolParts().at(-1)?.status,
        });
      }

      // Each reading says the same thing: THIS is the absence of timeout.
      expect(releves.length).toBeGreaterThanOrEqual(3);
      for (const releve of releves) {
        expect(releve.pendantes, `à ${releve.s} s, la demande n'était plus pendante`).toBe(1);
        expect(releve.tool, `à ${releve.s} s, la part de tool a bougé`).toBe("running");
      }
      expect(
        server.sawIdle(),
        "`session.idle` est arrivé — tout ce que le superviseur y accroche n'est donc PAS suspendu",
      ).toBe(false);
      expect(provider.seen.length, "le fournisseur a été rappelé pendant l'attente").toBe(1);
    },
    900_000,
  );

  it(
    "tuer le process pendant l'attente est IRRÉVERSIBLE",
    async () => {
      const provider = await startProvider([{ tools: [bash("echo attends")] }]);
      providers.push(provider);
      const config = probeConfig(provider.url, { permission: { bash: "ask" } });
      const server = await startProbeServer({ bin, tag: "mort", config });
      running.push(server);
      roots.push(server.root);

      const session = await server.createSession("mort");
      await server.prompt(session);
      await waitFor(() => server.asks(session).length > 0, 20_000);
      expect(((await server.get("/permission")).body as unknown[]).length).toBe(1);

      server.stop();
      await sleep(1_000);
      const repris = await startProbeServer({
        bin,
        tag: "mort",
        config,
        reuse: { root: server.root, repo: server.repo },
      });
      running.push(repris);

      // The session is found…
      expect((await repris.get(`/session/${session}`)).status).toBe(200);
      // …but the request has disappeared…
      expect(
        (await repris.get("/permission")).body,
        "la demande a survécu au redémarrage : la reprise d'un tour interrompu redevient possible",
      ).toEqual([]);
      // …and the tool call remains frozen, with no one to resolve it.
      const messages = (await repris.get(`/session/${session}/message`)).body as Array<{
        parts?: Array<Record<string, any>>;
      }>;
      const toolPart = messages
        .flatMap((m) => m.parts ?? [])
        .filter((p) => p.type === "tool")
        .at(-1);
      expect(toolPart?.state?.status, "la part de tool n'est plus figée à `running`").toBe("running");
    },
    900_000,
  );

  it(
    "une QUESTION bloque le tour, et y répondre ne le termine pas",
    async () => {
      const provider = await startProvider([
        {
          tools: [
            {
              name: "question",
              args: {
                questions: [
                  {
                    question: "On continue ?",
                    header: "Suite",
                    options: [
                      { label: "Oui", description: "on continue" },
                      { label: "Non", description: "on arrête" },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ]);
      providers.push(provider);
      const server = await startProbeServer({
        bin,
        tag: "question",
        config: probeConfig(provider.url, { permission: { bash: "ask" } }),
      });
      running.push(server);
      roots.push(server.root);

      const session = await server.createSession("question");
      await server.prompt(session);
      await waitFor(() => server.events.some((e) => e.type === "question.asked"), 20_000);

      const asked = server.events.find((e) => e.type === "question.asked")!.properties;
      expect(asked.id).toMatch(/^que_/);
      expect(((await server.get("/question")).body as unknown[]).length).toBe(1);

      // She BLOCKS: nothing moves until no one responds.
      await sleep(8_000);
      expect(((await server.get("/question")).body as unknown[]).length).toBe(1);
      expect(provider.seen.length, "le tour a repris tout seul").toBe(1);
      expect(server.sawIdle()).toBe(false);

      const reply = await server.post(`/question/${asked.id}/reply`, { answers: [["Oui"]] });
      expect(reply.status).toBe(200);
      expect(reply.body).toBe(true);
      await settleProvider(provider);

      const toolPart = server.toolParts().at(-1);
      expect(toolPart?.status).toBe("completed");
      expect(
        provider.seen.length,
        "répondre à une question TERMINE le tour — `ask_user` terminal cesse d'être un choix",
      ).toBeGreaterThan(1);
    },
    900_000,
  );
});

describe.skipIf(!WITH_PROVIDER)("la même attente, avec un VRAI fournisseur", () => {
  it(
    "tient une attente longue et rend la main au modèle",
    async () => {
      loadEnv();
      const key = process.env.OPENROUTER_API_KEY;
      expect(key, "OPENROUTER_API_KEY").toBeTruthy();

      // The REAL supervisor proxy, as in opencode-abort.probe.test.ts:
      // the key is placed in its upstream config, never in that of opencode.
      proxy = await startLlmProxy({
        job: { baseUrl: "https://openrouter.ai/api/v1", provider: "openrouter", reasoningLevel: "off" },
        fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, {
            ...init,
            headers: { ...(init?.headers as Record<string, string>), authorization: `Bearer ${key}` },
          })) as typeof fetch,
      });

      const server = await startProbeServer({
        bin,
        tag: "attente-vraie",
        config: {
          provider: {
            minddy: {
              npm: "@ai-sdk/openai-compatible",
              name: "minddy",
              options: { baseURL: proxy.url, apiKey: "placeholder" },
              models: { [LIVE_MODEL]: { name: LIVE_MODEL, tool_call: true } },
            },
          },
          model: `minddy/${LIVE_MODEL}`,
          small_model: `minddy/${LIVE_MODEL}`,
          permission: { bash: "ask", edit: "ask" },
        },
      });
      running.push(server);
      roots.push(server.root);

      const session = await server.createSession("attente vraie");
      await server.prompt(
        session,
        "Run exactly this shell command with the bash tool, and nothing else: echo bonjour",
      );
      const asked = await waitFor(() => server.asks(session).length > 0, 120_000);
      expect(asked, "le modèle n'a pas appelé `bash` — la sonde ne mesure rien").toBe(true);

      // THE WAIT: this is where the fake supplier could no longer say anything.
      const started = Date.now();
      while (Date.now() - started < LIVE_WAIT_MS) {
        await sleep(15_000);
        expect(
          ((await server.get("/permission")).body as unknown[]).length,
          `la demande s'est dénouée seule après ${Math.round((Date.now() - started) / 1000)} s`,
        ).toBe(1);
        expect(server.sawIdle()).toBe(false);
      }

      const [ask] = server.asks(session);
      await server.post(`/permission/${ask.id}/reply`, { reply: "once" });

      // The turn STARTS: the tool executes and the model returns its response.
      const fini = await waitFor(
        () => server.toolParts().some((p) => p.status === "completed") && server.sawIdle(),
        180_000,
      );
      expect(
        fini,
        `après ${Math.round(LIVE_WAIT_MS / 1000)} s d'attente, le round ne repart plus — ` +
          "un vrai fournisseur a donc coupé, et le harness local doit borner l'attente",
      ).toBe(true);
    },
    900_000,
  );
});
