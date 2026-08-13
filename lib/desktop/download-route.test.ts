import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * LE COMPTE DES TÉLÉCHARGEMENTS DE L'APP DE BUREAU (MIN-292).
 *
 * Il ne se voit nulle part : la route rend une redirection, et qu'elle émette
 * ou non son événement ne change rien à l'écran. C'est exactement le genre de
 * câblage qui se débranche sans bruit, et dont on s'aperçoit six mois plus tard
 * devant un graphe plat. D'où ce test.
 *
 * Ce qu'il tient, et qui ne se déduit d'aucun type :
 *   - un événement par `.dmg` réellement servi, et AUCUN quand la route échoue
 *     (flux injoignable, architecture sans fichier) — sinon le compte gonfle de
 *     téléchargements qui n'ont jamais eu lieu ;
 *   - l'identité PostHog du navigateur est REPRISE quand elle existe, pour que
 *     le téléchargement se recouse au parcours qui l'a précédé ;
 *   - sans elle, l'événement part anonyme ET sans profil de personne : le
 *     serveur ne doit pas fabriquer le suivi que le navigateur s'est refusé.
 */

const captureServerEvent = vi.fn();
vi.mock("@/lib/server/posthog", () => ({
  captureServerEvent: (...args: unknown[]) => captureServerEvent(...args),
}));

const FEED = `version: 1.2.0
files:
  - url: minddy-1.2.0-arm64.dmg
    sha512: TFNQaGZ2VXpEZw==
    size: 104857600
  - url: minddy-1.2.0.dmg
    sha512: TFNQaGZ2VXpEZw==
    size: 109857600
path: minddy-1.2.0-arm64.dmg
sha512: TFNQaGZ2VXpEZw==
releaseDate: '2026-08-13T09:12:44.113Z'
`;

const BASE = "https://blob.example.com/desktop";
const POSTHOG_KEY = "phc_test";

/** Le flux répond, ou pas : c'est le seul IO de la route. */
function mockFeed(body: string | null): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      body === null
        ? new Response("nope", { status: 404 })
        : new Response(body, { status: 200 })
    )
  );
}

function request(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, cookie ? { headers: { cookie } } : undefined);
}

/** Le cookie que `posthog-js` pose une fois les cookies acceptés. */
function posthogCookie(distinctId: string): string {
  return `ph_${POSTHOG_KEY}_posthog=${encodeURIComponent(
    JSON.stringify({ distinct_id: distinctId })
  )}`;
}

async function GET(req: NextRequest) {
  const route = await import("@/app/api/desktop/download/route");
  return route.GET(req);
}

beforeEach(() => {
  captureServerEvent.mockClear();
  vi.stubEnv("MINDDY_DESKTOP_FEED_URL", BASE);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", POSTHOG_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/desktop/download", () => {
  it("compte un téléchargement, avec l'architecture et la version servies", async () => {
    mockFeed(FEED);
    const response = await GET(request("https://minddy.app/api/desktop/download"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${BASE}/minddy-1.2.0-arm64.dmg`);
    expect(captureServerEvent).toHaveBeenCalledTimes(1);
    const event = captureServerEvent.mock.calls[0][0];
    expect(event.event).toBe("desktop_download_started");
    expect(event.properties).toMatchObject({ arch: "arm64", version: "1.2.0" });
  });

  it("distingue le lien Intel du bouton principal", async () => {
    mockFeed(FEED);
    await GET(request("https://minddy.app/api/desktop/download?arch=x64"));
    expect(captureServerEvent.mock.calls[0][0].properties).toMatchObject({ arch: "x64" });
  });

  it("ne compte RIEN quand le flux est injoignable — 503, pas de fichier parti", async () => {
    mockFeed(null);
    const response = await GET(request("https://minddy.app/api/desktop/download"));
    expect(response.status).toBe(503);
    expect(captureServerEvent).not.toHaveBeenCalled();
  });

  it("reprend le distinct_id du navigateur quand le cookie existe", async () => {
    mockFeed(FEED);
    await GET(
      request("https://minddy.app/api/desktop/download", posthogCookie("visiteur-42"))
    );
    const event = captureServerEvent.mock.calls[0][0];
    expect(event.distinctId).toBe("visiteur-42");
    // Identité connue : le profil de personne se met à jour comme d'habitude.
    expect(event.properties).not.toHaveProperty("$process_person_profile");
  });

  it("part anonyme et SANS profil de personne quand il n'y a pas de cookie", async () => {
    mockFeed(FEED);
    await GET(request("https://minddy.app/api/desktop/download"));
    const event = captureServerEvent.mock.calls[0][0];
    expect(event.distinctId).toEqual(expect.any(String));
    expect(event.distinctId).not.toBe("");
    expect(event.properties.$process_person_profile).toBe(false);
  });

  it("tire un id neuf à chaque téléchargement anonyme — jamais un identifiant stable", async () => {
    mockFeed(FEED);
    await GET(request("https://minddy.app/api/desktop/download"));
    await GET(request("https://minddy.app/api/desktop/download"));
    const [first, second] = captureServerEvent.mock.calls.map((call) => call[0].distinctId);
    expect(first).not.toBe(second);
  });
});
