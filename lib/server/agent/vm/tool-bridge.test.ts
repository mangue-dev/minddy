import { describe, expect, it } from "vitest";

import { startToolBridge, type ToolBridge } from "./tool-bridge";
import { DOMAIN_TOOL_NAMES } from "./opencode-tools";
import type { OpencodeDelivery } from "./opencode-delivery";
import type { ControlPlaneClient } from "./control-plane-client";
import type { VmJob } from "./protocol";

/**
 * MIN-286 lot 2 — the tools bridge, and first of all what it exists for: the
 * TOUR web search ceiling.
 *
 * The test mounts the REAL server (localhost, free port) and only calls via
 * HTTP, exactly as it will do the tool generated in the microVM. This is the only form that proves what matters: that the cap holds on the other side of the network, that the denial comes to the model as a readable tool result, and that no denied searches were paid for.
 */

const calls: Array<{ name: string; body: Record<string, unknown> }> = [];

function cp(over: Partial<ControlPlaneClient> = {}): ControlPlaneClient {
  return {
    callTool: async (name, body) => {
      calls.push({ name, body });
      return { result: { answer: `réponse à ${JSON.stringify(body.args)}` }, success: true };
    },
    ...over,
  } as ControlPlaneClient;
}

function job(over: Partial<VmJob> = {}): VmJob {
  return {
    webSearch: true,
    webSearchMax: 5,
    imageInput: false,
    prInlineComments: 0,
    ...over,
  } as VmJob;
}

