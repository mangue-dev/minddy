import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { authUrlSecrets, SecretRedactor, REDACTED_MARK } from "./redact";
import { runAgentLoop, type AgentChatMessage } from "./agent-loop";

/**
 * MIN-239 — LE TOKEN DE FORGE SORTAIT DANS LES SORTIES DE TOOL, ET Y RESTAIT.
 *
 * La chaîne : `git clone` sur une URL token-authentifiée écrit cette URL entière
 * dans `.git/config`, trois tools l'en sortent (`git remote -v`, `cat .git/config`,
 * `read_file(".git/config")`), et le résultat passe SOUS le cap de 400 caractères
 * de `previewResult` — donc entier — jusqu'à `agent_run_events`, persisté 30 jours
 * et lisible par tout membre du projet.
 *
 * Ce que ces tests tiennent : le token ne sort par AUCUNE des deux portes du
 * résultat d'un tool — ni l'aperçu de l'event, ni le message `role:"tool"` qui part
 * dans le checkpoint. La deuxième compte autant que la première : c'est la même
 * chaîne, persistée dans une autre table.
 */

const GH_TOKEN = "ghs_16C7e42F292c6912E7710c838347Ae178B4a";
const GH_AUTH_URL = `https://x-access-token:${GH_TOKEN}@github.com/mangue-dev/minddy.git`;
const GL_TOKEN = "glpat-aBcDeFgHiJkLmNoPqRsT";
const GL_AUTH_URL = `https://oauth2:${GL_TOKEN}@gitlab.com/mangue/minddy.git`;

describe("authUrlSecrets", () => {
  it("sort le token d'une URL de clone GitHub et GitLab, jamais l'utilisateur", () => {
    expect(authUrlSecrets(GH_AUTH_URL)).toEqual([GH_TOKEN]);
    expect(authUrlSecrets(GL_AUTH_URL)).toEqual([GL_TOKEN]);
    // `x-access-token` et `oauth2` sont des constantes du protocole : les
    // substituer rendrait les URL illisibles sans rien protéger.
    expect(authUrlSecrets(GH_AUTH_URL)).not.toContain("x-access-token");
  });

  it("rend AUSSI la forme décodée d'un token percent-encodé", () => {
    const raw = "abc%2Fdef%2Bghi%3Djkl";
    const secrets = authUrlSecrets(`https://oauth2:${raw}@gitlab.com/a/b.git`);
    expect(secrets).toContain(raw);
    expect(secrets).toContain("abc/def+ghi=jkl");
  });

  it("ne lève pas sur une URL absente ou malformée, et ne rend rien sans mot de passe", () => {
    expect(authUrlSecrets(null)).toEqual([]);
    expect(authUrlSecrets("pas une url")).toEqual([]);
    expect(authUrlSecrets("https://github.com/mangue-dev/minddy.git")).toEqual([]);
  });
});

describe("SecretRedactor", () => {
  it("substitue le token dans les trois sorties qui le portaient", () => {
    const secrets = new SecretRedactor();
    secrets.addAuthUrl(GH_AUTH_URL);

    const remoteV = `origin\t${GH_AUTH_URL} (fetch)\norigin\t${GH_AUTH_URL} (push)`;
    const gitConfig = `[remote "origin"]\n\turl = ${GH_AUTH_URL}\n\tfetch = +refs/heads/*`;
    const toolJson = JSON.stringify({ exit_code: 0, output: remoteV });

    for (const text of [remoteV, gitConfig, toolJson]) {
      const out = secrets.redact(text);
      expect(out).not.toContain(GH_TOKEN);
      expect(out).toContain(REDACTED_MARK);
    }
    // Substitué, pas refusé : la commande reste lisible, seul le secret part.
    expect(secrets.redact(gitConfig)).toContain(
      `https://x-access-token:${REDACTED_MARK}@github.com/mangue-dev/minddy.git`,
    );
  });

  it("garde les tokens PRÉCÉDENTS : un `.git/config` porte celui du clone", () => {
    // Un tour dure des heures, un token d'installation une heure — il est re-minté
    // avant chaque push. Le registre est cumulatif, sinon le token du clone (celui
    // qui est encore écrit dans `.git/config`) cesserait d'être substitué.
    const secrets = new SecretRedactor();
    secrets.addAuthUrl(GH_AUTH_URL);
    secrets.addAuthUrl(GL_AUTH_URL);
    const out = secrets.redact(`${GH_AUTH_URL} puis ${GL_AUTH_URL}`);
    expect(out).not.toContain(GH_TOKEN);
    expect(out).not.toContain(GL_TOKEN);
  });

  it("rend le texte inchangé sans secret, et ignore une valeur trop courte", () => {
    const secrets = new SecretRedactor();
    expect(secrets.redact("git status")).toBe("git status");
    secrets.add("abc");
    expect(secrets.size).toBe(0);
    expect(secrets.redact("abcdef")).toBe("abcdef");
  });
});

