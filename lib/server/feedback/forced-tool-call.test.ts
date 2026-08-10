import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `forcedToolCall` est la primitive partagée par cinq passes IA (smart-fill,
 * titre de conversation, correspondance d'import, découpe de brief, revue du
 * feedback). Le repli du raccourci de routage (MIN-263) vit DEDANS : c'est ce
 * qui le donne aux cinq sans qu'aucune n'ait à le savoir.
 *
 * Ce qui compte : on ne rejoue que sur un REFUS, et seulement quand il y a un
 * suffixe à retirer. Rejouer un timeout doublerait l'attente de quelqu'un qui
 * patiente déjà devant son écran.
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

/** Une réponse OpenRouter qui porte l'unique tool call attendu. */
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

/** Le modèle réellement envoyé, essai par essai. */
const modelsSent: string[] = [];

/** Remplace `fetch` par `handler`, en notant le modèle de chaque requête. */
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
  process.env.OPENROUTER_API_KEY = "sk-test";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("forcedToolCall — repli du raccourci de routage", () => {
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