/** What a generated tool does: it posts, it reads the text, it returns it to the model. */
async function call(
  bridge: ToolBridge,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ status: number; body: string }> {
  const res = await fetch(`${bridge.url}/tool/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ args, callID: "call_1", sessionID: "ses_1" }),
  });
  return { status: res.status, body: await res.text() };
}

/** Raise the bridge, play the scenario, close — one port opened per test, no more. */
async function withBridge(
  opts: {
    job?: VmJob;
    cp?: ControlPlaneClient;
    supervisorTools?: Record<string, never>;
    delivery?: OpencodeDelivery;
    onToolRefused?: (callId: string, reason: string) => void;
  },
  body: (bridge: ToolBridge) => Promise<void>,
): Promise<void> {
  calls.length = 0;
  const bridge = await startToolBridge({
    job: opts.job ?? job(),
    cp: opts.cp ?? cp(),
    port: 0,
    ...(opts.supervisorTools ? { supervisorTools: opts.supervisorTools } : {}),
    ...(opts.delivery ? { delivery: opts.delivery } : {}),
    ...(opts.onToolRefused ? { onToolRefused: opts.onToolRefused } : {}),
  });
  try {
    await body(bridge);
  } finally {
    await bridge.close();
  }
}

describe("recherche web — le plafond du tour", () => {
  it("laisse passer les cinq premières, refuse la sixième sans la payer", async () => {
    await withBridge({}, async (bridge) => {
      for (let i = 0; i < 5; i++) {
        const res = await call(bridge, "web_search", { query: `q${i}` });
        expect(res.status).toBe(200);
        expect(res.body).toContain("réponse à");
      }
      const refused = await call(bridge, "web_search", { query: "q5" });

      // The refusal is a RESULT of tool, readable by the model: this is what
      // makes him work with what he has rather than searching in circles.
      expect(refused.status).toBe(200);
      expect(JSON.parse(refused.body).error).toContain("Web search limit reached for this turn (5");
      // And above all: the sixth NEVER reached the control plane, so
      // no Exa package ($0.005) was charged for her.
      expect(calls.filter((c) => c.name === "web_search")).toHaveLength(5);
      expect(bridge.webSearchesUsed).toBe(5);
    });
  });

  it("numérote chaque recherche, pour que deux ne se rangent pas sous un seul seq", async () => {
    await withBridge({}, async (bridge) => {
      await call(bridge, "web_search", { query: "a" });
      await call(bridge, "web_search", { query: "b" });
      expect(calls.map((c) => c.body.args)).toEqual([
        { query: "a", seq: 0 },
        { query: "b", seq: 1 },
      ]);
    });
  });

  it("suit le plafond du JOB, pas une constante recopiée ici", async () => {
    // The number travels in the job (`webSearchMax`) because `web-search.ts`
    // holds a Supabase client as a service key, which does not enter the VM.
    await withBridge({ job: job({ webSearchMax: 1 }) }, async (bridge) => {
      await call(bridge, "web_search", { query: "a" });
      const refused = await call(bridge, "web_search", { query: "b" });
      expect(JSON.parse(refused.body).error).toContain("(1 searches)");
    });
  });

  it("refuse et ne paie rien quand le run n'a pas le web", async () => {
    await withBridge({ job: job({ webSearch: false }) }, async (bridge) => {
      const res = await call(bridge, "web_search", { query: "a" });
      expect(JSON.parse(res.body).error).toContain("not available");
      expect(calls).toHaveLength(0);
    });
  });
});

describe("le passe-plat, et les états de tour qui l'accompagnent", () => {
  it("envoie `imageInput` et le compteur d'ancres, et relit celui que la fonction rend", async () => {
    let inline = 0;
    const client = cp({
      callTool: async (name, body) => {
        calls.push({ name, body });
        inline += 1;
        return { result: { ok: true }, success: true, inlineUsed: inline };
      },
    });
    await withBridge({ job: job({ imageInput: true }), cp: client }, async (bridge) => {
      await call(bridge, "comment_pr_line", { body: "x" });
      await call(bridge, "comment_pr_line", { body: "y" });
      // The ceiling of the 5 anchors is counted over the life of the RUN: the function makes the
      // account reached, and it is he who starts again on the next call.
      expect(calls[1].body.prInlineComments).toBe(1);
      expect(calls[1].body.imageInput).toBe(true);
      expect(bridge.prInlineComments).toBe(2);
    });
  });

  it("rend l'erreur du plan de contrôle au modèle plutôt que de casser le round", async () => {
    const client = cp({
      callTool: async () => {
        throw new Error("409: run is no longer running");
      },
    });
    await withBridge({ cp: client }, async (bridge) => {
      const res = await call(bridge, "read_issue", { identifier: "MIN-42" });
      // 200: the generated tool renders the body as is to the model. A 5xx would make him
      // render “could not reach the harness”, which hides the real motive.
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body).error).toContain("409");
    });
  });

  it("route tous les tools de domaine — un servi et non routé est notre défaut", async () => {
    await withBridge({}, async (bridge) => {
      for (const name of DOMAIN_TOOL_NAMES) {
        // `create_pr` is the only one not to be a hatch: it is cut into
        // two (the VM pushes, the function opens) and it only has a handler on one
        // session that writes. Without it it is refused, never transmitted as is:
        // it would open a pull request on a branch that no one has pushed.
        const res = await call(bridge, name, {});
        expect(res.status).toBe(200);
      }
      expect(calls.some((c) => c.name === "create_pr")).toBe(false);
    });
  });

  /**
 * MIN-286 batch 3 — `run_background` is a LOCAL tool: it NEVER leaves the
 * microVM. The bridge executes it (the job register lives in the supervisor) at
 * instead of forwarding it — a `run_background` which would reach the control plane would ask it to launch a server it does not have.
 */
  it("exécute `run_background` dans la VM, sans jamais l'envoyer au plan de contrôle", async () => {
    const seen: Array<Record<string, unknown>> = [];
    await withBridge(
      {
        supervisorTools: {
          run_background: (async (args: Record<string, unknown>) => {
            seen.push(args);
            return { result: { job_id: "bg-1", pid: 42 }, success: true };
          }) as never,
        },
      },
      async (bridge) => {
        const res = await call(bridge, "run_background", { action: "start", command: "npm run dev" });
        expect(res.status).toBe(200);
        expect(JSON.parse(res.body).job_id).toBe("bg-1");
      },
    );
    expect(seen).toEqual([{ action: "start", command: "npm run dev" }]);
    expect(calls.some((c) => c.name === "run_background")).toBe(false);
  });

  it("refuse `run_background` sans handler plutôt que de le transmettre", async () => {
    // The case of a REREADING session: the tool is not generated, therefore the call
    // comes from a file left over from a previous tour. 200 + `error`: the model
    // read and do otherwise.
    await withBridge({}, async (bridge) => {
      const res = await call(bridge, "run_background", { action: "start", command: "sleep 1" });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body).error).toContain("not available");
      expect(calls.some((c) => c.name === "run_background")).toBe(false);
    });
  });

  it("répond 404 sur un nom inconnu, qui ne doit pas se rattraper en silence", async () => {
    await withBridge({}, async (bridge) => {
      const res = await call(bridge, "tool_qui_nexiste_pas");
      expect(res.status).toBe(404);
    });
  });

  /**
 * MIN-286 lot 2, task 14 — THE VOICE OF THE HARNESS COMES TO THE MODEL.
 *
 * What the house loop served as a message `user` after the round leaves here
 * in the TEXT that the tool renders: at opencode it there is no message to
 * insert, and a `followUp` that would remain in a JSON key that no one reads would be a check executed for nothing.
 */
  it("colle le followUp du harness après le résultat, dans le texte rendu au modèle", async () => {
    const delivery = {
      wrapDomainTool:
        (handler: (name: string, args: Record<string, unknown>) => Promise<unknown>) =>
        async (name: string, args: Record<string, unknown>) => ({
          ...((await handler(name, args)) as { result: unknown; success: boolean }),
          followUp: "LE BLOC DU HARNESS",
        }),
      wrapCreatePr: (h: unknown) => h,
    } as unknown as OpencodeDelivery;

    await withBridge({ delivery }, async (bridge) => {
      const res = await call(bridge, "read_issue", { identifier: "MIN-42" });
      const [body, followUp] = res.body.split("\n\n");
      expect(JSON.parse(body).answer).toContain("réponse à");
      expect(followUp).toBe("LE BLOC DU HARNESS");
    });
  });

  it("laisse `create_pr` refusé quand il n'a pas de handler, sans lui poser de porte", async () => {
    // Returning the controls to deny right after would tell the model that it has
    // delivered when nothing has been pushed — the case of a proofreading session,
    // which has neither writing tool nor push.
    let gated = false;
    const delivery = {
      wrapDomainTool: (h: unknown) => h,
      wrapCreatePr: (h: unknown) => {
        gated = true;
        return h;
      },
    } as unknown as OpencodeDelivery;

    await withBridge({ delivery }, async (bridge) => {
      const res = await call(bridge, "create_pr", { title: "t" });
      expect(JSON.parse(res.body).error).toContain("not available");
      expect(gated).toBe(false);
    });
  });

  it("keeps `create_pr` focused on publishing", async () => {
    const delivery = {
      wrapDomainTool: (h: unknown) => h,
      wrapValidateChanges: (h: unknown) => h,
    } as unknown as OpencodeDelivery;
    let pushed = false;

    await withBridge(
      {
        delivery,
        supervisorTools: {
          create_pr: (async () => {
            pushed = true;
            return { result: { url: "https://pr" }, success: true };
          }) as never,
        },
      },
      async (bridge) => {
        const res = await call(bridge, "create_pr", { title: "t" });
        expect(JSON.parse(res.body)).toEqual({ url: "https://pr" });
        expect(pushed).toBe(true);
      },
    );
  });

  it("routes explicit validation through the delivery checks", async () => {
    const delivery = {
      wrapDomainTool: (h: unknown) => h,
      wrapValidateChanges: (h: unknown) =>
        async () => ({
          result: (await (h as () => Promise<{ result: unknown }>)()).result,
          success: true,
          followUp: "VALIDATION",
        }),
    } as unknown as OpencodeDelivery;

    await withBridge(
      {
        delivery,
        supervisorTools: {
          validate_changes: (async () => ({ result: { validated: true }, success: true })) as never,
        },
      },
      async (bridge) => {
        const res = await call(bridge, "validate_changes");
        expect(res.body).toContain("VALIDATION");
      },
    );
  });

  it("préfère le tool du superviseur au passe-plat", async () => {
    await withBridge(
      {
        supervisorTools: {
          create_pr: (async () => ({ result: { url: "https://pr" }, success: true })) as never,
        },
      },
      async (bridge) => {
        const res = await call(bridge, "create_pr", { title: "t" });
        expect(JSON.parse(res.body)).toEqual({ url: "https://pr" });
        expect(calls).toHaveLength(0);
      },
    );
  });
});

/**
 * MIN-286 lot 3 — THE IMAGES, the last parity that the bridge had lost.
 *
 * The bridge responds with text, and a model that receives text reads the sign
 * of a model instead of looking at it. What these tests fix,
 * is the contract measured on `opencode-ai@1.18.16` (file §2.22): when the
 * control plane renders images, the response becomes an ENVELOPE announced
 * by its header, and the generated tool renders it as `{output, attachments}` —
 * that opencode republishes in part `image_url` of a message posted after the round.
 */
describe("images — l'enveloppe de pièces jointes", () => {
  const withImage = (): ControlPlaneClient =>
    cp({
      callTool: async (name, body) => {
        calls.push({ name, body });
        return {
          result: { name: "maquette.png", mime: "image/png", bytes: 12 },
          success: true,
          images: [{ url: "data:image/png;base64,AAAA", name: "maquette.png" }],
        };
      },
    } as Partial<ControlPlaneClient>);

  it("annonce l'image par son en-tête et la rend en pièce jointe", async () => {
    await withBridge({ cp: withImage(), job: job({ imageInput: true }) }, async (bridge) => {
      const res = await fetch(`${bridge.url}/tool/read_resource`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ args: { resource_id: "r1" } }),
      });
      expect(res.headers.get("x-minddy-attachments")).toBe("1");

      const envelope = JSON.parse(await res.text());
      // The TEXT does not change: the MSDS remains what the model
      // reads, the image is added. A thread therefore tells the same thing as before.
      expect(JSON.parse(envelope.output)).toEqual({
        name: "maquette.png",
        mime: "image/png",
        bytes: 12,
      });
      // The exact form of `ToolAttachment` of @opencode-ai/plugin, mime reread
      // on the data URL rather than assumed.
      expect(envelope.attachments).toEqual([
        {
          type: "file",
          mime: "image/png",
          url: "data:image/png;base64,AAAA",
          filename: "maquette.png",
        },
      ]);
    });
  });

  it("ne pose ni en-tête ni enveloppe quand le tool ne rend pas d'image", async () => {
    await withBridge({}, async (bridge) => {
      const res = await fetch(`${bridge.url}/tool/read_issue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ args: {} }),
      });
      expect(res.headers.get("x-minddy-attachments")).toBeNull();
      // The body is the NU result, as before: this is what the tool generated
      // render as is to the model.
      expect(JSON.parse(await res.text())).toHaveProperty("answer");
    });
  });
});

