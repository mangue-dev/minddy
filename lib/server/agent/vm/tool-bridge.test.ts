import { describe, expect, it } from "vitest";

import { startToolBridge, type ToolBridge } from "./tool-bridge";
import { DOMAIN_TOOL_NAMES } from "./opencode-tools";
import type { ControlPlaneClient } from "./control-plane-client";
import type { VmJob } from "./protocol";

/**
 * MIN-286 lot 2 — le pont de tools, et d'abord ce pour quoi il existe : le
 * plafond de recherches web du TOUR.
 *
 * Le test monte le VRAI serveur (localhost, port libre) et n'appelle que par
 * HTTP, exactement comme le fera le tool généré dans la microVM. C'est la seule
 * forme qui prouve ce qui compte : que le plafond tient de l'autre côté du
 * réseau, que le refus arrive au modèle comme un résultat de tool lisible, et
 * qu'aucune recherche refusée n'a été payée.
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

/** Ce qu'un tool généré fait : il poste, il lit le texte, il le rend au modèle. */
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

/** Monte le pont, joue le scénario, referme — un port ouvert par test, pas plus. */
async function withBridge(
  opts: { job?: VmJob; cp?: ControlPlaneClient; supervisorTools?: Record<string, never> },
  body: (bridge: ToolBridge) => Promise<void>,
): Promise<void> {
  calls.length = 0;
  const bridge = await startToolBridge({
    job: opts.job ?? job(),
    cp: opts.cp ?? cp(),
    port: 0,
    ...(opts.supervisorTools ? { supervisorTools: opts.supervisorTools } : {}),
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

      // Le refus est un RÉSULTAT de tool, lisible par le modèle : c'est ce qui
      // lui fait travailler avec ce qu'il a plutôt que de rechercher en rond.
      expect(refused.status).toBe(200);
      expect(JSON.parse(refused.body).error).toContain("Web search limit reached for this turn (5");
      // Et surtout : la sixième n'a JAMAIS atteint le plan de contrôle, donc
      // aucun forfait Exa (0,005 $) n'a été facturé pour elle.
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
    // Le chiffre voyage dans le job (`webSearchMax`) parce que `web-search.ts`
    // tient un client Supabase en clé de service, qui n'entre pas dans la VM.
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
      // Le plafond des 5 ancres se compte sur la vie du RUN : la fonction rend le
      // compte atteint, et c'est lui qui repart au prochain appel.
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
      // 200 : le tool généré rend le corps tel quel au modèle. Un 5xx lui ferait
      // rendre « could not reach the harness », qui masque le vrai motif.
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body).error).toContain("409");
    });
  });

  it("route tous les tools de domaine — un servi et non routé est notre défaut", async () => {
    await withBridge({}, async (bridge) => {
      for (const name of DOMAIN_TOOL_NAMES) {
        // `create_pr` est le seul à ne pas être un passe-plat : il est coupé en
        // deux (la VM pousse, la fonction ouvre) et attend son handler (lot 2,
        // tâche 15). Refusé, donc, mais jamais transmis tel quel : il ouvrirait
        // une pull request sur une branche que personne n'a poussée.
        const res = await call(bridge, name, {});
        expect(res.status).toBe(200);
      }
      expect(calls.some((c) => c.name === "create_pr")).toBe(false);
    });
  });

  it("répond 404 sur un nom inconnu, qui ne doit pas se rattraper en silence", async () => {
    await withBridge({}, async (bridge) => {
      const res = await call(bridge, "tool_qui_nexiste_pas");
      expect(res.status).toBe(404);
    });
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
