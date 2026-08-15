import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * MIN-293 — LE DÉCLENCHEUR DE TOUR LOCAL, exercé sur la vraie route.
 *
 * Ce qui est tenu ici est **l'ORDRE des gardes**, et ça ne se déduit d'aucun
 * type. Chacune protège quelque chose de différent, et une seule inversion suffit
 * à la rendre inopérante :
 *
 *  - un run refusé par sa NATURE (ancrage `pr`, webhook, routine, chaîne) ne doit
 *    jamais être claim : le claim le passe en `running`, et un run `running` que
 *    personne ne joue est un run mort jusqu'au chien de garde ;
 *  - un run BYOK ne doit jamais être claim non plus, pour la même raison ;
 *  - le BAIL est monté EN DERNIER, parce qu'émettre c'est révoquer : le monter
 *    avant la préparation tuerait un tour en cours pour découvrir ensuite qu'on
 *    ne sait pas en préparer un nouveau.
 *
 * `app/**` est hors du périmètre de `vitest.config.ts`, mais un test de `lib/`
 * peut aller le chercher — même doctrine que `local-exec-admission.test.ts`. Ne
 * sont moqués que les modules qui SORTENT du process : la base, la forge, la
 * préparation du tour.
 */

const h = vi.hoisted(() => ({
  run: null as Record<string, unknown> | null,
  claimed: true,
  prepares: true,
  calls: [] as string[],
}));

/**
 * **Le mint est une CONDITION D'EXISTENCE du chemin local**, pas un réglage :
 * sans `OPENROUTER_PROVISIONING_KEY`, la clé qui descendrait sur la machine
 * serait la clé plateforme — non plafonnée, partagée avec Numo, la transcription
 * et les embeddings. Le déploiement qui ne sait pas frapper de clé plafonnée
 * refuse le run, et le test le vérifie plus bas.
 */
process.env.OPENROUTER_PROVISIONING_KEY ||= "cle-de-provisioning-de-test";

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: vi.fn(async () => ({ ok: true as const, user: { id: "user-1" } })),
}));

vi.mock("@/lib/server/agent/run-access", () => ({
  canReadAgentRun: vi.fn(async () => true),
}));

vi.mock("@/lib/server/agent/runs", () => ({
  getRun: vi.fn(async () => h.run),
  claimRun: vi.fn(async () => {
    h.calls.push("claim");
    return h.claimed ? h.run : null;
  }),
}));

vi.mock("@/lib/server/agent/execute", () => ({
  executeAgentRun: vi.fn(
    async (
      _run: unknown,
      opts: { onLocalAssignment?: (job: unknown, meta: { repoFullName: string }) => void },
    ) => {
      h.calls.push("prepare");
      if (!h.prepares) return "failed";
      opts.onLocalAssignment?.({
        protocolVersion: 2,
        runId: "run-1",
        model: "anthropic/claude-sonnet-5",
        repoMode: "clone",
        authUrl: "https://x-access-token:ghs_x@github.com/mangue-dev/minddy.git",
      }, { repoFullName: "mangue-dev/minddy" });
      return "detached";
    },
  ),
}));

vi.mock("@/lib/server/agent/local-exec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/agent/local-exec")>();
  return {
    ...actual,
    issueLocalExecToken: vi.fn(async () => {
      h.calls.push("lease");
      return { ok: true as const, token: "bail.hs256", gen: 3, expiresInSeconds: 900 };
    }),
  };
});