/**
 * MIN-286 — THE REASON FOR REFUSAL OF THE HARNESS IS UP.
 *
 * `run_background` is a LOCAL tool: when `checkCommand` rejects a `git push`
 * (MIN-108), the pattern (`forbidden_command`) is what makes the denial MEASURABLE on
 * `agent_run_events` — the home loop was relying on its `tool_result`. The bridge
 * only constructed its response from the result and the `followUp`: the pattern
 * was lost between the job register and the thread, and the refusals became
 * invisible in base.
 */
describe("le motif d'un refus", () => {
  it("remonte au superviseur avec le `callID` de l'appel", async () => {
    const refused: Array<{ callId: string; reason: string }> = [];
    await withBridge(
      {
        onToolRefused: (callId, reason) => refused.push({ callId, reason }),
        supervisorTools: {
          run_background: (async () => ({
            result: { error: "git push is not allowed" },
            success: false,
            reason: "forbidden_command",
          })) as never,
        },
      },
      async (bridge) => {
        const res = await call(bridge, "run_background", { command: "git push" });
        // The model reads the pattern clearly — the answer does not change.
        expect(res.status).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ error: "git push is not allowed" });
      },
    );
    expect(refused).toEqual([{ callId: "call_1", reason: "forbidden_command" }]);
  });

  it("ne dit rien d'un appel qui a réussi", async () => {
    const refused: string[] = [];
    await withBridge(
      { onToolRefused: (_callId, reason) => refused.push(reason) },
      async (bridge) => {
        await call(bridge, "read_issue", {});
      },
    );
    expect(refused).toEqual([]);
  });
});
