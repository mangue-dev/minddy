import { describe, expect, it } from "vitest";

import {
  deploymentScopeFromEnv,
  previewKickTargets,
  PREVIEW_KICK_MAX_TARGETS,
  PREVIEW_STALE_AFTER_MS,
} from "./deployment";

/**
 * Run deployment affinity (MIN-165).
 *
 * What matters here: the `null` scope. It is he who decides if the drain of the
 * PROD resumes a run - to be wrong in this sense, this is exactly the original bug,
 * a chunk of prod which resumes the checkpoint of a preview. And it is also the
 * perimeter of the local station, on which the launch recipe depends.
 */

const NOW = Date.parse("2026-08-02T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("deploymentScopeFromEnv", () => {
  it("production draine la file commune", () => {
    expect(
      deploymentScopeFromEnv({ VERCEL_ENV: "production", VERCEL_URL: "minddy-prod.vercel.app" }),
    ).toBeNull();
  });

  it("preview draine son propre déploiement", () => {
    expect(
      deploymentScopeFromEnv({ VERCEL_ENV: "preview", VERCEL_URL: "minddy-abc123.vercel.app" }),
    ).toBe("minddy-abc123.vercel.app");
  });

  it("preview sans VERCEL_URL retombe sur la file commune", () => {
    // Ne devrait pas arriver (Vercel pose toujours VERCEL_URL) — mais un preview
    // stamping `""` would create a run that NO ONE drains.
    expect(deploymentScopeFromEnv({ VERCEL_ENV: "preview" })).toBeNull();
    expect(deploymentScopeFromEnv({ VERCEL_ENV: "preview", VERCEL_URL: "  " })).toBeNull();
  });

  it("local (pas de VERCEL_ENV) draine la file commune", () => {
    // The drain launched from the station must continue to resume production runs.
    expect(deploymentScopeFromEnv({})).toBeNull();
    expect(deploymentScopeFromEnv({ VERCEL_URL: "minddy-abc123.vercel.app" })).toBeNull();
  });
});

describe("previewKickTargets", () => {
  const fresh = (id: string, url: string | null) => ({
    id,
    deployment_url: url,
    not_before: ago(30_000),
  });

  it("dédoublonne les URLs : un réveil par déploiement, pas par run", () => {
    const { urls, stalledRunIds } = previewKickTargets(
      [fresh("a", "p1.vercel.app"), fresh("b", "p1.vercel.app"), fresh("c", "p2.vercel.app")],
      { now: NOW, staleAfterMs: PREVIEW_STALE_AFTER_MS },
    );
    expect(urls).toEqual(["p1.vercel.app", "p2.vercel.app"]);
    expect(stalledRunIds).toEqual([]);
  });

  it("plafonne le nombre de déploiements réveillés par tick", () => {
    const rows = Array.from({ length: PREVIEW_KICK_MAX_TARGETS + 3 }, (_, i) =>
      fresh(`r${i}`, `p${i}.vercel.app`),
    );
    const { urls } = previewKickTargets(rows, { now: NOW, staleAfterMs: PREVIEW_STALE_AFTER_MS });
    expect(urls).toHaveLength(PREVIEW_KICK_MAX_TARGETS);
    expect(urls[0]).toBe("p0.vercel.app"); // oldest first (SELECT order)
  });

  it("ignore la file commune — la prod vient de la drainer", () => {
    expect(
      previewKickTargets([fresh("a", null)], { now: NOW, staleAfterMs: PREVIEW_STALE_AFTER_MS }),
    ).toEqual({ urls: [], stalledRunIds: [] });
  });

  it("déclare orphelin AU-DELÀ du seuil, pas au seuil", () => {
    const atThreshold = {
      id: "at",
      deployment_url: "p1.vercel.app",
      not_before: ago(PREVIEW_STALE_AFTER_MS),
    };
    const past = {
      id: "past",
      deployment_url: "p2.vercel.app",
      not_before: ago(PREVIEW_STALE_AFTER_MS + 1_000),
    };
    const { urls, stalledRunIds } = previewKickTargets([atThreshold, past], {
      now: NOW,
      staleAfterMs: PREVIEW_STALE_AFTER_MS,
    });
    expect(urls).toEqual(["p1.vercel.app"]);
    expect(stalledRunIds).toEqual(["past"]);
  });

  it("un run récent réveille encore son déploiement malgré un orphelin voisin", () => {
    // An isolated run which has missed its turn does not condemn the deployment: it is
    // difference between “this preview is dead” and “this run is lost”.
    const { urls, stalledRunIds } = previewKickTargets(
      [
        { id: "old", deployment_url: "p1.vercel.app", not_before: ago(20 * 60_000) },
        fresh("new", "p1.vercel.app"),
      ],
      { now: NOW, staleAfterMs: PREVIEW_STALE_AFTER_MS },
    );
    expect(urls).toEqual(["p1.vercel.app"]);
    expect(stalledRunIds).toEqual(["old"]);
  });

  it("un not_before illisible réveille, il ne condamne pas", () => {
    const { urls, stalledRunIds } = previewKickTargets(
      [{ id: "weird", deployment_url: "p1.vercel.app", not_before: "pas une date" }],
      { now: NOW, staleAfterMs: PREVIEW_STALE_AFTER_MS },
    );
    expect(urls).toEqual(["p1.vercel.app"]);
    expect(stalledRunIds).toEqual([]);
  });
});
