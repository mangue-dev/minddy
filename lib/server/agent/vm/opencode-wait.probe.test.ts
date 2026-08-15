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
 * MIN-362 — sonde de L'ATTENTE : ce qui se passe quand personne ne répond.
 *
 * Ne tourne PAS avec `npm test` : `describe.skipIf` la saute tant que
 * `MDY_OPENCODE_WAIT_PROBE=1` n'est pas posé. Elle est SÉPARÉE de
 * [opencode-permissions.probe.test.ts](opencode-permissions.probe.test.ts) parce
 * qu'elle ne coûte pas la même chose : ici on paie du temps de mur — l'attente
 * EST la mesure — et, sur son dernier cas, un vrai round de modèle.
 *
 *   MDY_OPENCODE_WAIT_PROBE=1 npx vitest run \
 *     lib/server/agent/vm/opencode-wait.probe.test.ts --testTimeout=900000
 *
 *   # le cas à vrai fournisseur (~0,003 $, ~2 min), en plus :
 *   MDY_OPENCODE_WAIT_PROBE=1 MDY_OPENCODE_WAIT_LIVE=1 npx vitest run …
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RELEVÉ DU 2026-08-15 sur `opencode-ai@1.18.16`
 *
 * 1. **Aucun timeout côté opencode.** Une demande de permission reste pendante
 *    sans fin — relevé toutes les 5 s : demande listée, part de tool `running`,
 *    session `busy`, et `session.idle` qui n'arrive JAMAIS. L'audit l'a tenu
 *    303 s ; la sonde tient une fenêtre plus courte (`MDY_OPENCODE_WAIT_MS`,
 *    30 s par défaut), parce que ce qui se démontre est l'ABSENCE de dénouement,
 *    pas sa durée. Le seul plafond est donc le nôtre — et tout ce que le
 *    superviseur fait au `session.idle` est suspendu avec elle.
 * 2. **Tuer le process pendant l'attente est IRRÉVERSIBLE.** Au redémarrage la
 *    session est retrouvée, `GET /permission` rend `[]` — la demande n'existe
 *    plus — et la part de tool reste figée à `running` pour toujours. Rien ne la
 *    ressuscite : un tour local dont l'app de bureau meurt pendant une carte
 *    d'approbation ne se reprend pas, il se refait.
 * 3. **`POST /question/:id/reply` fonctionne, bloque sans timeout, et ne termine
 *    PAS le tour** : le tool `question` revient `completed` avec « User has
 *    answered your questions », et le round REPART vers le modèle. « `ask_user`
 *    est terminal » est donc un choix de minddy, pas une contrainte du moteur —
 *    et le motif de ce choix (une microVM ouverte qui coûte) tombe sur la
 *    machine de l'utilisateur.
 * 4. **Avec un VRAI fournisseur, l'attente survit** (le cas gardé par
 *    `MDY_OPENCODE_WAIT_LIVE`). C'est ce que le faux fournisseur ne pouvait pas
 *    dire : il a fini son flux avant l'exécution du tool, là où un vrai modèle
 *    tient une connexion ouverte pendant tout ce temps.
 */

const LIVE = process.env.MDY_OPENCODE_WAIT_PROBE === "1";
const WITH_PROVIDER = LIVE && process.env.MDY_OPENCODE_WAIT_LIVE === "1";
/** La fenêtre d'attente. Assez pour qu'un timeout du moteur se soit déclenché. */
const WAIT_MS = Number(process.env.MDY_OPENCODE_WAIT_MS ?? 30_000);
/** L'attente du cas à vrai fournisseur : plus longue que tout keep-alive usuel. */
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

      // Chaque relevé dit la même chose : c'est ÇA, l'absence de timeout.
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

      // La session est retrouvée…
      expect((await repris.get(`/session/${session}`)).status).toBe(200);
      // …mais la demande a disparu…
      expect(
        (await repris.get("/permission")).body,
        "la demande a survécu au redémarrage : la reprise d'un tour interrompu redevient possible",
      ).toEqual([]);
      // …et l'appel de tool reste figé, sans personne pour le dénouer.
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

      // Elle BLOQUE : rien ne bouge tant que personne ne répond.
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

      // Le VRAI proxy du superviseur, comme dans opencode-abort.probe.test.ts :
      // la clé est posée dans sa config amont, jamais dans celle d'opencode.
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

      // L'ATTENTE : c'est ici que le faux fournisseur ne pouvait plus rien dire.
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

      // Le tour REPART : le tool s'exécute et le modèle rend sa réponse.
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
