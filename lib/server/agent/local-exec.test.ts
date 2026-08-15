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
  /** D'OÙ VIENT LE CONTEXTE DU RUN (MIN-360) — ce que le second rideau relit. */
  scope: {
    triggered_by: "button",
    routine_id: null,
    chain_id: null,
    pull_request_id: null,
  } as {
    triggered_by: string | null;
    routine_id: string | null;
    chain_id: string | null;
    pull_request_id: string | null;
  } | null,
}));

vi.mock("./runs", () => ({
  bumpLocalExecGen: vi.fn(async () => {
    if (!h.row?.local) return null;
    h.row.gen += 1;
    return h.row.gen;
  }),
  runLocalExecScopeRow: vi.fn(async () => h.scope),
}));

import { admitLocalRun, issueLocalExecToken } from "./local-exec";
import { resolveLocalExecSecret, verifyLocalExecToken } from "./local-exec-token";

const RUN_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  h.row = { local: true, gen: 0 };
  h.scope = { triggered_by: "button", routine_id: null, chain_id: null, pull_request_id: null };
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

  /**
   * MIN-360 — LE SECOND RIDEAU, À L'ENDROIT QUI COMPTE.
   *
   * `createRun` est le seul écrivain de `local_exec` et applique déjà
   * l'invariant. Ce contrôle-ci est ce qui fait que **sans jeton, aucune machine
   * ne peut jouer ce run** : une colonne écrite par une migration, un
   * back-office ou un chemin de lancement futur ne suffit pas à ouvrir la porte.
   */
  it("refuse un bail à un run dont le contexte vient d'ailleurs", async () => {
    for (const scope of [
      { pull_request_id: "pr-1" },
      { routine_id: "r-1" },
      { chain_id: "c-1" },
      { triggered_by: "mention" },
    ]) {
      h.scope = {
        triggered_by: "button",
        routine_id: null,
        chain_id: null,
        pull_request_id: null,
        ...scope,
      };
      expect(await issueLocalExecToken(RUN_ID)).toEqual({
        ok: false,
        error: "third_party_context",
      });
      // Et le bail précédent n'a pas été révoqué au passage : on refuse AVANT
      // d'incrémenter, sinon un refus casserait la machine en place.
      expect(h.row?.gen).toBe(0);
    }
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
 * Le BYOK local est interactif ; les contextes non surveillés sont exclus plus
 * tôt par `localRunScope`. La plateforme garde son exigence de mint.
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

  it("laisse partir un BYOK sans exiger le mint ni un plafond", () => {
    expect(admitLocalRun({ keyMode: "byok" })).toEqual({ ok: true });
  });

  it("garde les runs plateforme dans le cloud quand rien ne sait minter", () => {
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