// ── La boucle : les DEUX portes du résultat d'un tool ────────────────────────

interface Choice {
  delta?: Record<string, unknown>;
  finish_reason?: string | null;
}

function sse(choices: Choice[]): string {
  const chunks: Array<Record<string, unknown>> = choices.map((c) => ({
    id: "gen_1",
    model: "test/model",
    choices: [c],
  }));
  chunks.push({
    id: "gen_1",
    model: "test/model",
    choices: [{ delta: {} }],
    usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, cost: 0.001 },
  });
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

function sseToolCall(name: string, args: unknown): string {
  return sse([
    {
      delta: {
        tool_calls: [{ index: 0, id: "call_1", function: { name, arguments: JSON.stringify(args) } }],
      },
    },
    { delta: {}, finish_reason: "stop" },
  ]);
}

function sseText(text: string): string {
  return sse([{ delta: { content: text } }, { delta: {}, finish_reason: "stop" }]);
}

let responses: Array<() => Response>;

beforeEach(() => {
  responses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error("fetch non prévu par le test");
      return next();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function seed(): AgentChatMessage[] {
  return [
    { role: "system", content: "You are numo." },
    { role: "user", content: "Show me the remotes." },
  ];
}

describe("le token ne quitte pas la boucle", () => {
  it("ni dans l'event tool_result, ni dans le message rendu au modèle", async () => {
    const secrets = new SecretRedactor();
    secrets.addAuthUrl(GH_AUTH_URL);
    responses = [
      () => new Response(sseToolCall("run_command", { command: "git remote -v" })),
      () => new Response(sseText("Done.")),
    ];
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];

    const result = await runAgentLoop({
      messages: seed(),
      tools: [],
      model: "test/model",
      apiKey: "sk-test",
      baseUrl: "https://example.invalid/v1",
      runId: "run_test",
      billTo: { userId: "user_test" },
      recordUsage: async () => {},
      softDeadlineMs: 250_000,
      emit: async (type, payload) => {
        events.push({ type, payload: payload as Record<string, unknown> });
      },
      execTool: async () => ({
        result: { exit_code: 0, output: `origin\t${GH_AUTH_URL} (fetch)` },
        success: true,
      }),
      redact: secrets.redact,
    });

    expect(result.status).toBe("completed");

    // Porte 1 : l'aperçu persisté dans `agent_run_events`, 30 jours durant.
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult).toBeDefined();
    expect(String(toolResult?.payload.preview)).not.toContain(GH_TOKEN);
    expect(String(toolResult?.payload.preview)).toContain(REDACTED_MARK);

    // Porte 2 : le message `role:"tool"` — il part dans `agent_runs.checkpoint`,
    // et c'est aussi ce que le modèle LIT. Ce qu'il ne voit pas, il ne peut pas le
    // recopier dans un fichier ni dans sa réponse.
    const toolMessage = result.messages.find((m) => m.role === "tool");
    expect(String(toolMessage?.content)).not.toContain(GH_TOKEN);
    expect(String(toolMessage?.content)).toContain(REDACTED_MARK);
  });

  it("sans `redact`, la sortie passe telle quelle (le crochet est bien le seul filet)", async () => {
    responses = [
      () => new Response(sseToolCall("run_command", { command: "git remote -v" })),
      () => new Response(sseText("Done.")),
    ];
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];

    const result = await runAgentLoop({
      messages: seed(),
      tools: [],
      model: "test/model",
      apiKey: "sk-test",
      baseUrl: "https://example.invalid/v1",
      runId: "run_test",
      billTo: { userId: "user_test" },
      recordUsage: async () => {},
      softDeadlineMs: 250_000,
      emit: async (type, payload) => {
        events.push({ type, payload: payload as Record<string, unknown> });
      },
      execTool: async () => ({ result: { output: GH_AUTH_URL }, success: true }),
    });

    expect(result.status).toBe("completed");
    // C'est EXACTEMENT le bug d'origine, gardé sous les yeux : sans le crochet, le
    // token passe sous le cap de 400 caractères et se pose dans la table.
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(String(toolResult?.payload.preview)).toContain(GH_TOKEN);
  });
});
