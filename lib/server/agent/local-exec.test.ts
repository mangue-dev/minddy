import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-355 — ÉMETTRE UN JETON, C'EST RÉVOQUER LE PRÉCÉDENT.
 *
 * Un jeton auto-porteur ne se rappelle pas : il se périme. La seule révocation
 * possible est donc un compteur sur la ligne du run, et le geste qui l'incrémente
 * est l'émission elle-même. C'est ce qui fait de « une machine par run » une
 * propriété de la colonne plutôt qu'une règle que quelqu'un devrait tenir.
 */

const h = vi.hoisted(() => ({
  /** La ligne, réduite à ce que le bail regarde. `null` = run introuvable. */
  row: { local: true, gen: 0 } as { local: boolean; gen: number } | null,
}));

vi.mock("./runs", () => ({
  bumpLocalExecGen: vi.fn(async () => {
    if (!h.row?.local) return null;
    h.row.gen += 1;
    return h.row.gen;
  }),
}));

import { issueLocalExecToken } from "./local-exec";
import { resolveLocalExecSecret, verifyLocalExecToken } from "./local-exec-token";

const RUN_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  h.row = { local: true, gen: 0 };
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-key-de-test";
});

describe("le bail d'exécution locale", () => {
  it("rend un jeton que le plan de contrôle sait vérifier", async () => {
    const issued = await issueLocalExecToken(RUN_ID);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const verified = verifyLocalExecToken(issued.token, resolveLocalExecSecret()!);
    expect(verified).toMatchObject({ ok: true, runId: RUN_ID, gen: issued.gen });
  });

  it("périme le jeton précédent en émettant le suivant", async () => {
    const first = await issueLocalExecToken(RUN_ID);
    const second = await issueLocalExecToken(RUN_ID);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // La génération du premier n'est plus celle de la ligne : le plan de contrôle
    // la refusera à l'appel suivant, sans qu'on ait rien eu à rappeler.
    expect(second.gen).toBe(first.gen + 1);
    expect(h.row?.gen).toBe(second.gen);
  });

  it("refuse de donner un bail à un run de microVM", async () => {
    // Ce serait la bascule d'environnement à chaud que le mode figé interdit —
    // chaque environnement relit SA mémoire, et travaille sur SON dépôt.
    h.row = { local: false, gen: 0 };
    expect(await issueLocalExecToken(RUN_ID)).toEqual({ ok: false, error: "not_local" });
  });

  it("ne délivre rien quand le déploiement ne sait pas signer", async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect(await issueLocalExecToken(RUN_ID)).toEqual({ ok: false, error: "not_configured" });
      // Et la génération n'a pas bougé : on ne révoque pas la machine en place
      // pour un jeton qu'on n'a pas su fabriquer.
      expect(h.row?.gen).toBe(0);
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
    }
  });
});
