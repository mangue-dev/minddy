import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

/**
 * MIN-351 — CE QUE LE PROXY DIT AU RENDU, ET CE QU'IL RAPPORTE AU NAVIGATEUR.
 *
 * Deux défauts qui n'ont en commun que leur adresse, `proxy.ts` :
 *
 *  - **Les en-têtes de confiance n'étaient pas nettoyés.** `x-minddy-public`,
 *    `x-minddy-locale`, `x-minddy-route` sont des affirmations du proxy que le
 *    root layout et next-intl croient sur parole. Rien n'empêchait le client de
 *    les envoyer lui-même : un `curl -H 'x-minddy-public: 1'` et le rendu d'une
 *    page de l'app basculait sur le décor du site public.
 *  - **MIN-293 était toujours vivant ici.** `readSession` lit la session avec un
 *    adaptateur au `setAll` vide : jeton expiré, GoTrue rend un couple neuf et
 *    fait tourner le jeton de rafraîchissement — le proxy le DÉPENSAIT puis le
 *    jetait. Le navigateur gardait l'ancien, mort. C'est la déconnexion
 *    silencieuse, corrigée côté routes et pas côté proxy.
 *
 * Ce qu'on moque : `@supabase/ssr`, la seule frontière réseau. Tout le reste —
 * le vrai proxy, ses branches, ses en-têtes — s'exécute.
 *
 * Comment on observe ce qui atteint le rendu : `NextResponse.next({ request })`
 * publie les en-têtes de requête réécrits sous `x-middleware-request-*`, et leur
 * liste sous `x-middleware-override-headers`. C'est littéralement ce que Next
 * repassera au layout.
 */

type SetAll = (c: { name: string; value: string; options: CookieOptions }[]) => void;

/** Ce que la lib « rendrait » à écrire au prochain appel de getSession. */
let refreshed: { name: string; value: string; options: CookieOptions }[] = [];
let session: { user: { id: string }; access_token?: string } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: SetAll } }) => ({
    auth: {
      getSession: async () => {
        options.cookies.setAll(refreshed);
        return { data: { session } };
      },
    },
  }),
}));

const { proxy } = await import("@/proxy");

const HOST = "www.minddy.app";

function request(pathname: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://${HOST}${pathname}`, {
    headers: { host: HOST, ...headers },
  });
}

/** Les en-têtes de requête que le proxy laisse passer jusqu'au rendu. */
function forwardedHeaders(response: { headers: Headers }): Record<string, string> {
  const names = response.headers.get("x-middleware-override-headers");
  if (!names) return {};
  return Object.fromEntries(
    names
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => [n, response.headers.get(`x-middleware-request-${n}`) ?? ""]),
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  refreshed = [];
  session = null;
});

describe("en-têtes de confiance envoyés par le client", () => {
  it.each([
    ["/login", "une route publique"],
    ["/home", "une route de l'app"],
    ["/f/tok", "un board public"],
  ])("n'atteint pas le rendu sur %s (%s)", async (pathname) => {
    // /home est protégée : une session, sinon on part en redirection vers /login.
    session = { user: { id: "u1" } };

    const response = await proxy(
      request(pathname, {
        "x-minddy-public": "1",
        "x-minddy-locale": "fr",
        "x-minddy-route": "pricing",
      }),
    );

    const forwarded = forwardedHeaders(response);
    expect(forwarded["x-minddy-locale"]).toBeUndefined();
    expect(forwarded["x-minddy-route"]).toBeUndefined();
    // `/f/` est un site public : le proxy y pose LUI-MÊME le drapeau. Ce qui
    // compte est qu'il vienne de lui — d'où le nettoyage systématique, y compris
    // là où la valeur finale est la même.
    if (!pathname.startsWith("/f/")) {
      expect(forwarded["x-minddy-public"]).toBeUndefined();
    }
  });

  it("laisse le proxy poser les siens sur une page publique localisée", async () => {
    const response = await proxy(request("/fr/tarifs", { "x-minddy-public": "0" }));
    const forwarded = forwardedHeaders(response);

    expect(forwarded["x-minddy-public"]).toBe("1");
    expect(forwarded["x-minddy-locale"]).toBe("fr");
    expect(forwarded["x-minddy-route"]).toBe("pricing");
  });
});

describe("cookies rafraîchis pendant la lecture de session (MIN-293)", () => {
  const OPTIONS = { path: "/", sameSite: "lax" as const };

  beforeEach(() => {
    refreshed = [
      { name: "sb-access-token", value: "neuf", options: OPTIONS },
      { name: "sb-refresh-token", value: "aussi-neuf", options: OPTIONS },
    ];
  });

  it("repart avec la réponse sur /login (visiteur déconnecté)", async () => {
    const response = await proxy(request("/login"));

    expect(response.cookies.get("sb-access-token")?.value).toBe("neuf");
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("aussi-neuf");
  });

  it("repart avec la REDIRECTION vers /home (visiteur déjà connecté)", async () => {
    session = { user: { id: "u1" } };

    const response = await proxy(request("/login"));

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-access-token")?.value).toBe("neuf");
  });

  it("repart avec la landing servie à un visiteur déconnecté", async () => {
    const response = await proxy(request("/"));

    expect(response.cookies.get("sb-access-token")?.value).toBe("neuf");
  });

  it("porte `Secure` en production, pas en développement", async () => {
    const response = await proxy(request("/login"));
    // Le test tourne en NODE_ENV=test : le drapeau suit `production`, comme les
    // trois autres cookies écrits à la main par le dépôt.
    expect(response.cookies.get("sb-access-token")?.secure).toBe(
      process.env.NODE_ENV === "production",
    );
  });
});
