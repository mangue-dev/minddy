import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordAiUsage } from "@/lib/server/ai-usage";

vi.mock("@/lib/server/ai-provider-request", () => ({
  fetchAiProvider: (_provider: string, url: string, init: RequestInit) => fetch(url, init),
}));

/**
 * `forcedToolCall` is shared by smart fill, conversation titles, import
 * matching, brief splitting, and feedback review. It handles routing suffix
 * fallback for all consumers.
 *
 * A refused suffixed model may retry without the suffix. Timeouts do not retry.
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

/** Model sent on each attempt. */
const modelsSent: string[] = [];

/** Replace `fetch` and record the model used by each request. */
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

describe("forcedToolCall routing suffix fallback", () => {
  it("does not start auxiliary generation after its owner has stopped", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(await forcedToolCall("m", "system", "user", "pick", {}, {
      signal: controller.signal,
    })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("closes a pending auxiliary request when its owner stops", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const opening = new Promise<void>(resolve => { started = resolve; });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      started();
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      });
    });
    const pending = forcedToolCall("m", "system", "user", "pick", {}, { signal: controller.signal });
    await opening;
    controller.abort();
    expect(await pending).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not use the platform key without managed AI opt-in", async () => {
    process.env.MINDDY_MANAGED_AI = "";
    const fetch = vi.spyOn(globalThis, "fetch");

    expect(await call("openai/gpt-5")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls once when the suffixed model succeeds", async () => {
    stubFetch(() => okResponse("openai/gpt-5"));
    const out = await call("openai/gpt-5:nitro");
    expect(out).toEqual({ model: "openai/gpt-5" });
    expect(modelsSent).toEqual(["openai/gpt-5:nitro"]);
  });

  it("retries the bare model when OpenRouter refuses", async () => {
    stubFetch((model) => (model.includes(":") ? refusal() : okResponse(model)));
    const out = await call("openai/gpt-5:exacto");
    expect(out).toEqual({ model: "openai/gpt-5" });
    expect(modelsSent).toEqual(["openai/gpt-5:exacto", "openai/gpt-5"]);
  });

  it("does not retry a bare model refusal", async () => {
    stubFetch(() => refusal());
    expect(await call("openai/gpt-5")).toBeNull();
    expect(modelsSent).toEqual(["openai/gpt-5"]);
  });

  it("does not retry a timeout", async () => {
    stubFetch(() => {
      throw Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    });
    expect(await call("openai/gpt-5:floor")).toBeNull();
    expect(modelsSent).toEqual(["openai/gpt-5:floor"]);
  });

  it("returns null when the bare model also fails", async () => {
    stubFetch(() => refusal());
    expect(await call("openai/gpt-5:nitro")).toBeNull();
    expect(modelsSent).toEqual(["openai/gpt-5:nitro", "openai/gpt-5"]);
  });
});

describe("forcedToolCall reasoning request", () => {
  it("omits reasoning when no effort is requested", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((async (
      _url: string,
      init: { body: string },
    ) => {
      expect(JSON.parse(init.body).reasoning).toBeUndefined();
      return okResponse("m");
    }) as unknown as typeof fetch);
    await call("z-ai/glm-5.3");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends the requested effort to the provider", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((async (
      _url: string,
      init: { body: string },
    ) => {
      expect(JSON.parse(init.body).reasoning).toEqual({ effort: "low" });
      return okResponse("z-ai/glm-5.3");
    }) as unknown as typeof fetch);
    await forcedToolCall("z-ai/glm-5.3", "system", "user", "pick", { type: "object" }, {
      logPrefix: "[test]",
      reasoning: "low",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the same effort after suffix fallback", async () => {
    stubFetch((model) => (model.includes(":") ? refusal() : okResponse(model)));
    const bodyModels: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (
      _url: string,
      init: { body: string },
    ) => {
      bodyModels.push(JSON.parse(init.body).reasoning);
      const model = JSON.parse(init.body).model as string;
      return model.includes(":") ? refusal() : okResponse(model);
    }) as unknown as typeof fetch);
    const out = await forcedToolCall("z-ai/glm-5.3:exacto", "system", "user", "pick", { type: "object" }, {
      logPrefix: "[test]",
      reasoning: "low",
    });
    expect(out).toEqual({ model: "z-ai/glm-5.3" });
    expect(bodyModels).toEqual([
      { effort: "low", exclude: false },
      { effort: "low", exclude: false },
    ]);
  });
});

describe("forcedToolCall log redaction", () => {
  const sentinel = "MIN591_PRIVATE_TOOL_ARGUMENT";

  async function expectRedacted(response: () => Response | Promise<Response>) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => response());
    expect(await call("openai/gpt-5")).toBeNull();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(sentinel);
  }

  it("does not log provider error bodies", async () => {
    await expectRedacted(() => ({
      ok: false, status: 400, text: async () => sentinel,
    }) as Response);
  });

  it("does not log response JSON syntax errors", async () => {
    await expectRedacted(() => ({
      ok: true, json: async () => { throw new SyntaxError(`Unexpected token ${sentinel}`); },
    }) as unknown as Response);
  });

  it("does not log tool argument syntax errors", async () => {
    await expectRedacted(() => ({
      ok: true,
      json: async () => ({ choices: [{ message: { tool_calls: [
        { function: { name: "pick", arguments: `{${sentinel}` } },
      ] } }] }),
    }) as unknown as Response);
  });

  it("does not log transport exception messages", async () => {
    await expectRedacted(() => { throw new Error(sentinel); });
  });

  it("does not log usage ledger exception messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse("openai/gpt-5"));
    vi.mocked(recordAiUsage).mockRejectedValueOnce(new Error(sentinel));
    expect(await forcedToolCall("openai/gpt-5", "system", "user", "pick",
      { type: "object" }, { logPrefix: "[test]", record: {
        feature: "feedback_classify", billTo: { userId: "user-id" },
      } })).toBeNull();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(sentinel);
  });
});
