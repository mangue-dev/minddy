import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LES TROIS GARDES DE MIN-346.
 *
 * L'enregistrement dynamique de client est ouvert : tout ce qui suit est
 * piloté par un attaquant. D'où trois questions, et une seule réponse
 * acceptable à chacune.
 *
 * 1. Un paramètre de protocole invalide envoie-t-il l'utilisateur chez le
 *    client ? Non — sinon minddy est un redirecteur ouvert permanent sous son
 *    propre domaine, déclenchable par une simple URL.
 * 2. Un refresh token présenté par un AUTRE client est-il échangé ? Non — le
 *    token est lié au client qui l'a obtenu.
 * 3. La purge DCR peut-elle supprimer un client actif quand la liste des
 *    grants dépasse une page ? Non — et c'est le cas qui la faisait détruire
 *    des autorisations vivantes, sans rien dire.
 */

interface Row extends Record<string, unknown> {}

let db: Record<string, Row[]> = {};
/** Les UPDATE réellement partis (table + valeurs) — un refus rendu APRÈS
    l'écriture n'aurait rien refusé. */
let updateLog: Array<{ table: string; values: Row }> = [];

function makeQuery(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let mode: "select" | "update" = "select";
  let payload: Row = {};
  let range: { from: number; to: number } | null = null;

  const matching = () => {
    const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    return range ? rows.slice(range.from, range.to + 1) : rows;
  };

  const run = () => {
    if (mode === "update") {
      const matched = matching();
      if (matched.length > 0) updateLog.push({ table, values: payload });
      matched.forEach((r) => Object.assign(r, payload));
      return { data: matched.map((r) => ({ ...r })), error: null };
    }
    return { data: matching().map((r) => ({ ...r })), error: null };
  };

  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return q;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val);
      return q;
    },
    gt: (col: string, val: string) => {
      filters.push((r) => String(r[col] ?? "") > val);
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return q;
    },
    lt: (col: string, val: string) => {
      filters.push((r) => String(r[col] ?? "") < val);
      return q;
    },
    limit: () => q,
    range: (from: number, to: number) => {
      range = { from, to };
      return q;
    },
    update: (values: Row) => {
      mode = "update";
      payload = values;
      return q;
    },
    maybeSingle: async () => {
      const result = run();
      return { data: (result.data as Row[])[0] ?? null, error: null };
    },
    then: (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(run()).then(onFulfilled),
  });
  return q;
}

const service = { from: (table: string) => makeQuery(table) };

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (fn: () => Promise<void>) => void fn(),
}));

/** Le client que `validateAuthorizeRequest` ira chercher en base. */
let registeredClient: {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: string;
} | null = null;

vi.mock("@/lib/server/oauth/clients", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getClient: async (id: unknown) =>
    registeredClient && id === registeredClient.client_id ? registeredClient : null,
}));

const { validateAuthorizeRequest } = await import(
  "@/lib/server/oauth/authorize-validation"
);
const { rotateRefreshToken, handleRefreshReuse } = await import(
  "@/lib/server/oauth/grants"
);
const { selectClientsWithoutGrants } = await import("@/lib/server/oauth/clients");
const { sha256Hex } = await import("@/lib/server/oauth/crypto");
const { getClientIp } = await import("@/lib/server/request-ip");

const ORIGIN = "https://www.minddy.app";
const CALLBACK = "https://evil.example.com/callback";
// base64url(sha256) = 43 caractères.
const CHALLENGE = "a".repeat(43);

beforeEach(() => {
  db = {};
  updateLog = [];
  registeredClient = {
    client_id: "cli_attacker",
    client_name: "Claude",
    redirect_uris: [CALLBACK],
    created_at: "2026-01-01T00:00:00+00:00",
  };
});

describe("requête d'autorisation : aucune redirection sur erreur de protocole", () => {
  const base = {
    client_id: "cli_attacker",
    redirect_uri: CALLBACK,
    response_type: "code",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "xyz",
  };

  it("accepte une requête conforme", async () => {
    const v = await validateAuthorizeRequest(base, ORIGIN);
    expect(v.kind).toBe("ok");
  });

  /**
   * Le cœur du ticket : chacun de ces paramètres se pose dans l'URL, sans
   * rien connaître de l'utilisateur. Si l'un d'eux produisait une redirection,
   * `https://www.minddy.app/oauth/authorize?…` deviendrait un aller simple
   * vers l'adresse de l'attaquant, sous notre nom et notre certificat.
   */
  it.each([
    ["response_type", { ...base, response_type: "token" }],
    ["code_challenge_method", { ...base, code_challenge_method: "plain" }],
    ["code_challenge absent", { ...base, code_challenge: undefined }],
    ["code_challenge hors gabarit", { ...base, code_challenge: "trop-court" }],
    ["scope", { ...base, scope: "admin" }],
    ["resource", { ...base, resource: "https://evil.example.com/api/mcp" }],
  ])("refuse sur place : %s", async (_label, params) => {
    const v = await validateAuthorizeRequest(params, ORIGIN);
    expect(v.kind).toBe("invalid");
    // Le verdict ne PORTE même pas d'URI de redirection : il n'y a rien à
    // suivre, par construction.
    expect(JSON.stringify(v)).not.toContain("evil.example.com");
  });

  it("refuse le client inconnu et l'URI non enregistrée", async () => {
    expect(
      (await validateAuthorizeRequest({ ...base, client_id: "cli_ghost" }, ORIGIN)).kind
    ).toBe("invalid");
    expect(
      (
        await validateAuthorizeRequest(
          { ...base, redirect_uri: "https://elsewhere.example.com/cb" },
          ORIGIN
        )
      ).kind
    ).toBe("invalid");
  });
});