async function POST(body: unknown) {
  const route = await import("@/app/api/desktop/local-turn/route");
  return route.POST(
    new NextRequest("https://minddy.test/api/desktop/local-turn", {
      method: "POST",
      headers: { origin: "https://minddy.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    project_id: "proj-1",
    created_by: "user-1",
    key_mode: "platform",
    status: "queued",
    local_exec: true,
    triggered_by: "chat",
    routine_id: null,
    chain_id: null,
    pull_request_id: null,
    ...over,
  };
}

beforeEach(() => {
  h.run = row();
  h.claimed = true;
  h.prepares = true;
  h.calls.length = 0;
});

describe("POST /api/desktop/local-turn", () => {
  it("rend l'affectation, bail compris, et dans le bon ordre", async () => {
    const response = await POST({ runId: "run-1" });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      runId: "run-1",
      projectId: "proj-1",
      repoFullName: "mangue-dev/minddy",
    });
    // Le bail voyage DANS le job, jamais à côté : un job local EST un job qui
    // porte un jeton (`isLocalJob`), et une seconde vérité finirait par diverger.
    expect(body.job.controlToken).toBe("bail.hs256");
    // Et le layout n'est PAS posé par le serveur — il ne connaît aucun chemin de
    // cette machine.
    expect(body.job).not.toHaveProperty("layout");

    // Émettre, c'est révoquer : le bail vient APRÈS la préparation.
    expect(h.calls).toEqual(["claim", "prepare", "lease"]);
  });

  it("rend une affectation que la COQUILLE sait lire — l'aller-retour complet", async () => {
    /**
     * Le test qui manquait, et qui aurait coûté moins cher qu'un essai en vrai.
     *
     * Les deux moitiés du contrat vivent dans deux mondes qui ne se compilent pas
     * ensemble : la route est du serveur, le parseur est celui de la coquille
     * (dont le type-graphe ne peut pas atteindre `vm/protocol.ts`). Rien, à part
     * ce test, ne dit qu'ils parlent de la même chose — et la première fois qu'ils
     * ont divergé, le refus disait « mets l'app à jour ».
     */
    const { parseLocalTurnAssignment } = await import("@/lib/desktop/local-turn");
    const body = await (await POST({ runId: "run-1" })).json();
    const parsed = parseLocalTurnAssignment(body);

    expect(parsed, "la coquille refuserait cette affectation").not.toBeNull();
    expect(parsed?.runId).toBe("run-1");
    expect(parsed?.repoFullName).toBe("mangue-dev/minddy");
    expect(parsed?.job.controlToken).toBe("bail.hs256");
  });

  it("refuse un run qui n'est pas local, SANS le claim", async () => {
    h.run = row({ local_exec: false });
    expect((await POST({ runId: "run-1" })).status).toBe(409);
    expect(h.calls).toEqual([]);
  });

  it("refuse un run à CONTEXTE TIERS avant tout claim", async () => {
    // Un run d'ancrage `pr`, de webhook, de routine ou de chaîne lit du texte
    // d'attaquant potentiel. En microVM, une injection coûte une VM jetable ; en
    // local, c'est un shell sur la machine du développeur.
    for (const over of [
      { pull_request_id: "pr-1" },
      { routine_id: "rt-1" },
      { chain_id: "ch-1" },
      { triggered_by: "mention" },
      { triggered_by: "automation" },
    ]) {
      h.calls.length = 0;
      h.run = row(over);
      expect((await POST({ runId: "run-1" })).status).toBe(409);
      expect(h.calls, JSON.stringify(over)).toEqual([]);
    }
  });

  it("refuse un run BYOK avant tout claim — il n'a littéralement aucun plafond", async () => {
    h.run = row({ key_mode: "byok" });
    const response = await POST({ runId: "run-1" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("byok");
    expect(h.calls).toEqual([]);
  });

  it("refuse quand ce déploiement ne sait pas frapper de clé plafonnée", async () => {
    // Dans une microVM jetable, la dégradation vers la clé plateforme est
    // assumée. Sur la machine de quelqu'un, cette clé-là est NON PLAFONNÉE et
    // partagée avec Numo, la transcription et les embeddings.
    const saved = process.env.OPENROUTER_PROVISIONING_KEY;
    delete process.env.OPENROUTER_PROVISIONING_KEY;
    try {
      const response = await POST({ runId: "run-1" });
      expect(response.status).toBe(409);
      expect((await response.json()).error).toContain("no_mint");
      expect(h.calls).toEqual([]);
    } finally {
      process.env.OPENROUTER_PROVISIONING_KEY = saved;
    }
  });

  it("ne monte AUCUN bail quand la préparation échoue", async () => {
    // Le contraire tuerait le tour précédent de ce run (émettre, c'est révoquer)
    // pour rendre un jeton que personne ne peut utiliser.
    h.prepares = false;
    expect((await POST({ runId: "run-1" })).status).toBe(409);
    expect(h.calls).toEqual(["claim", "prepare"]);
  });

  it("rend 409 quand le run n'était plus claimable — une autre machine a gagné", async () => {
    h.claimed = false;
    expect((await POST({ runId: "run-1" })).status).toBe(409);
    expect(h.calls).toEqual(["claim"]);
  });

  it("rend 404 sur un run inconnu, sans dire qu'il est inconnu", async () => {
    h.run = null;
    expect((await POST({ runId: "run-1" })).status).toBe(404);
  });

  it("refuse un corps sans identifiant", async () => {
    expect((await POST({})).status).toBe(400);
  });
});

/**
 * ET LA MOITIÉ SERVEUR DE LA MÊME DÉCISION : **le drain ne prend jamais un run
 * local.**
 *
 * Sans cette ligne, l'utilisateur demande sa machine, obtient le cloud, et rien
 * ne le lui dit — le défaut exact que ce chantier combat partout ailleurs. Lu
 * dans la SOURCE parce que la requête est une chaîne de `postgrest` : l'exercer
 * demanderait une base, et ce qui compte est qu'elle soit là.
 */
describe("le drain laisse les runs locaux à leur machine", () => {
  it("exclut `local_exec` de la file qu'il claim", () => {
    const source = readFileSync(join(__dirname, "drain.ts"), "utf8");
    expect(source).toContain('.not("local_exec", "is", true)');
  });
});

/**
 * ET LA BRANCHE D'`execute.ts`, lue dans la source pour la raison qu'explique
 * `engine-wiring.test.ts` : l'exercer demanderait une base, une forge, un
 * catalogue de modèles et une microVM. Ce qu'on tient ici est ce qui se
 * casserait en silence — une branche locale qui réveillerait quand même une
 * machine, ou qui lancerait la boucle au lieu de rendre l'affectation.
 */
describe("la préparation locale d'`execute.ts`", () => {
  const source = readFileSync(join(__dirname, "execute.ts"), "utf8");

  it("ne réveille aucune microVM sur un tour local", () => {
    expect(source).toContain("localTurn ? { sandbox: null } : await getOrCreateAgentSandbox(");
  });

  it("rend l'affectation au lieu de lancer la boucle", () => {
    const local = source.slice(source.indexOf("if (localTurn) {"));
    expect(local).toContain("opts.onLocalAssignment?.(assignment, { repoFullName: target.repoFullName })");
    // La boucle de microVM vient APRÈS, et n'est donc jamais atteinte.
    expect(local.indexOf("opts.onLocalAssignment?.(assignment, { repoFullName: target.repoFullName })")).toBeLessThan(
      local.indexOf("startVmLoop("),
    );
  });

  /**
   * ⚠ **LE DÉFAUT QUI A COÛTÉ UN TEST EN VRAI.**
   *
   * Le type de `onLocalAssignment` dit `Omit<VmJob, "layout" | "bootstrapMs">`,
   * et un `Omit<>` ne retire RIEN à l'exécution : l'objet portait toujours son
   * `layout: cloudLayout()`, et la machine recevait des chemins `/vercel/sandbox`.
   * La coquille l'a refusé — sa garde `"layout" in job` est là pour ça — mais le
   * message disait « mets l'app à jour », donc la faute a cherché au mauvais
   * endroit pendant tout un test.
   *
   * Un `Omit<>` sur une frontière RÉSEAU est une note d'intention, pas un
   * retrait. Ce qui le fait est ce `rest` de destructuration, et c'est lui qu'on
   * garde ici.
   */
  it("RETIRE le layout du cloud avant de rendre l'affectation", () => {
    expect(source).toContain("const { layout: _cloudLayout, ...assignment } = job;");
  });

  it("laisse le harness résoudre la baseline du diff qu'il est seul à connaître", () => {
    expect(source).toContain('const baselineHead = host ? await revParseHead(host) : "";');
  });

  it("n'écrit AUCUN nom de microVM sur la ligne d'un run local", () => {
    // `handleControlPlaneRequest` compare `sandbox_id` au nom signé de
    // l'appelant, et le chien de garde interroge la plateforme sur ce nom-là :
    // une valeur inventée ferait mentir les deux.
    expect(source).toContain("...(sandbox ? { sandbox_id: sandboxName(sandbox)");
  });

  it("prépare en parallèle les lectures qui précèdent le job local", () => {
    // Ces opérations ne dépendent pas les unes des autres. Elles doivent être
    // lancées avant d'attendre la cible, sinon chaque aller-retour rallonge le
    // délai qui sépare l'envoi du premier token.
    const prepareAt = source.indexOf("const targetPromise = resolveRepoCloneTarget(run.project_id);");
    const endpointAt = source.indexOf("const endpointPromise = resolveAgentApiKey(run.created_by);");
    const targetAwaitAt = source.indexOf("const target = await targetPromise;");
    expect(prepareAt).toBeGreaterThan(-1);
    expect(endpointAt).toBeGreaterThan(prepareAt);
    expect(targetAwaitAt).toBeGreaterThan(endpointAt);
    expect(source).toContain("const [issue, prRun, prefs, quotaAndLedger, endpoint] = await Promise.all([");
  });

  it("réutilise le jeton de la cible pour un tour local", () => {
    // Les runs locaux ne peuvent pas être des relectures : leur scope est validé
    // avant le claim. Une seconde résolution de jeton ne change donc pas leurs
    // droits et ajoute seulement une attente au lancement.
    expect(source).toContain("const vmTarget = localTurn\n      ? target");
  });

  it("ne minte pas de clé fournisseur avant de rendre un job local", () => {
    expect(source).toContain('if (keyMode === "platform" && !localTurn)');
  });

  it("rend l'identité du dépôt avec l'affectation sans la résoudre une seconde fois", () => {
    expect(source).toContain("{ repoFullName: target.repoFullName }");
  });

  it("recouvre l'event de démarrage et ne publie pas de sandbox cloud en local", () => {
    expect(source).toContain("if (!localTurn) await runningEvent");
    expect(source).toContain('if (sandbox) await emit("status", { phase: "sandbox_ready" })');
    const localStart = source.indexOf("if (localTurn) {");
    const local = source.slice(localStart, source.indexOf("if (!sandbox) throw", localStart));
    expect(local).not.toContain("last_activity_at: new Date().toISOString()");
  });

  it("ne recharge pas les ressources du ticket pour une reprise opencode", () => {
    // La mémoire du tour local vit dans SQLite : le prompt d'amorce n'est pas
    // reconstruit, donc ses ressources ne doivent pas retarder le steering.
    expect(source).toContain("includePromptContext: !run.checkpoint?.opencode?.sessionId");
    expect(source).toContain("includePromptContext\n      ? service");
    expect(source).toContain("Promise.resolve({ data: [] })");
  });
});
