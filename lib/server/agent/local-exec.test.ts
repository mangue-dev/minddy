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

import { admitLocalRun, issueLocalExecToken } from "./local-exec";
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

/**
 * MIN-357 — CE QUI N'A PAS DE PLAFOND RESTE DANS LE CLOUD.
 *
 * Les deux refus ne se ressemblent pas : `byok` est structurel (l'API de
 * provisioning n'émet que sur le compte qui détient la clé de provisioning), et
 * `no_mint` est une propriété du déploiement. Ce qu'ils partagent, c'est la
 * conduite : basculer dans le cloud, jamais déplafonner.
 */
describe("qui a le droit de jouer sur la machine de l'utilisateur", () => {
  const withProvisioning = <T,>(value: string | undefined, run: () => T): T => {
    const saved = process.env.OPENROUTER_PROVISIONING_KEY;
    if (value === undefined) delete process.env.OPENROUTER_PROVISIONING_KEY;
    else process.env.OPENROUTER_PROVISIONING_KEY = value;
    try {
      return run();
    } finally {
      if (saved === undefined) delete process.env.OPENROUTER_PROVISIONING_KEY;
      else process.env.OPENROUTER_PROVISIONING_KEY = saved;
    }
  };

  it("laisse partir un run plateforme sur un déploiement qui sait plafonner", () => {
    withProvisioning("sk-or-prov-de-test", () => {
      expect(admitLocalRun({ keyMode: "platform" })).toEqual({ ok: true });
    });
  });

  it("garde un run BYOK dans le cloud, même quand le mint est disponible", () => {
    // La clé de l'utilisateur est sur SON compte : on ne peut rien plafonner, et
    // le compute de microVM — le dernier garde-fou — vaut zéro sur une machine.
    withProvisioning("sk-or-prov-de-test", () => {
      expect(admitLocalRun({ keyMode: "byok" })).toEqual({ ok: false, reason: "byok" });
    });
  });

  it("garde tout le monde dans le cloud quand rien ne sait minter", () => {
    // Sans mint, l'appelant retomberait sur la clé plateforme — NON PLAFONNÉE, et
    // partagée avec Numo, la transcription, les embeddings et le catalogue.
    withProvisioning(undefined, () => {
      expect(admitLocalRun({ keyMode: "platform" })).toEqual({ ok: false, reason: "no_mint" });
    });
    // Une variable posée à VIDE compte comme absente — c'est déjà la règle de
    // `runKeyMintingEnabled`, et deux lectures qui divergeraient là-dessus
    // donneraient un run local sans clé.
    withProvisioning("   ", () => {
      expect(admitLocalRun({ keyMode: "platform" })).toEqual({ ok: false, reason: "no_mint" });
    });
  });
});