describe("refresh token lié à son client", () => {
  const TOKEN = "mdyrt_secret";
  const FUTURE = new Date(Date.now() + 3600_000).toISOString();

  beforeEach(() => {
    db.oauth_grants = [
      {
        id: "grant-1",
        client_id: "cli_legit",
        user_id: "user-1",
        api_key_id: "key-1",
        scope: "minddy",
        refresh_token_hash: sha256Hex(TOKEN),
        refresh_token_expires_at: FUTURE,
        prev_refresh_token_hash: null,
        revoked_at: null,
      },
    ];
  });

  it("échange le token pour le client qui l'a obtenu", async () => {
    const pair = await rotateRefreshToken(TOKEN, "cli_legit");
    expect(pair?.scope).toBe("minddy");
  });

  it("refuse le même token présenté par un autre client", async () => {
    expect(await rotateRefreshToken(TOKEN, "cli_attacker")).toBeNull();
    // Et surtout : la ligne n'a pas bougé. Un refus qui aurait quand même
    // rotationné le token déconnecterait le client légitime.
    expect(updateLog).toHaveLength(0);
    expect(db.oauth_grants[0].refresh_token_hash).toBe(sha256Hex(TOKEN));
  });

  it("la révocation sur rejeu reste chez le client concerné", async () => {
    db.oauth_grants[0].prev_refresh_token_hash = sha256Hex("mdyrt_old");
    expect(await handleRefreshReuse("mdyrt_old", "cli_attacker")).toBe(false);
    expect(db.oauth_grants[0].revoked_at ?? null).toBeNull();

    expect(await handleRefreshReuse("mdyrt_old", "cli_legit")).toBe(true);
    expect(db.oauth_grants[0].revoked_at).toBeTruthy();
  });
});

describe("purge DCR : ne supprimer que ce qu'on a lu en entier", () => {
  /** Un client actif dont les grants tombent au-delà de la première page. */
  it("ne condamne pas un client dont les grants dépassent la page", async () => {
    const candidates = ["cli_a", "cli_b"];
    // 1000 grants de cli_a (une page pleine), puis le seul grant de cli_b.
    const grants = [
      ...Array.from({ length: 1000 }, () => "cli_a"),
      "cli_b",
    ];
    const doomed = await selectClientsWithoutGrants(candidates, async (_ids, from, to) => ({
      clientIds: grants.slice(from, to + 1),
    }));
    expect(doomed).toEqual([]);
  });

  it("condamne les candidats sans aucun grant", async () => {
    const doomed = await selectClientsWithoutGrants(
      ["cli_spam1", "cli_spam2", "cli_used"],
      async () => ({ clientIds: ["cli_used"] })
    );
    expect(doomed).toEqual(["cli_spam1", "cli_spam2"]);
  });

  it("ne supprime rien si la lecture des grants échoue", async () => {
    const doomed = await selectClientsWithoutGrants(["cli_a"], async () => ({
      failed: true as const,
    }));
    expect(doomed).toEqual([]);
  });
});

describe("IP du client : le dernier relais, jamais l'appelant", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://www.minddy.app/api/oauth/token", { headers });

  it("ignore la valeur de tête que le client a injectée", () => {
    // L'appelant a envoyé « 1.2.3.4 » ; le relais a ajouté la vraie.
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toBe(
      "203.0.113.7"
    );
  });

  it("préfère les en-têtes que la plateforme écrase", () => {
    expect(
      getClientIp(
        req({ "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "203.0.113.7" })
      )
    ).toBe("203.0.113.7");
    expect(
      getClientIp(req({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "203.0.113.7" }))
    ).toBe("203.0.113.7");
  });

  it("retombe sur un bucket partagé plutôt que sur rien", () => {
    expect(getClientIp(req({}))).toBe("unknown");
    expect(getClientIp(req({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});

describe("issuer dérivé de l'environnement", () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
    vi.resetModules();
  });

  const load = async () => (await import("@/lib/server/oauth/issuer")).oauthIssuer();

  it("en production, le domaine canonique — quel que soit l'alias emprunté", async () => {
    vi.resetModules();
    process.env.OAUTH_ISSUER = "";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "minddy-abc123.vercel.app";
    expect(await load()).toBe("https://www.minddy.app");
  });

  it("en preview, le déploiement lui-même", async () => {
    vi.resetModules();
    process.env.OAUTH_ISSUER = "";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "minddy-abc123.vercel.app";
    expect(await load()).toBe("https://minddy-abc123.vercel.app");
  });

  it("OAUTH_ISSUER passe devant, réduit à son origine", async () => {
    vi.resetModules();
    process.env.OAUTH_ISSUER = "https://tunnel.example.com/ignored/path";
    process.env.VERCEL_ENV = "production";
    expect(await load()).toBe("https://tunnel.example.com");
  });
});
