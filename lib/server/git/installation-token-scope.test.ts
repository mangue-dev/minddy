import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-327 — LE TOKEN DE FORGE EST SCOPÉ AU DÉPÔT DU PROJET.
 *
 * `POST /app/installations/{id}/access_tokens` sans corps rend le token MAXIMAL
 * de l'installation : tous ses dépôts, toutes ses permissions. C'est ce token-là
 * qui partait dans le `.git/config` de la microVM de l'agent — lisible par le
 * modèle, exfiltrable par une injection, et il ouvrait alors tous les dépôts
 * privés du compte pour un projet qui n'en a lié qu'un.
 *
 * On teste donc les deux moitiés du contrat : ce que `getInstallationToken`
 * ENVOIE (portée + permissions), et ce que `resolveRepoCloneTarget` lui DEMANDE
 * selon qui détiendra le token. Le `fetch` est faux — c'est la seule chose qui
 * sorte du process ici.
 */

const h = vi.hoisted(() => ({
  /** Les corps de mint réellement envoyés à GitHub, dans l'ordre. */
  minted: [] as Array<Record<string, unknown> | null>,
  link: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.link }) }),
      }),
    }),
  }),
}));

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: vi.fn(async () => null),
}));

import {
  __clearInstallationTokenCacheForTests,
  getInstallationToken,
} from "./github-app";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  h.minted.length = 0;
  h.link = {
    id: "link-1",
    provider: "github",
    connection_id: "conn-1",
    installation_id: 4242,
    repo_full_name: "mangue-dev/minddy",
    default_branch: "main",
  };
  __clearInstallationTokenCacheForTests();
  process.env.GITHUB_APP_ID = "1";
  // Clé de test jetable : `mintAppJwt` signe pour de vrai, il lui faut un PEM.
  process.env.GITHUB_APP_PRIVATE_KEY = TEST_PRIVATE_KEY;

  let n = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/access_tokens")) {
      h.minted.push(init?.body ? JSON.parse(String(init.body)) : null);
      n += 1;
      return new Response(
        JSON.stringify({
          token: `ghs_token_${n}`,
          // Bien au-delà de la fenêtre de sécurité : le cache doit pouvoir jouer.
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("le mint d'un token d'installation", () => {
  it("n'envoie aucun corps quand on ne lui donne pas de portée", async () => {
    // La forme historique reste possible — c'est celle des appels qui énumèrent
    // les dépôts de l'installation, et qui ne PEUVENT pas être scopés à un dépôt.
    await getInstallationToken(4242);
    expect(h.minted).toEqual([null]);
  });

  it("transmet `repositories` et `permissions` tels qu'on les lui donne", async () => {
    await getInstallationToken(4242, {
      repositories: ["minddy"],
      permissions: { contents: "read" },
    });
    expect(h.minted).toEqual([
      { repositories: ["minddy"], permissions: { contents: "read" } },
    ]);
  });

  it("ne resserre PAS un token large en le resservant depuis le cache", async () => {
    // Le piège qu'on garde ici : une clé de cache sur le seul `installationId`
    // rendrait le token maximal du premier appel à un appelant qui a demandé un
    // token restreint. La restriction serait vraie sur le fil, fausse en mémoire.
    const large = await getInstallationToken(4242);
    const etroit = await getInstallationToken(4242, {
      repositories: ["minddy"],
      permissions: { contents: "read" },
    });
    expect(large.token).not.toBe(etroit.token);
    expect(h.minted).toHaveLength(2);
  });

  it("resert le même token à portée ÉGALE, quel que soit l'ordre des clés", async () => {
    const a = await getInstallationToken(4242, {
      repositories: ["b", "a"],
      permissions: { contents: "write", issues: "read" },
    });
    const b = await getInstallationToken(4242, {
      repositories: ["a", "b"],
      permissions: { issues: "read", contents: "write" },
    });
    expect(b.token).toBe(a.token);
    expect(h.minted).toHaveLength(1);
  });
});

describe("la cible de clone d'un projet", () => {
  it("scope TOUJOURS le token au dépôt lié, par son nom court", async () => {
    await resolveRepoCloneTarget("proj-1");
    // `mangue-dev/minddy` et non `minddy` vaudrait 422 chez GitHub : c'est le nom
    // court que `repositories` attend.
    expect(h.minted[0]).toMatchObject({ repositories: ["minddy"] });
  });

  it("ne narrowe pas les permissions du token qui reste dans la fonction", async () => {
    // `full` : c'est lui qui ouvre les PR, commente, relit, merge. Lui retirer
    // des permissions ne bornerait rien de plus (le dépôt est déjà le seul) et
    // casserait les installations qui n'ont pas accepté une permission récente.
    await resolveRepoCloneTarget("proj-1", "full");
    expect(h.minted[0]).not.toHaveProperty("permissions");
  });

  it("donne `contents: write` à la microVM d'un run qui pousse", async () => {
    await resolveRepoCloneTarget("proj-1", "repo-write");
    expect(h.minted[0]).toMatchObject({
      repositories: ["minddy"],
      permissions: { contents: "write" },
    });
  });

  it("donne `contents: read` à la microVM d'une relecture", async () => {
    // Le cœur du ticket : une relecture est le seul ancrage dont le contenu vient
    // d'un fork inconnu, et elle n'écrit rien dans le dépôt.
    await resolveRepoCloneTarget("proj-1", "repo-read");
    expect(h.minted[0]).toMatchObject({
      repositories: ["minddy"],
      permissions: { contents: "read" },
    });
  });

  it("rend des tokens DIFFÉRENTS aux trois profils", async () => {
    const full = await resolveRepoCloneTarget("proj-1", "full");
    const write = await resolveRepoCloneTarget("proj-1", "repo-write");
    const read = await resolveRepoCloneTarget("proj-1", "repo-read");
    expect(new Set([full!.token, write!.token, read!.token]).size).toBe(3);
  });
});

/** PEM jetable, généré au chargement du fichier : `mintAppJwt` signe pour de vrai,
 *  il lui faut une vraie clé — et une clé en dur dans un dépôt, même de test,
 *  ressemble trop à une vraie pour qu'on en pose une ici. */
const TEST_PRIVATE_KEY = crypto
  .generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
