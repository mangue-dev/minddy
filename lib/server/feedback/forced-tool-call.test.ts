import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `forcedToolCall` is the primitive shared by five AI passes (smart-fill,
 * conversation title, import match, brief cut, review of
 * feedback). The routing shortcut fallback (MIN-263) lives INSIDE: it's this
 * that gives it to all five without anyone having to know.
 *
 * What matters: we only replay on a REFUSAL, and only when there is a
 * suffix to remove. Replaying a timeout would double the wait for someone who
 * is already waiting in front of their screen.
 */

vi.mock("@/lib/server/ai-usage", () => ({
  recordAiUsage: vi.fn(async () => {}),
  newRunId: () => "run-test",
  parseOpenRouterUsage: () => ({
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    cost: null,
  }),
}));

const { forcedToolCall } = await import("./forced-tool-call");

/** An OpenRouter response that carries the unique expected tool call. */
function okResponse(model: string) {
  return {
    ok: true,
    json: async () => ({
      model,
      choices: [
        {
          message: {
            tool_calls: [{ function: { name: "pick", arguments: JSON.stringify({ model }) } }],
          },
        },
      ],
    }),
  } as unknown as Response;
}

function refusal() {
  return {
    ok: false,
    status: 404,
    text: async () => "No endpoints found matching your data policy",
  } as unknown as Response;
}

function call(model: string) {
  return forcedToolCall(model, "system", "user", "pick", { type: "object" }, {
    logPrefix: "[test]",
  });
}

/** The model actually sent, trial by trial. */
const modelsSent: string[] = [];

/** Replaces `fetch` with `handler`, noting the pattern of each request. */
function stubFetch(handler: (model: string) => Response) {
  vi.spyOn(globalThis, "fetch").mockImplementation((async (
    _url: string,
    init: { body: string },
  ) => {
    const { model } = JSON.parse(init.body) as { model: string };
    modelsSent.push(model);
    return handler(model);
  }) as unknown as typeof fetch);
}

beforeEach(() => {
  modelsSent.length = 0;
  process.env.MINDDY_EDITION = "cloud";
  process.env.MINDDY_MANAGED_AI = "1";
  process.env.OPENROUTER_API_KEY = "sk-test";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("forcedToolCall — repli du raccourci de routage", () => {
  it("n'utilise pas la clé plateforme sans opt-in du service managé", async () => {
    process.env.MINDDY_MANAGED_AI = "";
    const fetch = vi.spyOn(globalThis, "fetch");

    expect(await call("openai/gpt-5")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("n'appelle qu'une fois quand le modèle suffixé passe", async () => {
    stubFetch(() => okResponse("openai/gpt-5"));
    const out = await call("openai/gpt-5:nitro");
    expect(out).toEqual({ model: "openai/gpt-5" });
    expect(modelsSent).toEqual(["openai/gpt-5:nitro"]);
  });

  it("rejoue sur le modèle nu quand OpenRouter refuse", async () => {
    stubFetch((model) => (model.includes(":") ? refusal() : okResponse(model)));
    const out = await call("openai/gpt-5:exacto");
    expect(out).toEqual({ model: "openai/gpt-5" });
    expect(modelsSent).toEqual(["openai/gpt-5:exacto", "openai/gpt-5"]);
  });

  it("ne rejoue pas le refus d'un modèle nu", async () => {
    stubFetch(() => refusal());
    expect(await call("openai/gpt-5")).toBeNull();
    expect(modelsSent).toEqual(["openai/gpt-5"]);
  });

  it("ne rejoue pas un timeout — l'attente compte plus que le raccourci", async () => {
    stubFetch(() => {
      throw Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    });
    expect(await call("openai/gpt-5:floor")).toBeNull();
    expect(modelsSent).toEqual(["openai/gpt-5:floor"]);
  });

  it("abandonne proprement quand le modèle nu échoue aussi", async () => {
    stubFetch(() => refusal());
    expect(await call("openai/gpt-5:nitro")).toBeNull();
    expect(modelsSent).toEqual(["openai/gpt-5:nitro", "openai/gpt-5"]);
  });
});
